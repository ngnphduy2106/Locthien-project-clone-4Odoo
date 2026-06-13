// One-off: đẩy bù ảnh chứng từ của các đơn test hoàn thành bằng code cũ
// (ảnh kẹt base64 trong export_tickets, chưa từng lên CDN/Odoo).
// Chạy: node scripts/backfill_proofs.mjs
import 'dotenv/config';
import { supabase } from '../server/db/supabase.js';
import { uploadImages } from '../server/services/storage.js';
import { pushProofToOdoo, saveProofUrls } from '../server/services/odoo-proof.js';

const TARGETS = [1166, 1156]; // PO2606011, PO2606008

for (const odooId of TARGETS) {
  const { data: ticket } = await supabase
    .from('export_tickets')
    .select('id, ticket_no, images')
    .or(`order_id.eq.${odooId},order_no.eq.${odooId}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let images = ticket?.images || [];
  if (typeof images === 'string') { try { images = JSON.parse(images); } catch { images = [images]; } }
  if (!Array.isArray(images)) images = [images];
  images = images.filter(i => typeof i === 'string' && i.length > 50);
  console.log(`\n=== odoo#${odooId} (${ticket?.ticket_no || 'no ticket'}): ${images.length} ảnh`);
  if (!images.length) continue;

  // 1. Upload CDN
  const urls = await uploadImages(images, `odoo_${odooId}`);
  const httpUrls = urls.filter(u => u && u.startsWith('http'));
  console.log(`CDN: ${httpUrls.length}/${images.length}`);

  // 2. Lưu URL vào odoo_orders.proof_images (nguồn cron Odoo pull bù)
  await saveProofUrls(odooId, httpUrls);

  // 3. Push thẳng sang Odoo (tab "Chứng từ xác thực")
  const r = await pushProofToOdoo('sale.order', odooId, images);
  console.log(`Odoo: pushed=${r.pushed} failed=${r.failed}`);

  // 4. Thay base64 trong ticket bằng URL CDN (giảm dung lượng row)
  if (ticket && httpUrls.length) {
    const updated = images.map((img, i) => urls[i]?.startsWith('http') ? urls[i] : img);
    await supabase.from('export_tickets').update({ images: updated }).eq('id', ticket.id);
    console.log(`Ticket ${ticket.ticket_no}: đã thay base64 → CDN URL`);
  }
}
console.log('\nDONE');
