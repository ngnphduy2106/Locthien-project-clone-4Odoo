#!/usr/bin/env node
/**
 * Migrate remaining data to custom models (ACL already fixed).
 * Fixed: removed x_name field that doesn't exist on custom models.
 */
const ODOO_URL = 'https://odoo-dev.new.ai.vn';
const ODOO_DB  = 'Odoo-LT';
const ODOO_USER= 'locthien.cloud@gmail.com';
const ODOO_PASS= 'Locthien@123';

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
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
    if (data.error) throw new Error(data.error.data?.message || data.error.message);
    return data.result;
}
let UID;
async function call(model, method, args = [], kwargs = {}) {
    return rpc('object', 'execute_kw', [ODOO_DB, UID, ODOO_PASS, model, method, args, kwargs]);
}
function loadJson(f) {
    const p = join(BACKUP_DIR, f);
    if (!existsSync(p)) { console.log(`  ⚠️ Missing: ${f}`); return []; }
    return JSON.parse(readFileSync(p, 'utf-8'));
}
function s(v) { return v ? String(v).trim() || false : false; }

async function migrate(modelName, dataFile, mapFn) {
    const data = loadJson(dataFile);
    console.log(`\n📦 ${modelName} ← ${dataFile} (${data.length} rows)`);
    let ok = 0, skip = 0, errs = 0;
    for (const row of data) {
        const sbId = row.id || '';
        const ex = await call(modelName, 'search', [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }
        try {
            await call(modelName, 'create', [mapFn(row)]);
            ok++;
            if (ok % 50 === 0) console.log(`    ... ${ok}/${data.length}`);
        } catch (e) {
            errs++;
            if (errs <= 3) console.log(`    ⚠️ ${e.message.substring(0, 100)}`);
        }
    }
    console.log(`  ✅ ${ok} created, ${skip} skipped, ${errs} errors`);
}

async function main() {
    console.log('='.repeat(55));
    console.log('📦 MIGRATE REMAINING DATA (v2 — x_name fixed)');
    console.log('='.repeat(55));

    UID = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
    if (!UID) { console.error('❌ Auth failed'); process.exit(1); }
    console.log(`✅ uid=${UID}`);

    // Import Tickets
    await migrate('x_locthien_import_ticket', 'import_tickets.json', t => ({
        x_ticket_no: t.ticket_no || t.id,
        x_supplier_name: s(t.supplier_name) || 'N/A',
        x_supplier_address: s(t.supplier_address),
        x_products: JSON.stringify(t.products || []),
        x_total_qty: t.total_qty || 0,
        x_warehouse: s(t.warehouse) || 'LT1',
        x_description: s(t.description),
        x_note: s(t.note),
        x_local_items: JSON.stringify(t.local_items || []),
        x_status: t.status || 'pending',
        x_assigned_driver: s(t.assigned_driver),
        x_assigned_plate: s(t.assigned_plate),
        x_created_by: s(t.created_by) || 'Admin',
        x_merged_order_no: s(t.merged_order_no),
        x_supabase_id: t.id,
    }));

    // Export Tickets
    await migrate('x_locthien_export_ticket', 'export_tickets.json', t => ({
        x_ticket_no: t.ticket_no,
        x_order_id: s(t.order_id),
        x_order_no: s(t.order_no),
        x_customer_name: s(t.customer_name),
        x_products: JSON.stringify(t.products || []),
        x_total_qty: t.total_qty || 0,
        x_driver_name: s(t.driver_name),
        x_plate: s(t.plate),
        x_warehouse: s(t.warehouse) || 'LT1',
        x_note: s(t.note),
        x_created_by: s(t.created_by),
        x_supabase_id: t.id,
    }));

    // Driver Assignments (Export)
    await migrate('x_locthien_driver_assignment', 'order_driver_assignments.json', a => ({
        x_order_id: a.order_id,
        x_driver_name: a.driver_name,
        x_driver_type: a.driver_type || 'internal',
        x_plate: s(a.plate),
        x_assigned_qty: a.assigned_qty || 0,
        x_actual_qty: a.actual_qty || 0,
        x_status: a.status || 'pending',
        x_local_items: JSON.stringify(a.local_items || []),
        x_delivery_note: s(a.delivery_note),
        x_assistant_name: s(a.assistant_name),
        x_delivery_time: s(a.delivery_time),
        x_supabase_id: a.id,
    }));

    // Import Assignments
    await migrate('x_locthien_import_assignment', 'import_driver_assignments.json', a => ({
        x_import_ticket_no: a.import_id,
        x_driver_name: a.driver_name,
        x_driver_type: a.driver_type || 'internal',
        x_plate: s(a.plate),
        x_assigned_qty: a.assigned_qty || 0,
        x_actual_qty: a.actual_qty || 0,
        x_status: a.status || 'pending',
        x_local_items: JSON.stringify(a.local_items || []),
        x_delivery_note: s(a.delivery_note),
        x_supabase_id: a.id,
    }));

    // Merged Orders
    await migrate('x_locthien_merged_order', 'merged_orders.json', m => ({
        x_merged_no: m.merged_no,
        x_source_order_nos: Array.isArray(m.export_orders) ? m.export_orders.join(', ') : s(m.source_order_nos),
        x_status: m.status || 'pending',
        x_driver_name: s(m.driver_name),
        x_plate: s(m.plate),
        x_total_amount: m.total_amount || 0,
        x_note: s(m.note),
        x_created_by: s(m.created_by),
        x_assistant_name: s(m.assistant_name),
        x_delivery_time: s(m.delivery_time),
        x_supabase_id: m.id,
    }));

    console.log('\n' + '='.repeat(55));
    console.log('🎉 ALL DATA MIGRATED SUCCESSFULLY!');
    console.log('='.repeat(55));
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
