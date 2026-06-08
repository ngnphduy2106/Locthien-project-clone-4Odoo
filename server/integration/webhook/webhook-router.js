import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { dispatchService } from '../service/dispatch-service.js';

/**
 * Router POST /odoo-webhook
 *
 *  - Verify HMAC-SHA256(body, WEBHOOK_SECRET) qua header `X-Odoo-Signature`.
 *  - Idempotent qua header `X-Idempotency-Key` — chống Odoo gửi lại cùng event.
 *  - Phân nhánh theo `event`:
 *      order.ready_for_dispatch | order.delivery_started | order.delivered
 *
 *  Trả về 401 nếu signature sai, 200 + {status:'duplicate'} nếu trùng,
 *  200 + {status:'ok'} nếu OK, 500 nếu xử lý fail.
 */
const router = express.Router();

// Lưu key đã xử lý — production thay bằng Redis / DB
const processedKeys = new Set();
const MAX_CACHE = 10_000;

/**
 * Verify HMAC. Chấp nhận 2 format:
 *   - "sha256=<hex>"  (Odoo Python locthien_*_workflow gửi header X-LT-Signature)
 *   - "<hex>"          (smoke test cũ + header X-Odoo-Signature)
 * `timingSafeEqual` tránh timing attack.
 */
function verifySignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  // Strip "sha256=" prefix nếu có
  const hex = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;
  const expected = crypto
    .createHmac('sha256', config.webhook.secret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(hex, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// raw body parser CỦA router (standalone). Khi nhúng vào app có sẵn,
// nếu trước đó đã có `express.json()` thì body sẽ thành object —
// handler bên dưới tự đọc `req.rawBody` (do verify callback của
// express.json gắn). Xem hướng dẫn ở mountWebhookRouter().
router.post('/odoo-webhook',
  express.raw({ type: 'application/json', limit: '5mb' }),
  async (req, res) => {
    // Ưu tiên rawBody (chế độ embedded), fallback req.body Buffer (standalone)
    const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody
              : Buffer.isBuffer(req.body)     ? req.body
              : Buffer.from(JSON.stringify(req.body ?? {}));
    const sig = req.header('X-LT-Signature') || req.header('X-Odoo-Signature');
    const key = req.header('X-Idempotency-Key');

    if (!verifySignature(raw, sig)) {
      return res.status(401).json({ status: 'invalid_signature' });
    }

    if (key && processedKeys.has(key)) {
      return res.status(200).json({ status: 'duplicate' });
    }

    /** @type {import('./payload-types.js').OdooWebhookPayload} */
    let payload;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch (e) {
      return res.status(400).json({ status: 'invalid_json', error: e.message });
    }

    try {
      switch (payload.event) {
        case 'order.ready_for_dispatch':
          await dispatchService.onReadyForDispatch(payload);
          break;
        case 'order.delivery_started':
          await dispatchService.onDeliveryStarted(payload);
          break;
        case 'order.delivered':
          await dispatchService.onDelivered(payload);
          break;
        case 'order.pushed_misa':
          await dispatchService.onPushedMisa(payload);
          break;
        case 'po.ready_for_pickup':
          await dispatchService.onPoReadyForPickup(payload);
          break;
        case 'po.received':
          await dispatchService.onPoReceived(payload);
          break;
        case 'order.synced':
          // Re-sync event — chỉ upsert tên + metadata, không trigger downstream action
          await dispatchService.onOrderSynced(payload);
          break;
        case 'po.synced':
          await dispatchService.onPoSynced(payload);
          break;
        default:
          console.warn('[webhook] event chưa hỗ trợ:', payload.event);
      }
    } catch (e) {
      console.error('[webhook] xử lý fail:', e);
      return res.status(500).json({ status: 'error', error: e.message });
    }

    if (key) {
      if (processedKeys.size >= MAX_CACHE) processedKeys.clear();
      processedKeys.add(key);
    }
    return res.status(200).json({ status: 'ok' });
  }
);

export { router as webhookRouter };
