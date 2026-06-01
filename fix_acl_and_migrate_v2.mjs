#!/usr/bin/env node
/**
 * Fix: Add ACL for custom models, then migrate remaining data
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
    if (!existsSync(p)) { console.log(`  âš ï¸ Missing: ${f}`); return []; }
    const d = JSON.parse(readFileSync(p, 'utf-8'));
    console.log(`  ðŸ“‚ ${f}: ${d.length} rows`);
    return d;
}
function s(v) { return v ? String(v).trim() || false : false; }

// ============================================================
// STEP 1: Grant ACL for all custom models
// ============================================================
async function grantAccess() {
    console.log('\nðŸ” Granting access rights for custom models...');

    const models = [
        'x_locthien_import_ticket',
        'x_locthien_export_ticket',
        'x_locthien_merged_order',
        'x_locthien_driver_assignment',
        'x_locthien_import_assignment',
    ];

    // Get base.group_user ID (all internal users)
    const groupIds = await call('ir.model.data', 'search_read',
        [[['module', '=', 'base'], ['name', '=', 'group_user']]],
        { fields: ['res_id'], limit: 1 });
    const groupId = groupIds.length ? groupIds[0].res_id : false;
    console.log(`  Group base.group_user ID: ${groupId}`);

    for (const modelName of models) {
        // Get model ID
        const mIds = await call('ir.model', 'search', [[['model', '=', modelName]]], { limit: 1 });
        if (!mIds.length) { console.log(`  âš ï¸ ${modelName} not found`); continue; }

        // Check if ACL already exists
        const existing = await call('ir.model.access', 'search',
            [[['model_id', '=', mIds[0]], ['group_id', '=', groupId]]], { limit: 1 });
        if (existing.length) {
            console.log(`  â„¹ï¸ ${modelName}: ACL exists`);
            continue;
        }

        try {
            await call('ir.model.access', 'create', [{
                name: `access_${modelName}_user`,
                model_id: mIds[0],
                group_id: groupId,
                perm_read: true,
                perm_write: true,
                perm_create: true,
                perm_unlink: true,
            }]);
            console.log(`  âœ… ${modelName}: Full CRUD granted`);
        } catch (e) {
            console.log(`  âŒ ${modelName}: ${e.message.substring(0, 80)}`);
        }
    }
}

// ============================================================
// STEP 2-4: Migrate remaining data
// ============================================================
async function migrateImportTickets() {
    console.log('\nðŸ“¦ Import Tickets â†’ x_locthien_import_ticket...');
    const data = loadJson('import_tickets.json');
    let ok = 0, skip = 0, errs = 0;
    for (const t of data) {
        const sbId = t.id || '';
        const ex = await call('x_locthien_import_ticket', 'search',
            [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }
        try {
            await call('x_locthien_import_ticket', 'create', [{
                                x_ticket_no: t.ticket_no || sbId,
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
                x_supabase_id: sbId,
            }]);
            ok++;
            if (ok % 50 === 0) console.log(`    ... ${ok}/${data.length}`);
        } catch (e) { errs++; if (errs <= 3) console.log(`    âš ï¸ ${e.message.substring(0, 80)}`); }
    }
    console.log(`  âœ… Created: ${ok}, Skipped: ${skip}, Errors: ${errs}`);
}

async function migrateExportTickets() {
    console.log('\nðŸ“¦ Export Tickets â†’ x_locthien_export_ticket...');
    const data = loadJson('export_tickets.json');
    let ok = 0, skip = 0, errs = 0;
    for (const t of data) {
        const sbId = t.id || '';
        const ex = await call('x_locthien_export_ticket', 'search',
            [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }
        try {
            await call('x_locthien_export_ticket', 'create', [{
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
                x_supabase_id: sbId,
            }]);
            ok++;
            if (ok % 50 === 0) console.log(`    ... ${ok}/${data.length}`);
        } catch (e) { errs++; if (errs <= 3) console.log(`    âš ï¸ ${e.message.substring(0, 80)}`); }
    }
    console.log(`  âœ… Created: ${ok}, Skipped: ${skip}, Errors: ${errs}`);
}

async function migrateAssignmentsAndMerged() {
    console.log('\nðŸ“¦ Driver Assignments â†’ x_locthien_driver_assignment...');
    const data = loadJson('order_driver_assignments.json');
    let ok = 0, skip = 0, errs = 0;
    for (const a of data) {
        const sbId = a.id || '';
        const ex = await call('x_locthien_driver_assignment', 'search',
            [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }
        try {
            await call('x_locthien_driver_assignment', 'create', [{
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
                x_supabase_id: sbId,
            }]);
            ok++;
            if (ok % 100 === 0) console.log(`    ... ${ok}/${data.length}`);
        } catch (e) { errs++; if (errs <= 3) console.log(`    âš ï¸ ${e.message.substring(0, 80)}`); }
    }
    console.log(`  âœ… Created: ${ok}, Skipped: ${skip}, Errors: ${errs}`);

    // Import Assignments
    console.log('\nðŸ“¦ Import Assignments â†’ x_locthien_import_assignment...');
    const iData = loadJson('import_driver_assignments.json');
    ok = 0; skip = 0; errs = 0;
    for (const a of iData) {
        const sbId = a.id || '';
        const ex = await call('x_locthien_import_assignment', 'search',
            [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }
        try {
            await call('x_locthien_import_assignment', 'create', [{
                                x_import_ticket_no: a.import_id,
                x_driver_name: a.driver_name,
                x_driver_type: a.driver_type || 'internal',
                x_plate: s(a.plate),
                x_assigned_qty: a.assigned_qty || 0,
                x_actual_qty: a.actual_qty || 0,
                x_status: a.status || 'pending',
                x_local_items: JSON.stringify(a.local_items || []),
                x_delivery_note: s(a.delivery_note),
                x_supabase_id: sbId,
            }]);
            ok++;
        } catch (e) { errs++; if (errs <= 3) console.log(`    âš ï¸ ${e.message.substring(0, 80)}`); }
    }
    console.log(`  âœ… Created: ${ok}, Skipped: ${skip}, Errors: ${errs}`);

    // Merged Orders
    console.log('\nðŸ“¦ Merged Orders â†’ x_locthien_merged_order...');
    const mData = loadJson('merged_orders.json');
    ok = 0; skip = 0; errs = 0;
    for (const m of mData) {
        const sbId = m.id || '';
        const ex = await call('x_locthien_merged_order', 'search',
            [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }
        try {
            await call('x_locthien_merged_order', 'create', [{
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
                x_supabase_id: sbId,
            }]);
            ok++;
        } catch (e) { errs++; if (errs <= 3) console.log(`    âš ï¸ ${e.message.substring(0, 80)}`); }
    }
    console.log(`  âœ… Created: ${ok}, Skipped: ${skip}, Errors: ${errs}`);
}

// ============================================================
async function main() {
    console.log('='.repeat(60));
    console.log('ðŸ” FIX ACL + MIGRATE REMAINING DATA');
    console.log('='.repeat(60));

    UID = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
    if (!UID) { console.error('âŒ Auth failed'); process.exit(1); }
    console.log(`âœ… uid=${UID}`);

    await grantAccess();
    await migrateImportTickets();
    await migrateExportTickets();
    await migrateAssignmentsAndMerged();

    console.log('\n' + '='.repeat(60));
    console.log('ðŸŽ‰ ALL DATA MIGRATED!');
    console.log('='.repeat(60));
}

main().catch(e => { console.error('ðŸ’¥', e.message); process.exit(1); });

