// Test: Lấy đơn PO4100137022.25 từ MISA CRM rồi gửi Telegram
import dotenv from 'dotenv';
dotenv.config();

import { getMisaOrders } from '../server/services/misa.js';
import { sendTelegramMessage, getNotifyGroupMentions } from '../server/services/telegram.js';

console.log('📡 Đang lấy đơn từ MISA CRM...');
const misaOrders = await getMisaOrders(0, false);

const TARGET = 'PO4100137022.25';
const item = misaOrders.find(o => (o.sale_order_no || '').includes('37022'));

if (!item) {
    console.log(`❌ Không tìm thấy đơn ${TARGET}`);
    console.log('Các đơn có:', misaOrders.slice(0, 10).map(o => o.sale_order_no).join(', '));
    process.exit(1);
}

const saleOrderNo = item.sale_order_no;
console.log(`\n📦 Đơn: ${saleOrderNo}`);
console.log(`   Khách: ${item.account_name}`);
console.log(`   Địa chỉ: ${item.shipping_address || 'N/A'}`);

const productsList = (item.sale_order_product_mappings || [])
    .map(p => `- ${p.product_name || p.description || p.product_code}: ${Number(p.usage_unit_amount || p.amount || 0).toLocaleString('vi-VN')} ${p.unit || 'kg'}`)
    .join('\n');

let formattedDate = 'N/A';
if (item.sale_order_date) {
    try {
        formattedDate = new Date(item.sale_order_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    } catch (e) {
        formattedDate = item.sale_order_date.split('T')[0];
    }
}

let msg = `🆕 <b>ĐƠN HÀNG MỚI TỪ MISA</b>\n`;
msg += `📦 Mã: <b>${saleOrderNo}</b>\n`;
msg += `📅 Ngày: ${formattedDate}\n`;
msg += `👤 Khách: ${item.account_name || 'N/A'}\n`;
msg += `📍 Địa chỉ: ${item.shipping_address || 'N/A'}\n`;

if (productsList) {
    msg += `\n📋 <b>Sản phẩm:</b>\n${productsList}\n`;
}

msg += `\n🔔 ${getNotifyGroupMentions()} (Vào Điều Phối gán tài xế)`;

console.log('\n--- Telegram Message ---');
console.log(msg);
console.log('------------------------');

await sendTelegramMessage(msg, 'SALES');
setTimeout(() => process.exit(0), 2000);
