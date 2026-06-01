/**
 * ============================================================
 * SUPABASE DATA EXPORT SCRIPT - Lộc Thiên SCM
 * ============================================================
 * Exports ALL data from Supabase tables to JSON files.
 * READ-ONLY: Does NOT modify any data or source code.
 *
 * Usage:  node export-supabase-data.mjs
 * Output: ./backups/backup_YYYY-MM-DD_HHmmss/ (one JSON per table)
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

config(); // Load .env

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// All known tables in the Lộc Thiên SCM schema
const TABLES = [
    'orders',
    'users',
    'materials',
    'employees',
    'inventory',
    'order_messages',
    'import_tickets',
    'export_tickets',
    'order_driver_assignments',
    'import_driver_assignments',
    'suppliers',
    'customers',
    'merged_orders',
    'merged_order_checkins',
];

/**
 * Fetch ALL rows from a Supabase table (handles pagination for large tables).
 * Supabase returns max 1000 rows per request, so we paginate.
 * @param {string} tableName
 * @param {string} selectColumns - columns to select (default '*')
 */
async function fetchAllRows(tableName, selectColumns = '*') {
    const PAGE_SIZE = 1000;
    let allRows = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from(tableName)
            .select(selectColumns, { count: 'exact' })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
            // Table might not exist — skip gracefully
            if (error.code === 'PGRST116' || error.message?.includes('does not exist') || error.code === '42P01') {
                console.warn(`  ⚠️  Table "${tableName}" not found, skipping.`);
                return null;
            }
            throw new Error(`Error fetching "${tableName}": ${error.message}`);
        }

        if (data && data.length > 0) {
            allRows = allRows.concat(data);
            offset += data.length;
            hasMore = data.length === PAGE_SIZE;
        } else {
            hasMore = false;
        }
    }

    return allRows;
}

// Tables with heavy blob columns (base64 images) that may cause timeout
// Retry these without image columns if the first attempt fails
const LIGHT_COLUMNS = {
    'export_tickets': 'id,ticket_no,order_id,order_no,customer_name,driver_name,plate,warehouse,products,total_qty,note,created_by,created_at',
    'order_driver_assignments': 'id,order_id,driver_name,driver_type,plate,assigned_qty,actual_qty,status,local_items,delivery_note,assistant_name,delivery_time,created_at,completed_at',
};

async function main() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2');
    const folderName = `backup_${now.toISOString().slice(0, 10)}_${now.toTimeString().slice(0, 8).replace(/:/g, '')}`;
    const backupDir = join(process.cwd(), 'backups', folderName);

    mkdirSync(backupDir, { recursive: true });

    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║       SUPABASE DATA EXPORT - Lộc Thiên SCM      ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`📂 Output: ${backupDir}`);
    console.log(`🕐 Started: ${now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
    console.log('');

    const summary = {};
    let totalRows = 0;

    for (const table of TABLES) {
        process.stdout.write(`  📥 Exporting "${table}"...`);

        try {
            let rows = null;
            let usedLight = false;

            try {
                rows = await fetchAllRows(table);
            } catch (fullErr) {
                // If timeout and we have light columns, retry without images
                if (fullErr.message.includes('timeout') && LIGHT_COLUMNS[table]) {
                    console.log(` ⏳ timeout, retrying without images...`);
                    process.stdout.write(`  📥 Exporting "${table}" (no images)...`);
                    rows = await fetchAllRows(table, LIGHT_COLUMNS[table]);
                    usedLight = true;
                } else {
                    throw fullErr;
                }
            }

            if (rows === null) {
                summary[table] = 'SKIPPED (not found)';
                continue;
            }

            const filePath = join(backupDir, `${table}.json`);
            writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf-8');

            const rowCount = rows.length;
            totalRows += rowCount;
            summary[table] = usedLight ? `${rowCount} (no images)` : rowCount;

            console.log(` ✅ ${rowCount.toLocaleString('vi-VN')} rows${usedLight ? ' (images excluded)' : ''}`);
        } catch (err) {
            console.log(` ❌ ${err.message}`);
            summary[table] = `ERROR: ${err.message}`;
        }
    }

    // Write summary manifest
    const manifest = {
        exported_at: now.toISOString(),
        supabase_url: SUPABASE_URL,
        tables: summary,
        total_rows: totalRows,
    };

    writeFileSync(join(backupDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

    console.log('');
    console.log('══════════════════════════════════════════════════');
    console.log('📊 SUMMARY:');
    console.log('──────────────────────────────────────────────────');
    for (const [table, result] of Object.entries(summary)) {
        const status = typeof result === 'number'
            ? `${result.toLocaleString('vi-VN')} rows`
            : result;
        console.log(`  ${typeof result === 'number' ? '✅' : '⚠️'}  ${table.padEnd(30)} ${status}`);
    }
    console.log('──────────────────────────────────────────────────');
    console.log(`  📦 Total: ${totalRows.toLocaleString('vi-VN')} rows exported`);
    console.log(`  📂 Saved to: ${backupDir}`);
    console.log('══════════════════════════════════════════════════');
    console.log('');
}

main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});
