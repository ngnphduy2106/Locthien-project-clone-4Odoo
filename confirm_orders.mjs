#!/usr/bin/env node
/**
 * Confirm all draft sale orders → move from Báo giá to Đơn hàng
 * Reads original MISA status from order notes to determine target state.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ODOO_URL = 'https://odoo-dev.new.ai.vn';
const ODOO_DB  = 'Odoo-LT';
const ODOO_USER= 'locthien.cloud@gmail.com';
const ODOO_PASS= 'Locthien@123';
const BACKUP_DIR = join(__dirname, 'backups', 'backup_2026-05-20_154157');

let rpcId = 0;
async function rpc(service, method, args) {
    rpcId++;
    const res = await fetch(`${ODOO_URL}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: rpcId,
            params: { service, method, args } }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.data?.message || data.error.message || 'RPC Error');
    return data.result;
}

async function call(uid, model, method, args = [], kwargs = {}) {
    return rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_PASS, model, method, args, kwargs]);
}

async function main() {
    console.log('🔄 Confirming draft orders → Đơn hàng...');

    const uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
    if (!uid) { console.error('❌ Auth failed'); process.exit(1); }
    console.log(`✅ Authenticated uid=${uid}`);

    // Load original orders to check status
    const ordersPath = join(BACKUP_DIR, 'orders.json');
    const origOrders = JSON.parse(readFileSync(ordersPath, 'utf-8'));

    // Build map: supabase_id → MISA status
    const statusMap = {};
    for (const o of origOrders) {
        statusMap[o.id] = o.status || 'Chưa thực hiện';
    }

    // Find all draft orders (Báo giá)
    const draftIds = await call(uid, 'sale.order', 'search',
        [[['state', '=', 'draft']]], { order: 'id asc' });
    console.log(`📋 Found ${draftIds.length} draft orders to confirm`);

    if (draftIds.length === 0) {
        console.log('✅ No draft orders to confirm');
        return;
    }

    // Read order data to get client_order_ref (= supabase ID)
    const orders = await call(uid, 'sale.order', 'read', [draftIds],
        { fields: ['id', 'client_order_ref', 'order_line'] });

    let confirmed = 0, cancelled = 0, skipped = 0, errors = 0;

    // Process in batches of 10 for stability
    for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const sbId = order.client_order_ref || '';
        const misaStatus = statusMap[sbId] || 'Đã thực hiện';

        // Skip orders without order lines (can't confirm)
        if (!order.order_line || order.order_line.length === 0) {
            skipped++;
            continue;
        }

        try {
            if (misaStatus === 'Đã hủy bỏ') {
                // Cancel
                await call(uid, 'sale.order', 'action_cancel', [[order.id]]);
                cancelled++;
            } else {
                // Confirm (Đã thực hiện, Đang thực hiện, Chưa thực hiện)
                await call(uid, 'sale.order', 'action_confirm', [[order.id]]);
                confirmed++;
            }

            if ((confirmed + cancelled) % 50 === 0) {
                console.log(`    ... ${confirmed + cancelled}/${orders.length} processed`);
            }
        } catch (e) {
            errors++;
            if (errors <= 5) {
                console.log(`    ⚠️ Order #${order.id} (${sbId}): ${e.message.substring(0, 100)}`);
            }
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎉 DONE!`);
    console.log(`   ✅ Confirmed (→ Đơn hàng): ${confirmed}`);
    console.log(`   🚫 Cancelled: ${cancelled}`);
    console.log(`   ⏭️  Skipped (no lines): ${skipped}`);
    console.log(`   ⚠️  Errors: ${errors}`);
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
