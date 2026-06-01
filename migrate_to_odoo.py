#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lộc Thiên SCM — Migration Script: Supabase JSON → Odoo (Viettel vDBS)
=====================================================================
Reads exported JSON backup files and pushes data into Odoo via XML-RPC API.
This approach uses Odoo's ORM layer for data integrity (computed fields, sequences).

Usage:
    python migrate_to_odoo.py

Prerequisites:
    1. Odoo server running and accessible
    2. Module 'locthien_scm' installed on Odoo
    3. JSON backup files in BACKUP_DIR
"""

import json
import os
import sys
import xmlrpc.client
from datetime import datetime

# ============================================================
# CONFIGURATION — Update these before running!
# ============================================================
ODOO_URL = os.environ.get('ODOO_URL', 'http://localhost:8069')  # Odoo web URL
ODOO_DB = os.environ.get('ODOO_DB', 'OdooLT')                 # Database name
ODOO_USER = os.environ.get('ODOO_USER', 'admin')               # Admin login
ODOO_PASS = os.environ.get('ODOO_PASS', 'admin')               # Admin password

BACKUP_DIR = os.path.join(os.path.dirname(__file__),
    'backups', 'backup_2026-05-20_154157')

# ============================================================
# XML-RPC Connection
# ============================================================
def connect():
    """Authenticate and return (uid, models_proxy)."""
    common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')
    uid = common.authenticate(ODOO_DB, ODOO_USER, ODOO_PASS, {})
    if not uid:
        print("❌ Authentication failed! Check ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS")
        sys.exit(1)
    print(f"✅ Authenticated as uid={uid} on {ODOO_URL}/{ODOO_DB}")
    models = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/object')
    return uid, models


def call(models, uid, model, method, *args, **kwargs):
    """Shortcut for models.execute_kw."""
    return models.execute_kw(ODOO_DB, uid, ODOO_PASS, model, method, *args, **kwargs)


def load_json(filename):
    """Load a JSON file from the backup directory."""
    path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(path):
        print(f"⚠️  File not found: {path}")
        return []
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f"📂 Loaded {len(data)} records from {filename}")
    return data


# ============================================================
# 1. MIGRATE CUSTOMERS → res.partner (customer_rank=1)
# ============================================================
def migrate_customers(uid, models):
    print("\n{'='*60}")
    print("📦 Migrating CUSTOMERS → res.partner...")
    customers = load_json('customers.json')
    if not customers:
        return {}

    id_map = {}  # supabase_id → odoo_id
    created = 0
    skipped = 0

    for c in customers:
        name = c.get('name', '').strip()
        if not name:
            skipped += 1
            continue

        # Check if already exists (by name)
        existing = call(models, uid, 'res.partner', 'search',
            [[['name', '=', name], ['customer_rank', '>', 0]]])
        if existing:
            id_map[c['id']] = existing[0]
            skipped += 1
            continue

        vals = {
            'name': name,
            'street': c.get('address', ''),
            'phone': c.get('phone', ''),
            'email': c.get('email', ''),
            'is_company': True,
            'customer_rank': 1,
            'active': c.get('active', True),
            'comment': c.get('note', ''),
        }
        try:
            new_id = call(models, uid, 'res.partner', 'create', [vals])
            id_map[c['id']] = new_id
            created += 1
        except Exception as e:
            print(f"  ⚠️ Error creating customer '{name}': {e}")

    print(f"  ✅ Customers: {created} created, {skipped} skipped")
    return id_map


# ============================================================
# 2. MIGRATE SUPPLIERS → res.partner (supplier_rank=1)
# ============================================================
def migrate_suppliers(uid, models):
    print("\n{'='*60}")
    print("📦 Migrating SUPPLIERS → res.partner...")
    suppliers = load_json('suppliers.json')
    if not suppliers:
        return {}

    id_map = {}
    created = 0
    skipped = 0

    for s in suppliers:
        name = s.get('name', '').strip()
        if not name:
            skipped += 1
            continue

        existing = call(models, uid, 'res.partner', 'search',
            [[['name', '=', name], ['supplier_rank', '>', 0]]])
        if existing:
            id_map[s['id']] = existing[0]
            skipped += 1
            continue

        vals = {
            'name': name,
            'street': s.get('address', ''),
            'phone': s.get('phone', ''),
            'email': s.get('email', ''),
            'is_company': True,
            'supplier_rank': 1,
            'active': s.get('active', True),
            'comment': s.get('note', ''),
        }
        try:
            new_id = call(models, uid, 'res.partner', 'create', [vals])
            id_map[s['id']] = new_id
            created += 1
        except Exception as e:
            print(f"  ⚠️ Error creating supplier '{name}': {e}")

    print(f"  ✅ Suppliers: {created} created, {skipped} skipped")
    return id_map


# ============================================================
# 3. MIGRATE MATERIALS → product.template
# ============================================================
def migrate_materials(uid, models):
    print("\n{'='*60}")
    print("📦 Migrating MATERIALS → product.template...")
    materials = load_json('materials.json')
    if not materials:
        return {}

    id_map = {}  # code → product_id
    created = 0
    skipped = 0

    for m in materials:
        code = m.get('code', '').strip()
        name = m.get('name', '').strip()
        if not code or not name:
            skipped += 1
            continue

        # Check existing by internal reference (default_code)
        existing = call(models, uid, 'product.template', 'search',
            [[['default_code', '=', code]]])
        if existing:
            id_map[code] = existing[0]
            skipped += 1
            continue

        # Map unit from Vietnamese to Odoo UoM
        unit = m.get('unit', 'kg').lower()

        vals = {
            'name': name,
            'default_code': code,
            'list_price': m.get('saleprice') or m.get('sale_price') or 0,
            'standard_price': m.get('price') or 0,
            'type': 'consu',  # Consumable (chemical products)
            'sale_ok': True,
            'purchase_ok': True,
            'description_sale': m.get('description', ''),
        }
        try:
            new_id = call(models, uid, 'product.template', 'create', [vals])
            id_map[code] = new_id
            created += 1
        except Exception as e:
            print(f"  ⚠️ Error creating product '{code}': {e}")

    print(f"  ✅ Materials: {created} created, {skipped} skipped")
    return id_map


# ============================================================
# 4. MIGRATE ORDERS → sale.order + sale.order.line
# ============================================================
STATUS_MAP = {
    'Chưa thực hiện': 'draft',
    'Đang thực hiện': 'sale',
    'Đã thực hiện': 'done',
    'Đã hủy bỏ': 'cancel',
}


def parse_products(raw):
    """Parse sale_order_product_mappings from string or list."""
    if not raw:
        return []
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return []
    if isinstance(raw, list):
        return raw
    return []


def migrate_orders(uid, models, customer_map, product_map):
    print("\n{'='*60}")
    print("📦 Migrating ORDERS → sale.order + sale.order.line...")
    orders = load_json('orders.json')
    if not orders:
        return

    created = 0
    skipped = 0
    errors = 0

    for o in orders:
        supabase_id = o.get('id', '')

        # Skip if already migrated (check by x_supabase_id)
        existing = call(models, uid, 'sale.order', 'search',
            [[['x_supabase_id', '=', supabase_id]]])
        if existing:
            skipped += 1
            continue

        # Find or create partner
        account_name = o.get('account_name', 'Unknown Customer')
        partner_ids = call(models, uid, 'res.partner', 'search',
            [[['name', '=', account_name]]], {'limit': 1})
        if partner_ids:
            partner_id = partner_ids[0]
        else:
            # Create minimal partner
            partner_id = call(models, uid, 'res.partner', 'create', [{
                'name': account_name or 'Khách lẻ',
                'is_company': True,
                'customer_rank': 1,
            }])

        # Parse date
        order_date = o.get('sale_order_date') or o.get('created_date') or False
        if order_date and 'T' in str(order_date):
            order_date = str(order_date).split('T')[0]

        # Map status
        status = o.get('status', 'Chưa thực hiện')
        odoo_state = STATUS_MAP.get(status, 'draft')

        # Build order values
        vals = {
            'partner_id': partner_id,
            'date_order': order_date or False,
            'x_supabase_id': supabase_id,
            'x_misa_id': o.get('misa_id') or 0,
            'x_sale_order_no': o.get('sale_order_no', ''),
            'x_driver_name': o.get('custom_field13', ''),
            'x_plate': o.get('custom_field14', ''),
            'x_assistant_name': o.get('assistant_name', ''),
            'x_delivery_time': o.get('delivery_time', ''),
            'x_delivery_note': o.get('delivery_note', ''),
            'x_local_items': json.dumps(o.get('local_items', '[]')) if o.get('local_items') else '[]',
            'x_is_local': o.get('is_local', False),
            'x_is_pinned': o.get('is_pinned', False),
            'x_merged_order_no': o.get('merged_order_no', ''),
            'x_partial_completion': o.get('partial_completion', False),
            'x_sale_confirmed': o.get('sale_confirmed', False),
            'x_sale_confirmed_by': o.get('sale_confirmed_by', ''),
            'x_admin_approved': o.get('admin_approved', False),
            'x_admin_approved_by': o.get('admin_approved_by', ''),
            'x_sale_order_amount': o.get('sale_order_amount') or 0,
            'x_tax_summary': o.get('tax_summary') or 0,
            'x_discount_summary': o.get('discount_summary') or 0,
            'x_shipping_address': o.get('shipping_address', ''),
            'x_shipping_province': o.get('shipping_province', ''),
            'x_shipping_district': o.get('shipping_district', ''),
            'x_billing_address': o.get('billing_address', ''),
            'x_delivery_status': o.get('delivery_status', ''),
            'x_pay_status': o.get('pay_status', ''),
            'x_owner_name': o.get('owner_name', ''),
            'x_product_mappings': o.get('sale_order_product_mappings', ''),
        }

        # Parse timestamps
        if o.get('sale_confirmed_at'):
            try:
                vals['x_sale_confirmed_at'] = str(o['sale_confirmed_at']).replace('+00:00', '').replace('+07:00', '')
            except Exception:
                pass
        if o.get('admin_approved_at'):
            try:
                vals['x_admin_approved_at'] = str(o['admin_approved_at']).replace('+00:00', '').replace('+07:00', '')
            except Exception:
                pass

        try:
            # Create order in draft state first
            order_id = call(models, uid, 'sale.order', 'create', [vals])

            # Add order lines from product mappings
            products = parse_products(o.get('sale_order_product_mappings'))
            for p in products:
                product_code = p.get('code', '')
                product_name = p.get('name', product_code)
                qty = p.get('qty', 0)
                price = p.get('price', 0)

                # Find product.product by code
                pp_ids = call(models, uid, 'product.product', 'search',
                    [[['default_code', '=', product_code]]], {'limit': 1})
                product_id = pp_ids[0] if pp_ids else False

                line_vals = {
                    'order_id': order_id,
                    'name': product_name,
                    'product_uom_qty': qty,
                    'price_unit': price,
                }
                if product_id:
                    line_vals['product_id'] = product_id

                try:
                    call(models, uid, 'sale.order.line', 'create', [line_vals])
                except Exception as e:
                    # If product is required and not found, create without product
                    if 'product_id' in line_vals:
                        del line_vals['product_id']
                    try:
                        call(models, uid, 'sale.order.line', 'create', [line_vals])
                    except Exception:
                        pass  # Skip problematic lines

            # Confirm order if status requires it
            if odoo_state in ('sale', 'done'):
                try:
                    call(models, uid, 'sale.order', 'action_confirm', [[order_id]])
                except Exception:
                    pass  # Some orders may not be confirmable
            if odoo_state == 'done':
                try:
                    call(models, uid, 'sale.order', 'action_done', [[order_id]])
                except Exception:
                    pass
            if odoo_state == 'cancel':
                try:
                    call(models, uid, 'sale.order', 'action_cancel', [[order_id]])
                except Exception:
                    pass

            created += 1
            if created % 50 == 0:
                print(f"  ... {created}/{len(orders)} orders migrated")

        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"  ⚠️ Error creating order '{supabase_id}': {e}")
            elif errors == 6:
                print(f"  ⚠️ (suppressing further error details...)")

    print(f"  ✅ Orders: {created} created, {skipped} skipped, {errors} errors")


# ============================================================
# 5. MIGRATE IMPORT TICKETS → locthien.import.ticket
# ============================================================
def migrate_import_tickets(uid, models):
    print("\n{'='*60}")
    print("📦 Migrating IMPORT TICKETS → locthien.import.ticket...")
    tickets = load_json('import_tickets.json')
    if not tickets:
        return

    created = 0
    skipped = 0

    for t in tickets:
        ticket_no = t.get('ticket_no', '')
        if not ticket_no:
            skipped += 1
            continue

        existing = call(models, uid, 'locthien.import.ticket', 'search',
            [[['ticket_no', '=', ticket_no]]])
        if existing:
            skipped += 1
            continue

        vals = {
            'ticket_no': ticket_no,
            'supplier_name': t.get('supplier_name', ''),
            'supplier_address': t.get('supplier_address', ''),
            'products': json.dumps(t.get('products', [])) if isinstance(t.get('products'), (list, dict)) else (t.get('products') or '[]'),
            'total_qty': t.get('total_qty') or 0,
            'expected_date': t.get('expected_date') or False,
            'warehouse': t.get('warehouse', 'LT1'),
            'description': t.get('description', ''),
            'note': t.get('note', ''),
            'local_items': json.dumps(t.get('local_items', [])) if isinstance(t.get('local_items'), (list, dict)) else (t.get('local_items') or '[]'),
            'status': t.get('status', 'pending'),
            'assigned_driver': t.get('assigned_driver', ''),
            'assigned_plate': t.get('assigned_plate', ''),
            'created_by': t.get('created_by', 'Admin'),
            'is_pinned': t.get('is_pinned', False),
            'x_supabase_id': t.get('id', ''),
        }
        try:
            call(models, uid, 'locthien.import.ticket', 'create', [vals])
            created += 1
        except Exception as e:
            if created < 3:
                print(f"  ⚠️ Error: {e}")

    print(f"  ✅ Import Tickets: {created} created, {skipped} skipped")


# ============================================================
# 6. MIGRATE EXPORT TICKETS → locthien.export.ticket
# ============================================================
def migrate_export_tickets(uid, models):
    print("\n{'='*60}")
    print("📦 Migrating EXPORT TICKETS → locthien.export.ticket...")
    tickets = load_json('export_tickets.json')
    if not tickets:
        return

    created = 0
    skipped = 0

    for t in tickets:
        ticket_no = t.get('ticket_no', '')
        sb_id = t.get('id', '')

        existing = call(models, uid, 'locthien.export.ticket', 'search',
            [[['x_supabase_id', '=', sb_id]]]) if sb_id else []
        if existing:
            skipped += 1
            continue

        vals = {
            'ticket_no': ticket_no,
            'order_id': t.get('order_id', ''),
            'order_no': t.get('order_no', ''),
            'customer_name': t.get('customer_name', ''),
            'customer_address': t.get('customer_address', ''),
            'products': json.dumps(t.get('products', [])) if isinstance(t.get('products'), (list, dict)) else (t.get('products') or '[]'),
            'total_qty': t.get('total_qty') or 0,
            'weight_summary': t.get('weight_summary') or 0,
            'driver_name': t.get('driver_name', ''),
            'plate': t.get('plate', ''),
            'warehouse': t.get('warehouse', ''),
            'note': t.get('note', ''),
            'created_by': t.get('created_by', ''),
            'x_supabase_id': sb_id,
        }
        try:
            call(models, uid, 'locthien.export.ticket', 'create', [vals])
            created += 1
        except Exception as e:
            if created < 3:
                print(f"  ⚠️ Error: {e}")

    print(f"  ✅ Export Tickets: {created} created, {skipped} skipped")


# ============================================================
# 7. MIGRATE MERGED ORDERS → locthien.merged.order
# ============================================================
def migrate_merged_orders(uid, models):
    print("\n{'='*60}")
    print("📦 Migrating MERGED ORDERS → locthien.merged.order...")
    merged = load_json('merged_orders.json')
    if not merged:
        return

    created = 0
    skipped = 0

    for m in merged:
        merged_no = m.get('merged_no', '')
        if not merged_no:
            skipped += 1
            continue

        existing = call(models, uid, 'locthien.merged.order', 'search',
            [[['merged_no', '=', merged_no]]])
        if existing:
            skipped += 1
            continue

        source_nos = m.get('source_order_nos', [])
        if isinstance(source_nos, list):
            source_nos = ', '.join(source_nos)

        vals = {
            'merged_no': merged_no,
            'source_order_nos': source_nos,
            'status': m.get('status', 'pending'),
            'driver_name': m.get('driver_name', ''),
            'plate': m.get('plate', ''),
            'total_amount': m.get('total_amount') or 0,
            'total_stops': m.get('total_stops') or 0,
            'note': m.get('note', ''),
            'created_by': m.get('created_by', ''),
            'assistant_name': m.get('assistant_name', ''),
            'delivery_time': m.get('delivery_time', ''),
            'x_supabase_id': m.get('id', ''),
        }
        try:
            call(models, uid, 'locthien.merged.order', 'create', [vals])
            created += 1
        except Exception as e:
            if created < 3:
                print(f"  ⚠️ Error: {e}")

    print(f"  ✅ Merged Orders: {created} created, {skipped} skipped")


# ============================================================
# 8. MIGRATE DRIVER ASSIGNMENTS
# ============================================================
def migrate_driver_assignments(uid, models):
    print("\n{'='*60}")
    print("📦 Migrating DRIVER ASSIGNMENTS → locthien.driver.assignment...")
    assignments = load_json('order_driver_assignments.json')
    if not assignments:
        return

    created = 0
    for a in assignments:
        vals = {
            'order_id': a.get('order_id', ''),
            'driver_name': a.get('driver_name', ''),
            'driver_type': a.get('driver_type', 'internal'),
            'plate': a.get('plate', ''),
            'assigned_qty': a.get('assigned_qty') or 0,
            'actual_qty': a.get('actual_qty') or 0,
            'status': a.get('status', 'pending'),
            'local_items': json.dumps(a.get('local_items', [])) if isinstance(a.get('local_items'), (list, dict)) else (a.get('local_items') or '[]'),
            'delivery_note': a.get('delivery_note', ''),
            'proof_images': json.dumps(a.get('proof_images', [])) if isinstance(a.get('proof_images'), (list, dict)) else (a.get('proof_images') or '[]'),
            'assistant_name': a.get('assistant_name', ''),
            'delivery_time': a.get('delivery_time', ''),
            'x_supabase_id': a.get('id', ''),
        }
        try:
            call(models, uid, 'locthien.driver.assignment', 'create', [vals])
            created += 1
        except Exception as e:
            if created < 3:
                print(f"  ⚠️ Error: {e}")

    print(f"  ✅ Driver Assignments: {created} created")


# ============================================================
# MAIN
# ============================================================
def main():
    print("=" * 60)
    print("🚀 LỘC THIÊN SCM → ODOO MIGRATION")
    print(f"   URL: {ODOO_URL}")
    print(f"   DB:  {ODOO_DB}")
    print(f"   Backup: {BACKUP_DIR}")
    print("=" * 60)

    if not os.path.exists(BACKUP_DIR):
        print(f"❌ Backup directory not found: {BACKUP_DIR}")
        sys.exit(1)

    uid, models = connect()

    # Run migrations in dependency order
    customer_map = migrate_customers(uid, models)
    supplier_map = migrate_suppliers(uid, models)
    product_map = migrate_materials(uid, models)
    migrate_orders(uid, models, customer_map, product_map)
    migrate_import_tickets(uid, models)
    migrate_export_tickets(uid, models)
    migrate_merged_orders(uid, models)
    migrate_driver_assignments(uid, models)

    print("\n" + "=" * 60)
    print("🎉 MIGRATION COMPLETE!")
    print("=" * 60)
    print("\n📋 Next Steps:")
    print("   1. Login to Odoo → Sales → Orders → verify data")
    print("   2. Check Lộc Thiên SCM → Kho vận menus")
    print("   3. Verify product catalog under Sales → Products")


if __name__ == '__main__':
    main()
