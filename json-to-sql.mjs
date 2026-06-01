/**
 * ============================================================
 * JSON → SQL CONVERTER - Lộc Thiên SCM Backup
 * ============================================================
 * Reads JSON backup files and generates SQL INSERT statements.
 * READ-ONLY: Does NOT modify any data or source code.
 *
 * Usage:  node json-to-sql.mjs
 * Output: ./backups/backup_YYYY-MM-DD_HHmmss/full_backup.sql
 * ============================================================
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Find latest backup folder
const backupsDir = join(process.cwd(), 'backups');
const folders = readdirSync(backupsDir)
    .filter(f => f.startsWith('backup_'))
    .sort()
    .reverse();

if (folders.length === 0) {
    console.error('❌ No backup folder found. Run export-supabase-data.mjs first.');
    process.exit(1);
}

const latestBackup = join(backupsDir, folders[0]);
console.log(`📂 Using backup: ${folders[0]}`);

// Tables in dependency order (parents before children)
const TABLE_ORDER = [
    'users',
    'materials',
    'employees',
    'inventory',
    'customers',
    'suppliers',
    'orders',
    'import_tickets',
    'export_tickets',
    'order_messages',
    'order_driver_assignments',
    'import_driver_assignments',
    'merged_orders',
    'merged_order_checkins',
];

/**
 * Escape a value for SQL INSERT.
 * Handles: strings, numbers, booleans, null, arrays, objects (JSONB).
 */
function escapeValue(val, colName) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return val.toString();

    // Arrays and objects → JSONB
    if (Array.isArray(val) || typeof val === 'object') {
        const json = JSON.stringify(val);
        return `'${json.replace(/'/g, "''")}'::jsonb`;
    }

    // Strings
    const str = String(val);

    // Check if it looks like a timestamp/date (keep as-is, just quote)
    // PostgreSQL will cast automatically
    return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Generate INSERT statements for a table from its JSON data.
 */
function generateInserts(tableName, rows) {
    if (!rows || rows.length === 0) return '';

    const lines = [];
    lines.push(`-- ============================================`);
    lines.push(`-- TABLE: ${tableName} (${rows.length} rows)`);
    lines.push(`-- ============================================`);
    lines.push('');

    // Get all unique column names across all rows
    const allCols = new Set();
    rows.forEach(row => Object.keys(row).forEach(k => allCols.add(k)));
    const columns = [...allCols];

    // Generate INSERT in batches of 50 to avoid overly long statements
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);

        lines.push(`INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})`);
        lines.push('VALUES');

        const valueRows = batch.map(row => {
            const vals = columns.map(col => escapeValue(row[col], col));
            return `  (${vals.join(', ')})`;
        });

        lines.push(valueRows.join(',\n'));
        lines.push('ON CONFLICT DO NOTHING;');
        lines.push('');
    }

    return lines.join('\n');
}

// Main
console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║       JSON → SQL CONVERTER - Lộc Thiên SCM      ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

let sqlContent = '';
sqlContent += '-- =============================================\n';
sqlContent += '-- FULL BACKUP - Lộc Thiên SCM\n';
sqlContent += `-- Generated: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\n`;
sqlContent += `-- Source: ${folders[0]}\n`;
sqlContent += '-- =============================================\n\n';
sqlContent += '-- Disable triggers during import for performance\n';
sqlContent += 'SET session_replication_role = replica;\n\n';

let totalRows = 0;

for (const table of TABLE_ORDER) {
    const filePath = join(latestBackup, `${table}.json`);

    try {
        const raw = readFileSync(filePath, 'utf-8');
        const rows = JSON.parse(raw);

        if (rows.length === 0) {
            console.log(`  ⏭️  ${table.padEnd(30)} 0 rows (skipped)`);
            continue;
        }

        const sql = generateInserts(table, rows);
        sqlContent += sql + '\n';
        totalRows += rows.length;

        console.log(`  ✅  ${table.padEnd(30)} ${rows.length.toLocaleString('vi-VN')} rows → SQL`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`  ⏭️  ${table.padEnd(30)} no JSON file (skipped)`);
        } else {
            console.log(`  ❌  ${table.padEnd(30)} ${err.message}`);
        }
    }
}

sqlContent += '\n-- Re-enable triggers\n';
sqlContent += 'SET session_replication_role = DEFAULT;\n';
sqlContent += '\n-- Refresh PostgREST schema cache\n';
sqlContent += "NOTIFY pgrst, 'reload schema';\n";
sqlContent += `\n-- Total: ${totalRows} rows exported\n`;

const outputPath = join(latestBackup, 'full_backup.sql');
writeFileSync(outputPath, sqlContent, 'utf-8');

const sizeMB = (Buffer.byteLength(sqlContent, 'utf-8') / 1024 / 1024).toFixed(2);

console.log('');
console.log('══════════════════════════════════════════════════');
console.log(`  📦 Total: ${totalRows.toLocaleString('vi-VN')} rows → SQL`);
console.log(`  📄 File: ${outputPath}`);
console.log(`  💾 Size: ${sizeMB} MB`);
console.log('══════════════════════════════════════════════════');
console.log('');
