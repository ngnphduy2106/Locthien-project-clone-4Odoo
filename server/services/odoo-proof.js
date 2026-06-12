// ===============================================
// ODOO PROOF SERVICE — Push ảnh xác nhận giao hàng sang Odoo
// ===============================================
// Tài xế hoàn thành đơn (bắt buộc ảnh) → push từng ảnh sang webhook Odoo
// có sẵn:  POST {ODOO_URL}/lt/erp/delivery_proof/<model>/<odoo_id>
//   - multipart field `file`, header X-LT-Secret = env LT_WEBHOOK_SECRET
//   - Odoo tạo ir.attachment + gắn tab "📎 Chứng từ xác thực" + chatter.
// Best-effort: lỗi chỉ log — Layer 3 (cron Odoo 1 phút) sẽ tự pull bù
// qua cột odoo_orders.proof_images (URL Supabase CDN).

import { config } from '../integration/config.js';
import { supabase } from '../db/supabase.js';

const SECRET = (process.env.LT_WEBHOOK_SECRET || '').trim();

/** Parse 1 ảnh đầu vào (base64 data-URL hoặc http URL) → {buffer, mime, filename} */
async function toFilePart(img, idx) {
    if (typeof img !== 'string' || !img) return null;

    // Ảnh đã là URL (Supabase CDN) → tải về buffer
    if (img.startsWith('http://') || img.startsWith('https://')) {
        const res = await fetch(img, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`fetch ${img} → HTTP ${res.status}`);
        const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
        const buffer = Buffer.from(await res.arrayBuffer());
        const filename = decodeURIComponent(img.split('/').pop() || `proof_${idx}.jpg`);
        return { buffer, mime, filename };
    }

    // Base64 data URL: data:image/webp;base64,....
    const m = img.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return null;
    const mime = m[1] === 'image/jpg' ? 'image/jpeg' : m[1];
    const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
    return {
        buffer: Buffer.from(m[2], 'base64'),
        mime,
        filename: `proof_${Date.now()}_${idx}.${ext}`,
    };
}

/**
 * Push danh sách ảnh sang Odoo (tuần tự, best-effort).
 * @param {'sale.order'|'purchase.order'} model
 * @param {number} odooId - ID bản ghi Odoo
 * @param {string[]} images - base64 data-URL hoặc http URL
 * @returns {Promise<{pushed:number, failed:number}>}
 */
export async function pushProofToOdoo(model, odooId, images) {
    const result = { pushed: 0, failed: 0 };
    if (!images?.length || !odooId) return result;
    if (!config.odoo.url) {
        console.warn('⚠️ [odoo-proof] ODOO_URL chưa config — skip push');
        return result;
    }
    if (!SECRET) {
        console.warn('⚠️ [odoo-proof] LT_WEBHOOK_SECRET chưa config — skip push (cron Odoo sẽ pull bù)');
        return result;
    }

    const url = `${config.odoo.url}/lt/erp/delivery_proof/${model}/${odooId}`;
    for (let i = 0; i < images.length; i++) {
        try {
            const part = await toFilePart(images[i], i);
            if (!part) { result.failed++; continue; }

            const form = new FormData();
            form.append('file', new Blob([part.buffer], { type: part.mime }), part.filename);

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'X-LT-Secret': SECRET },
                body: form,
                signal: AbortSignal.timeout(20000),
            });
            const body = await res.json().catch(() => ({}));
            if (res.ok && body.ok) {
                result.pushed++;
                console.log(`📤 [odoo-proof] Pushed ${part.filename} → ${model}#${odooId} (att ${body.attachment_id})`);
            } else {
                result.failed++;
                console.warn(`⚠️ [odoo-proof] Push fail ${model}#${odooId}: HTTP ${res.status}`, body.error || '');
            }
        } catch (e) {
            result.failed++;
            console.warn(`⚠️ [odoo-proof] Push exception ${model}#${odooId}:`, e.message);
        }
    }
    return result;
}

/**
 * Ghi URL ảnh vào odoo_orders.proof_images (nguồn cho cron Odoo pull bù).
 * Merge với URL đã có, không trùng lặp.
 */
export async function saveProofUrls(odooId, urls) {
    const httpUrls = (urls || []).filter(u => typeof u === 'string' && u.startsWith('http'));
    if (!httpUrls.length || !odooId) return;
    try {
        const { data } = await supabase
            .from('odoo_orders')
            .select('proof_images')
            .eq('odoo_id', odooId)
            .maybeSingle();
        const existing = Array.isArray(data?.proof_images) ? data.proof_images : [];
        const merged = [...new Set([...existing, ...httpUrls])];
        const { error } = await supabase
            .from('odoo_orders')
            .update({ proof_images: merged, synced_at: new Date().toISOString() })
            .eq('odoo_id', odooId);
        if (error) throw error;
        console.log(`💾 [odoo-proof] Saved ${httpUrls.length} proof URLs → odoo_orders#${odooId}`);
    } catch (e) {
        console.warn(`⚠️ [odoo-proof] saveProofUrls(${odooId}) fail:`, e.message);
    }
}

/**
 * Hook cho các luồng hoàn thành ERP-native: nếu đơn có link tới Odoo
 * (tra odoo_orders theo name/số đơn) → lưu URL + push ảnh sang Odoo.
 * Gọi best-effort sau khi uploadImages() xong — không throw.
 * @param {string} orderRef - số đơn (vd 'SO0123') hoặc tên đơn Odoo
 * @param {string[]} urls - URL ảnh đã upload lên Supabase Storage
 */
export async function syncProofIfOdooLinked(orderRef, urls) {
    if (!orderRef || !urls?.length) return;
    try {
        const ref = String(orderRef).trim();
        // Tra theo name ('SO0123'…); orderRef là số thuần → tra thêm odoo_id
        // (luồng native dùng id = odoo_id khi đơn không có trong bảng orders ERP)
        let query = supabase
            .from('odoo_orders')
            .select('odoo_id, name, proof_images');
        query = /^\d+$/.test(ref)
            ? query.or(`name.eq.${ref},odoo_id.eq.${ref}`)
            : query.eq('name', ref);
        const { data } = await query.maybeSingle();
        if (!data?.odoo_id) return;     // đơn ERP thuần, không link Odoo

        // Dedupe: chỉ xử lý URL chưa từng sync (chống push lặp khi gọi từ
        // nhiều hook point / retry)
        const existing = Array.isArray(data.proof_images) ? data.proof_images : [];
        const newUrls = urls.filter(u =>
            typeof u === 'string' && u.startsWith('http') && !existing.includes(u));
        if (!newUrls.length) return;

        await saveProofUrls(data.odoo_id, newUrls);
        await pushProofToOdoo('sale.order', data.odoo_id, newUrls);
    } catch (e) {
        console.warn(`⚠️ [odoo-proof] syncProofIfOdooLinked(${orderRef}) fail:`, e.message);
    }
}
