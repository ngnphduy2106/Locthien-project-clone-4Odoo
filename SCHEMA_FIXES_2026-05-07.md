# Supabase Schema Fixes - 2026-05-07

## Issues Found
The clone Supabase database is missing columns in the `import_tickets` table that are required for the order confirmation display:

1. **`merged_order_no` column** - Used to link import tickets to merged delivery trips
2. **`description` column** - Stores the order description from the form

These missing columns cause the `/api/orders/pending-confirm?type=import` endpoint to fail when trying to enrich import data with merged order information.

## Solution
Run the migration script `server/migrations/schema_fix_import_display.sql` in Supabase SQL Editor:

1. Go to Supabase dashboard → Select "CloneDataERPLocThien" project
2. Click "SQL Editor" → "New Query"
3. Copy and paste contents from `server/migrations/schema_fix_import_display.sql`
4. Click "Run" button
5. Check the results panel to confirm:
   - ✅ `merged_order_no` column is added (type: TEXT)
   - ✅ `description` column is added (type: TEXT)
   - ✅ Schema cache reloaded (NOTIFY pgrst message)

## Testing
After running the migration:

1. **Test Import Tab:**
   - Go to "Xác nhận đơn hàng" → "Đơn nhập" tab
   - Should display completed import tickets without "Lỗi tải dữ liệu" error
   - Merged orders should show linked order codes

2. **Test Export Tab:**
   - Go to "Xác nhận đơn hàng" → "Đơn xuất" tab
   - Should display pending export orders
   - Merged orders should show sibling order codes

3. **Test Pending Orders:**
   - Check all pending order display sections for "Lỗi tải dữ liệu" errors

## Related Fixes
- **Telegram Configuration:** Updated with consistent naming (Điều phối, Xuất, Nhập, Delivery, Import Tickets) and new group IDs
- **Previous Fix (2026-05-02):** `merged_orders.source_order_nos` converted from TEXT to TEXT[] array format
