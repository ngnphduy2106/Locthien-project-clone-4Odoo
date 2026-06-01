#!/usr/bin/env node
/**
 * Lộc Thiên SCM → Odoo Migration (Standard Fields Only)
 * Works WITHOUT custom module — stores extra data in notes.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ODOO_URL = process.env.ODOO_URL || 'https://odoo-dev.new.ai.vn';
const ODOO_DB  = process.env.ODOO_DB  || 'Odoo-LT';
const ODOO_USER= process.env.ODOO_USER|| 'locthien.cloud@gmail.com';
const ODOO_PASS= process.env.ODOO_PASS|| 'Locthien@123';
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

async function authenticate() {
    const uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
    if (!uid) { console.error('❌ Auth failed!'); process.exit(1); }
    console.log(`✅ Authenticated uid=${uid}`);
    return uid;
}

async function call(uid, model, method, args = [], kwargs = {}) {
    return rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_PASS, model, method, args, kwargs]);
}

function loadJson(f) {
    const p = join(BACKUP_DIR, f);
    if (!existsSync(p)) { console.log(`  ⚠️ Missing: ${f}`); return []; }
    const d = JSON.parse(readFileSync(p, 'utf-8'));
    console.log(`  📂 ${f}: ${d.length} rows`);
    return d;
}

function s(v) { return v ? String(v).trim() || false : false; }
function parseProducts(raw) {
    if (!raw) return [];
    try { return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []); }
    catch { return []; }
}

// Check if custom module is installed
async function hasCustomModule(uid) {
    try {
        await call(uid, 'sale.order', 'fields_get', [], { attributes: ['string'], allfields: false });
        const fields = await call(uid, 'ir.model.fields', 'search', [[['model', '=', 'sale.order'], ['name', '=', 'x_supabase_id']]]);
        return fields.length > 0;
    } catch { return false; }
}

// ============ CUSTOMERS ============
async function migrateCustomers(uid) {
    console.log('\n📦 [1/5] CUSTOMERS → res.partner');
    const data = loadJson('customers.json');
    let ok = 0, skip = 0;
    for (const c of data) {
        const name = s(c.name);
        if (!name) { skip++; continue; }
        const ex = await call(uid, 'res.partner', 'search', [[['name', '=', name], ['customer_rank', '>', 0]]], { limit: 1 });
        if (ex.length) { skip++; continue; }
        try {
            await call(uid, 'res.partner', 'create', [{
                name, street: s(c.address), phone: s(c.phone), email: s(c.email),
                is_company: true, customer_rank: 1, active: c.active !== false,
                comment: s(c.note),
            }]);
            ok++;
        } catch (e) { if (ok < 3) console.log(`    ⚠️ ${name}: ${e.message.substring(0,80)}`); }
    }
    console.log(`  ✅ ${ok} created, ${skip} skipped`);
}

// ============ SUPPLIERS ============
async function migrateSuppliers(uid) {
    console.log('\n📦 [2/5] SUPPLIERS → res.partner');
    const data = loadJson('suppliers.json');
    let ok = 0, skip = 0;
    for (const c of data) {
        const name = s(c.name);
        if (!name) { skip++; continue; }
        const ex = await call(uid, 'res.partner', 'search', [[['name', '=', name], ['supplier_rank', '>', 0]]], { limit: 1 });
        if (ex.length) { skip++; continue; }
        try {
            await call(uid, 'res.partner', 'create', [{
                name, street: s(c.address), phone: s(c.phone), email: s(c.email),
                is_company: true, supplier_rank: 1, active: c.active !== false,
            }]);
            ok++;
        } catch (e) { if (ok < 3) console.log(`    ⚠️ ${name}: ${e.message.substring(0,80)}`); }
    }
    console.log(`  ✅ ${ok} created, ${skip} skipped`);
}

// ============ MATERIALS ============
async function migrateMaterials(uid) {
    console.log('\n📦 [3/5] MATERIALS → product.template');
    const data = loadJson('materials.json');
    let ok = 0, skip = 0;
    for (const m of data) {
        const code = s(m.code), name = s(m.name);
        if (!code || !name) { skip++; continue; }
        const ex = await call(uid, 'product.template', 'search', [[['default_code', '=', code]]], { limit: 1 });
        if (ex.length) { skip++; continue; }
        try {
            await call(uid, 'product.template', 'create', [{
                name, default_code: code,
                list_price: m.saleprice || m.sale_price || 0,
                standard_price: m.price || 0,
                type: 'consu', sale_ok: true, purchase_ok: true,
                description_sale: s(m.description),
            }]);
            ok++;
        } catch (e) { if (ok < 3) console.log(`    ⚠️ ${code}: ${e.message.substring(0,80)}`); }
    }
    console.log(`  ✅ ${ok} created, ${skip} skipped`);
}

// ============ ORDERS ============
async function migrateOrders(uid, useCustom) {
    console.log('\n📦 [4/5] ORDERS → sale.order + sale.order.line');
    const data = loadJson('orders.json');
    let ok = 0, skip = 0, errs = 0;

    for (let i = 0; i < data.length; i++) {
        const o = data[i];
        const sbId = o.id || '';
        const orderNo = s(o.sale_order_no) || sbId;

        // Check duplicate by client_order_ref
        const ex = await call(uid, 'sale.order', 'search', [[['client_order_ref', '=', sbId]]], { limit: 1 });
        if (ex.length) { skip++; continue; }

        // Find/create partner
        const acctName = s(o.account_name) || 'Khách lẻ';
        let pid = (await call(uid, 'res.partner', 'search', [[['name', '=', acctName]]], { limit: 1 }))[0];
        if (!pid) {
            try { pid = await call(uid, 'res.partner', 'create', [{ name: acctName, is_company: true, customer_rank: 1 }]); }
            catch { pid = 1; }
        }

        // Build note with all custom data
        const noteLines = [
            `[MISA] ${orderNo}`,
            o.custom_field13 ? `Tài xế: ${o.custom_field13}` : null,
            o.custom_field14 ? `Biển số: ${o.custom_field14}` : null,
            o.assistant_name ? `Phụ xe: ${o.assistant_name}` : null,
            o.delivery_time ? `Thời gian: ${o.delivery_time}` : null,
            o.shipping_address ? `Giao: ${o.shipping_address}` : null,
            o.delivery_note ? `Ghi chú: ${o.delivery_note}` : null,
            o.delivery_status ? `TT giao: ${o.delivery_status}` : null,
            o.pay_status ? `TT thanh toán: ${o.pay_status}` : null,
            o.owner_name ? `Người tạo: ${o.owner_name}` : null,
            o.merged_order_no ? `Đơn ghép: ${o.merged_order_no}` : null,
        ].filter(Boolean).join('\n');

        // Parse date
        let dateOrder = s(o.sale_order_date) || s(o.created_date);
        if (dateOrder && dateOrder.includes('T')) dateOrder = dateOrder.split('T')[0];

        const vals = {
            partner_id: pid,
            date_order: dateOrder || false,
            client_order_ref: sbId,
            note: noteLines,
        };

        // Add custom fields if module is installed
        if (useCustom) {
            Object.assign(vals, {
                x_supabase_id: sbId,
                x_misa_id: o.misa_id || 0,
                x_sale_order_no: orderNo,
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
            });
        }

        try {
            const oid = await call(uid, 'sale.order', 'create', [vals]);

            // Order lines
            const products = parseProducts(o.sale_order_product_mappings);
            for (const p of products) {
                const ppIds = p.code ? await call(uid, 'product.product', 'search', [[['default_code', '=', p.code]]], { limit: 1 }) : [];
                const lv = { order_id: oid, name: p.name || p.code || 'SP', product_uom_qty: p.qty || 0, price_unit: p.price || 0 };
                if (ppIds.length) lv.product_id = ppIds[0];
                try { await call(uid, 'sale.order.line', 'create', [lv]); }
                catch { delete lv.product_id; try { await call(uid, 'sale.order.line', 'create', [lv]); } catch {} }
            }
            ok++;
            if (ok % 50 === 0) console.log(`    ... ${ok}/${data.length}`);
        } catch (e) {
            errs++;
            if (errs <= 5) console.log(`    ⚠️ ${sbId}: ${e.message.substring(0,100)}`);
        }
    }
    console.log(`  ✅ ${ok} created, ${skip} skipped, ${errs} errors`);
}

// ============ IMPORT TICKETS (as notes on partners if no module) ============
async function migrateImportTickets(uid, useCustom) {
    if (!useCustom) {
        console.log('\n📦 [5/5] IMPORT/EXPORT TICKETS → skipped (module not installed)');
        console.log('  ℹ️  Install locthien_scm module then re-run to migrate tickets');
        return;
    }
    // Full migration with custom models would go here
    console.log('\n📦 [5/5] Custom models migration available after module install');
}

// ============ MAIN ============
async function main() {
    console.log('='.repeat(60));
    console.log('🚀 LỘC THIÊN SCM → ODOO MIGRATION');
    console.log(`   ${ODOO_URL} | DB: ${ODOO_DB}`);
    console.log('='.repeat(60));

    if (!existsSync(BACKUP_DIR)) { console.error('❌ Backup not found'); process.exit(1); }

    const uid = await authenticate();
    const useCustom = await hasCustomModule(uid);
    console.log(useCustom ? '✅ Custom module detected' : '⚠️ No custom module — using standard fields + notes');

    await migrateCustomers(uid);
    await migrateSuppliers(uid);
    await migrateMaterials(uid);
    await migrateOrders(uid, useCustom);
    await migrateImportTickets(uid, useCustom);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 MIGRATION COMPLETE!');
    console.log('='.repeat(60));
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
