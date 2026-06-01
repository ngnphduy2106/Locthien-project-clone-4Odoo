#!/usr/bin/env node
/**
 * Deploy locthien_scm schema to Odoo via JSON-RPC API
 * Creates custom models + fields WITHOUT needing SSH or module install.
 * Uses ir.model & ir.model.fields to register everything safely.
 * Then migrates remaining data (import/export tickets, assignments, merged orders).
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
    if (data.error) throw new Error(data.error.data?.message || data.error.message || 'RPC Error');
    return data.result;
}

let UID;
async function call(model, method, args = [], kwargs = {}) {
    return rpc('object', 'execute_kw', [ODOO_DB, UID, ODOO_PASS, model, method, args, kwargs]);
}

function loadJson(f) {
    const p = join(BACKUP_DIR, f);
    if (!existsSync(p)) { console.log(`  ⚠️ Missing: ${f}`); return []; }
    const d = JSON.parse(readFileSync(p, 'utf-8'));
    console.log(`  📂 ${f}: ${d.length} rows`);
    return d;
}

function s(v) { return v ? String(v).trim() || false : false; }

// ============================================================
// PART 1: Create custom fields on sale.order via x_ prefix
// ============================================================
async function addSaleOrderFields() {
    console.log('\n🔧 [1/6] Adding custom fields to sale.order...');

    const fields = [
        { name: 'x_supabase_id',       ttype: 'char',     string: 'Supabase ID' },
        { name: 'x_misa_id',           ttype: 'integer',  string: 'MISA ID' },
        { name: 'x_sale_order_no',     ttype: 'char',     string: 'Mã đơn MISA' },
        { name: 'x_driver_name',       ttype: 'char',     string: 'Tài xế' },
        { name: 'x_plate',             ttype: 'char',     string: 'Biển số' },
        { name: 'x_assistant_name',    ttype: 'char',     string: 'Phụ xe' },
        { name: 'x_delivery_time',     ttype: 'char',     string: 'Thời gian giao' },
        { name: 'x_delivery_note',     ttype: 'text',     string: 'Ghi chú giao hàng' },
        { name: 'x_local_items',       ttype: 'text',     string: 'Mặt hàng phụ (JSON)' },
        { name: 'x_is_local',          ttype: 'boolean',  string: 'Đơn ngoài' },
        { name: 'x_is_pinned',         ttype: 'boolean',  string: 'Ghim' },
        { name: 'x_merged_order_no',   ttype: 'char',     string: 'Mã đơn ghép' },
        { name: 'x_partial_completion',ttype: 'boolean',  string: 'Chia đơn' },
        { name: 'x_sale_confirmed',    ttype: 'boolean',  string: 'Sales xác nhận' },
        { name: 'x_sale_confirmed_at', ttype: 'datetime', string: 'Sales xác nhận lúc' },
        { name: 'x_sale_confirmed_by', ttype: 'char',     string: 'Sales xác nhận bởi' },
        { name: 'x_admin_approved',    ttype: 'boolean',  string: 'Admin duyệt' },
        { name: 'x_admin_approved_at', ttype: 'datetime', string: 'Admin duyệt lúc' },
        { name: 'x_admin_approved_by', ttype: 'char',     string: 'Admin duyệt bởi' },
        { name: 'x_sale_order_amount', ttype: 'float',    string: 'Tổng tiền MISA' },
        { name: 'x_tax_summary',       ttype: 'float',    string: 'Thuế MISA' },
        { name: 'x_discount_summary',  ttype: 'float',    string: 'Chiết khấu MISA' },
        { name: 'x_shipping_address',  ttype: 'text',     string: 'Địa chỉ giao hàng' },
        { name: 'x_shipping_province', ttype: 'char',     string: 'Tỉnh/TP giao' },
        { name: 'x_shipping_district', ttype: 'char',     string: 'Quận/Huyện giao' },
        { name: 'x_billing_address',   ttype: 'text',     string: 'Địa chỉ hóa đơn' },
        { name: 'x_delivery_status',   ttype: 'char',     string: 'TT giao (MISA)' },
        { name: 'x_pay_status',        ttype: 'char',     string: 'TT thanh toán (MISA)' },
        { name: 'x_owner_name',        ttype: 'char',     string: 'Người tạo đơn (MISA)' },
        { name: 'x_product_mappings',  ttype: 'text',     string: 'Sản phẩm JSON' },
    ];

    // Get sale.order model id
    const modelIds = await call('ir.model', 'search', [[['model', '=', 'sale.order']]], { limit: 1 });
    if (!modelIds.length) { console.error('❌ sale.order model not found'); return; }
    const modelId = modelIds[0];

    let created = 0, skipped = 0;
    for (const f of fields) {
        // Check if field already exists
        const existing = await call('ir.model.fields', 'search',
            [[['model', '=', 'sale.order'], ['name', '=', f.name]]], { limit: 1 });
        if (existing.length) { skipped++; continue; }

        try {
            await call('ir.model.fields', 'create', [{
                model_id: modelId,
                name: f.name,
                field_description: f.string,
                ttype: f.ttype,
                store: true,
                copied: false,
            }]);
            created++;
        } catch (e) {
            console.log(`    ⚠️ ${f.name}: ${e.message.substring(0, 80)}`);
        }
    }
    console.log(`  ✅ Created: ${created}, Already exist: ${skipped}`);
}

// ============================================================
// PART 2: Create custom models via ir.model
// ============================================================
async function createCustomModel(modelName, description, fields) {
    // Check if model exists
    const existing = await call('ir.model', 'search', [[['model', '=', modelName]]], { limit: 1 });
    if (existing.length) {
        console.log(`  ℹ️ ${modelName} already exists`);
        // Still add missing fields
        const modelId = existing[0];
        let added = 0;
        for (const f of fields) {
            const fExists = await call('ir.model.fields', 'search',
                [[['model', '=', modelName], ['name', '=', f.name]]], { limit: 1 });
            if (fExists.length) continue;
            try {
                await call('ir.model.fields', 'create', [{
                    model_id: modelId, name: f.name, field_description: f.string,
                    ttype: f.ttype, store: true,
                    ...(f.selection ? { selection_ids: f.selection } : {}),
                }]);
                added++;
            } catch (e) {
                console.log(`    ⚠️ ${f.name}: ${e.message.substring(0, 60)}`);
            }
        }
        if (added > 0) console.log(`    ✅ Added ${added} missing fields`);
        return;
    }

    // Create model with all fields at once
    try {
        // Build field definitions for creation
        const fieldDefs = fields.map(f => {
            const fd = { name: f.name, field_description: f.string, ttype: f.ttype, store: true };
            return [0, 0, fd];
        });

        await call('ir.model', 'create', [{
            name: description,
            model: modelName,
            field_id: fieldDefs,
            state: 'manual',  // Custom model (x_ prefix handled by Odoo)
        }]);
        console.log(`  ✅ Created ${modelName} with ${fields.length} fields`);
    } catch (e) {
        console.log(`  ❌ ${modelName}: ${e.message.substring(0, 120)}`);
    }
}

async function createAllCustomModels() {
    console.log('\n🔧 [2/6] Creating custom models...');

    // Import Ticket
    await createCustomModel('x_locthien_import_ticket', 'Phiếu Nhập Hàng', [
        { name: 'x_ticket_no', ttype: 'char', string: 'Mã phiếu' },
        { name: 'x_supplier_name', ttype: 'char', string: 'Nhà cung cấp' },
        { name: 'x_supplier_address', ttype: 'text', string: 'Địa chỉ NCC' },
        { name: 'x_products', ttype: 'text', string: 'Sản phẩm (JSON)' },
        { name: 'x_total_qty', ttype: 'float', string: 'Tổng SL' },
        { name: 'x_expected_date', ttype: 'date', string: 'Ngày dự kiến' },
        { name: 'x_warehouse', ttype: 'char', string: 'Kho' },
        { name: 'x_description', ttype: 'text', string: 'Mô tả' },
        { name: 'x_note', ttype: 'text', string: 'Ghi chú' },
        { name: 'x_local_items', ttype: 'text', string: 'Mặt hàng phụ' },
        { name: 'x_status', ttype: 'char', string: 'Trạng thái' },
        { name: 'x_assigned_driver', ttype: 'char', string: 'Tài xế' },
        { name: 'x_assigned_plate', ttype: 'char', string: 'Biển số' },
        { name: 'x_created_by', ttype: 'char', string: 'Người tạo' },
        { name: 'x_is_pinned', ttype: 'boolean', string: 'Ghim' },
        { name: 'x_started_at', ttype: 'datetime', string: 'Bắt đầu lúc' },
        { name: 'x_completed_at', ttype: 'datetime', string: 'Hoàn thành lúc' },
        { name: 'x_supabase_id', ttype: 'char', string: 'Supabase UUID' },
        { name: 'x_merged_order_no', ttype: 'char', string: 'Mã đơn ghép' },
    ]);

    // Export Ticket
    await createCustomModel('x_locthien_export_ticket', 'Phiếu Xuất Hàng', [
        { name: 'x_ticket_no', ttype: 'char', string: 'Mã phiếu' },
        { name: 'x_order_id', ttype: 'char', string: 'Mã đơn hàng' },
        { name: 'x_order_no', ttype: 'char', string: 'Số đơn hàng' },
        { name: 'x_customer_name', ttype: 'char', string: 'Khách hàng' },
        { name: 'x_customer_address', ttype: 'text', string: 'Địa chỉ KH' },
        { name: 'x_products', ttype: 'text', string: 'Sản phẩm (JSON)' },
        { name: 'x_total_qty', ttype: 'float', string: 'Tổng SL' },
        { name: 'x_weight_summary', ttype: 'float', string: 'Tổng KG' },
        { name: 'x_driver_name', ttype: 'char', string: 'Tài xế' },
        { name: 'x_plate', ttype: 'char', string: 'Biển số' },
        { name: 'x_warehouse', ttype: 'char', string: 'Kho' },
        { name: 'x_note', ttype: 'text', string: 'Ghi chú' },
        { name: 'x_created_by', ttype: 'char', string: 'Người tạo' },
        { name: 'x_supabase_id', ttype: 'char', string: 'Supabase UUID' },
    ]);

    // Merged Order
    await createCustomModel('x_locthien_merged_order', 'Đơn Ghép PO', [
        { name: 'x_merged_no', ttype: 'char', string: 'Mã đơn ghép' },
        { name: 'x_source_order_nos', ttype: 'text', string: 'Đơn gốc' },
        { name: 'x_status', ttype: 'char', string: 'Trạng thái' },
        { name: 'x_driver_name', ttype: 'char', string: 'Tài xế' },
        { name: 'x_plate', ttype: 'char', string: 'Biển số' },
        { name: 'x_total_amount', ttype: 'float', string: 'Tổng tiền' },
        { name: 'x_total_stops', ttype: 'integer', string: 'Số điểm giao' },
        { name: 'x_note', ttype: 'text', string: 'Ghi chú' },
        { name: 'x_created_by', ttype: 'char', string: 'Người tạo' },
        { name: 'x_assistant_name', ttype: 'char', string: 'Phụ xe' },
        { name: 'x_delivery_time', ttype: 'char', string: 'Thời gian giao' },
        { name: 'x_assigned_at', ttype: 'datetime', string: 'Phân công lúc' },
        { name: 'x_completed_at', ttype: 'datetime', string: 'Hoàn thành lúc' },
        { name: 'x_supabase_id', ttype: 'char', string: 'Supabase UUID' },
    ]);

    // Driver Assignment (Export)
    await createCustomModel('x_locthien_driver_assignment', 'Phân Công Tài Xế', [
        { name: 'x_order_id', ttype: 'char', string: 'Mã đơn hàng' },
        { name: 'x_driver_name', ttype: 'char', string: 'Tài xế' },
        { name: 'x_driver_type', ttype: 'char', string: 'Loại xe' },
        { name: 'x_plate', ttype: 'char', string: 'Biển số' },
        { name: 'x_assigned_qty', ttype: 'float', string: 'SL phân công' },
        { name: 'x_actual_qty', ttype: 'float', string: 'SL thực giao' },
        { name: 'x_status', ttype: 'char', string: 'Trạng thái' },
        { name: 'x_local_items', ttype: 'text', string: 'Mặt hàng phụ' },
        { name: 'x_delivery_note', ttype: 'text', string: 'Ghi chú giao' },
        { name: 'x_proof_images', ttype: 'text', string: 'Ảnh chứng từ' },
        { name: 'x_assistant_name', ttype: 'char', string: 'Phụ xe' },
        { name: 'x_delivery_time', ttype: 'char', string: 'Thời gian giao' },
        { name: 'x_completed_at', ttype: 'datetime', string: 'Hoàn thành lúc' },
        { name: 'x_supabase_id', ttype: 'char', string: 'Supabase UUID' },
    ]);

    // Import Driver Assignment
    await createCustomModel('x_locthien_import_assignment', 'Phân Công TX Nhập', [
        { name: 'x_import_ticket_no', ttype: 'char', string: 'Mã phiếu nhập' },
        { name: 'x_driver_name', ttype: 'char', string: 'Tài xế' },
        { name: 'x_driver_type', ttype: 'char', string: 'Loại xe' },
        { name: 'x_plate', ttype: 'char', string: 'Biển số' },
        { name: 'x_assigned_qty', ttype: 'float', string: 'SL phân công' },
        { name: 'x_actual_qty', ttype: 'float', string: 'SL thực nhận' },
        { name: 'x_status', ttype: 'char', string: 'Trạng thái' },
        { name: 'x_local_items', ttype: 'text', string: 'Mặt hàng phụ' },
        { name: 'x_delivery_note', ttype: 'text', string: 'Ghi chú' },
        { name: 'x_proof_images', ttype: 'text', string: 'Ảnh chứng từ' },
        { name: 'x_note', ttype: 'text', string: 'Ghi chú thêm' },
        { name: 'x_completed_at', ttype: 'datetime', string: 'Hoàn thành lúc' },
        { name: 'x_supabase_id', ttype: 'char', string: 'Supabase UUID' },
    ]);
}

// ============================================================
// PART 3: Update existing sale.orders with custom field data
// ============================================================
async function updateSaleOrderFields() {
    console.log('\n📦 [3/6] Updating sale.orders with MISA/logistics fields...');
    const data = loadJson('orders.json');
    let updated = 0, skipped = 0, errors = 0;

    for (const o of data) {
        const sbId = o.id || '';
        if (!sbId) { skipped++; continue; }

        // Find order by client_order_ref
        const ids = await call('sale.order', 'search',
            [[['client_order_ref', '=', sbId]]], { limit: 1 });
        if (!ids.length) { skipped++; continue; }

        const vals = {
            x_supabase_id: sbId,
            x_misa_id: o.misa_id || 0,
            x_sale_order_no: s(o.sale_order_no) || sbId,
            x_driver_name: s(o.custom_field13),
            x_plate: s(o.custom_field14),
            x_assistant_name: s(o.assistant_name),
            x_delivery_time: s(o.delivery_time),
            x_delivery_note: s(o.delivery_note),
            x_shipping_address: s(o.shipping_address),
            x_shipping_province: s(o.shipping_province),
            x_delivery_status: s(o.delivery_status),
            x_pay_status: s(o.pay_status),
            x_owner_name: s(o.owner_name),
            x_merged_order_no: s(o.merged_order_no),
            x_sale_order_amount: o.sale_order_amount || 0,
            x_sale_confirmed: !!o.sale_confirmed,
            x_admin_approved: !!o.admin_approved,
            x_is_local: !!o.is_local,
            x_is_pinned: !!o.is_pinned,
            x_product_mappings: typeof o.sale_order_product_mappings === 'string'
                ? o.sale_order_product_mappings : JSON.stringify(o.sale_order_product_mappings || []),
        };

        // Remove false values to not overwrite
        Object.keys(vals).forEach(k => { if (vals[k] === false) delete vals[k]; });

        try {
            await call('sale.order', 'write', [ids, vals]);
            updated++;
            if (updated % 100 === 0) console.log(`    ... ${updated}/${data.length}`);
        } catch (e) {
            errors++;
            if (errors <= 3) console.log(`    ⚠️ ${sbId}: ${e.message.substring(0, 80)}`);
        }
    }
    console.log(`  ✅ Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
}

// ============================================================
// PART 4: Migrate Import Tickets
// ============================================================
async function migrateImportTickets() {
    console.log('\n📦 [4/6] Import Tickets → x_locthien_import_ticket...');
    const data = loadJson('import_tickets.json');
    let ok = 0, skip = 0, errs = 0;

    for (const t of data) {
        const sbId = t.id || '';
        // Dedup check
        const ex = await call('x_locthien_import_ticket', 'search',
            [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }

        try {
            await call('x_locthien_import_ticket', 'create', [{
                x_name: t.ticket_no || sbId,
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
        } catch (e) {
            errs++;
            if (errs <= 3) console.log(`    ⚠️ ${sbId}: ${e.message.substring(0, 80)}`);
        }
    }
    console.log(`  ✅ Created: ${ok}, Skipped: ${skip}, Errors: ${errs}`);
}

// ============================================================
// PART 5: Migrate Export Tickets
// ============================================================
async function migrateExportTickets() {
    console.log('\n📦 [5/6] Export Tickets → x_locthien_export_ticket...');
    const data = loadJson('export_tickets.json');
    let ok = 0, skip = 0, errs = 0;

    for (const t of data) {
        const sbId = t.id || '';
        const ex = await call('x_locthien_export_ticket', 'search',
            [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }

        try {
            await call('x_locthien_export_ticket', 'create', [{
                x_name: t.ticket_no || sbId,
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
        } catch (e) {
            errs++;
            if (errs <= 3) console.log(`    ⚠️ ${sbId}: ${e.message.substring(0, 80)}`);
        }
    }
    console.log(`  ✅ Created: ${ok}, Skipped: ${skip}, Errors: ${errs}`);
}

// ============================================================
// PART 6: Migrate Driver Assignments + Merged Orders
// ============================================================
async function migrateDriverAssignments() {
    console.log('\n📦 [6a/6] Driver Assignments → x_locthien_driver_assignment...');
    const data = loadJson('order_driver_assignments.json');
    let ok = 0, skip = 0, errs = 0;

    for (const a of data) {
        const sbId = a.id || '';
        const ex = await call('x_locthien_driver_assignment', 'search',
            [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }

        try {
            await call('x_locthien_driver_assignment', 'create', [{
                x_name: `${a.driver_name} - ${a.order_id}`,
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
            if (ok % 50 === 0) console.log(`    ... ${ok}/${data.length}`);
        } catch (e) {
            errs++;
            if (errs <= 3) console.log(`    ⚠️ ${sbId}: ${e.message.substring(0, 80)}`);
        }
    }
    console.log(`  ✅ Created: ${ok}, Skipped: ${skip}, Errors: ${errs}`);

    // Import Driver Assignments
    console.log('\n📦 [6b/6] Import Assignments → x_locthien_import_assignment...');
    const iData = loadJson('import_driver_assignments.json');
    ok = 0; skip = 0; errs = 0;

    for (const a of iData) {
        const sbId = a.id || '';
        const ex = await call('x_locthien_import_assignment', 'search',
            [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }

        try {
            await call('x_locthien_import_assignment', 'create', [{
                x_name: `${a.driver_name} - ${a.import_id}`,
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
        } catch (e) {
            errs++;
            if (errs <= 3) console.log(`    ⚠️ ${sbId}: ${e.message.substring(0, 80)}`);
        }
    }
    console.log(`  ✅ Created: ${ok}, Skipped: ${skip}, Errors: ${errs}`);

    // Merged Orders
    console.log('\n📦 [6c/6] Merged Orders → x_locthien_merged_order...');
    const mData = loadJson('merged_orders.json');
    ok = 0; skip = 0; errs = 0;

    for (const m of mData) {
        const sbId = m.id || '';
        const ex = await call('x_locthien_merged_order', 'search',
            [[['x_supabase_id', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }

        try {
            await call('x_locthien_merged_order', 'create', [{
                x_name: m.merged_no || sbId,
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
        } catch (e) {
            errs++;
            if (errs <= 3) console.log(`    ⚠️ ${sbId}: ${e.message.substring(0, 80)}`);
        }
    }
    console.log(`  ✅ Created: ${ok}, Skipped: ${skip}, Errors: ${errs}`);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('='.repeat(60));
    console.log('🚀 DEPLOY LOCTHIEN SCM SCHEMA + DATA TO ODOO');
    console.log(`   ${ODOO_URL} | DB: ${ODOO_DB}`);
    console.log('   ⚡ Via API — No SSH required, no other data affected');
    console.log('='.repeat(60));

    UID = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
    if (!UID) { console.error('❌ Auth failed'); process.exit(1); }
    console.log(`✅ Authenticated uid=${UID}`);

    await addSaleOrderFields();
    await createAllCustomModels();
    await updateSaleOrderFields();
    await migrateImportTickets();
    await migrateExportTickets();
    await migrateDriverAssignments();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 DEPLOYMENT COMPLETE!');
    console.log('='.repeat(60));
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
