#!/usr/bin/env node
/**
 * Download ALL proof images from Supabase Storage → Upload to Odoo
 * Fixed: properly lists files inside subfolders (UUID order IDs)
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://zfgrkvsaaxfvfddkkcrt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AHZWuRirayAbDYWKncCANg_TdGMV1Qd';
const BUCKET = 'proof-images';

const ODOO_URL = 'https://odoo-dev.new.ai.vn';
const ODOO_DB = 'Odoo-LT';
const ODOO_USER = 'locthien.cloud@gmail.com';
const ODOO_PASS = 'Locthien@123';

const DOWNLOAD_DIR = join(__dirname, 'backups', 'proof-images');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
async function odooCall(uid, model, method, args = [], kwargs = {}) {
    return rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_PASS, model, method, args, kwargs]);
}

// ============================================================
// STEP 1: List ALL files recursively from Supabase Storage
// ============================================================
async function listAllFiles() {
    console.log('📂 Scanning Supabase Storage bucket:', BUCKET);
    const allFiles = [];

    // List top-level (these are folders named after order IDs)
    const { data: folders, error } = await supabase.storage.from(BUCKET).list('', { limit: 10000 });
    if (error) { console.error('❌', error.message); return []; }

    const topFolders = folders.filter(f => f.id === null); // folders have id=null
    const topFiles = folders.filter(f => f.id !== null);    // actual files have an id

    // Add root-level files
    for (const f of topFiles) {
        allFiles.push({ folder: '', name: f.name, path: f.name, size: f.metadata?.size || 0 });
    }

    console.log(`  📁 ${topFolders.length} folders, ${topFiles.length} root files`);

    // Scan each folder for images
    for (const folder of topFolders) {
        const { data: files, error: fErr } = await supabase.storage
            .from(BUCKET).list(folder.name, { limit: 1000 });

        if (fErr || !files) continue;

        const realFiles = files.filter(f => f.id !== null);
        for (const file of realFiles) {
            allFiles.push({
                folder: folder.name,
                name: file.name,
                path: `${folder.name}/${file.name}`,
                size: file.metadata?.size || 0,
            });
        }

        if (realFiles.length > 0) {
            console.log(`    📁 ${folder.name}: ${realFiles.length} images`);
        }
    }

    const totalMB = allFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
    console.log(`\n✅ Total: ${allFiles.length} files (~${totalMB.toFixed(1)} MB)`);
    return allFiles;
}

// ============================================================
// STEP 2: Download all to local disk
// ============================================================
async function downloadFiles(files) {
    console.log('\n📥 Downloading images...');
    if (!existsSync(DOWNLOAD_DIR)) mkdirSync(DOWNLOAD_DIR, { recursive: true });

    let ok = 0, skip = 0, errors = 0;

    for (const file of files) {
        const localDir = join(DOWNLOAD_DIR, file.folder);
        if (!existsSync(localDir)) mkdirSync(localDir, { recursive: true });

        const localPath = join(localDir, file.name);
        if (existsSync(localPath)) { skip++; continue; }

        try {
            const { data, error } = await supabase.storage.from(BUCKET).download(file.path);
            if (error) throw new Error(error.message);

            const buffer = Buffer.from(await data.arrayBuffer());
            writeFileSync(localPath, buffer);
            ok++;
            if (ok % 25 === 0) console.log(`    ... ${ok}/${files.length}`);
        } catch (e) {
            errors++;
            if (errors <= 5) console.log(`    ⚠️ ${file.path}: ${e.message.substring(0, 80)}`);
        }
    }
    console.log(`  ✅ Downloaded: ${ok}, Skipped: ${skip}, Errors: ${errors}`);
}

// ============================================================
// STEP 3: Upload to Odoo ir.attachment
// ============================================================
async function uploadToOdoo(files) {
    console.log('\n📤 Uploading to Odoo ir.attachment...');

    const uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
    if (!uid) { console.error('❌ Auth failed'); return; }
    console.log(`  ✅ Odoo uid=${uid}`);

    let uploaded = 0, errors = 0;

    // Group by folder (= order/assignment ID)
    const grouped = {};
    for (const f of files) {
        const key = f.folder || '_root';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(f);
    }

    for (const [folderId, orderFiles] of Object.entries(grouped)) {
        if (folderId === '_root') continue;

        // Try to find matching sale.order by client_order_ref
        let resId = 0;
        const oids = await odooCall(uid, 'sale.order', 'search',
            [[['client_order_ref', '=', folderId]]], { limit: 1 });
        if (oids.length) resId = oids[0];

        for (const file of orderFiles) {
            const localPath = join(DOWNLOAD_DIR, file.folder, file.name);
            if (!existsSync(localPath)) continue;

            try {
                const buffer = readFileSync(localPath);
                const base64 = buffer.toString('base64');

                await odooCall(uid, 'ir.attachment', 'create', [{
                    name: `proof_${folderId}_${file.name}`,
                    datas: base64,
                    type: 'binary',
                    res_model: resId ? 'sale.order' : false,
                    res_id: resId,
                    description: `Ảnh giao hàng - ${folderId}`,
                }]);
                uploaded++;
                if (uploaded % 25 === 0) console.log(`    ... ${uploaded} uploaded`);
            } catch (e) {
                errors++;
                if (errors <= 5) console.log(`    ⚠️ ${file.name}: ${e.message.substring(0, 80)}`);
            }
        }
    }
    console.log(`  ✅ Uploaded: ${uploaded}, Errors: ${errors}`);
}

// ============================================================
async function main() {
    console.log('='.repeat(60));
    console.log('📸 PROOF IMAGES: Supabase Storage → Local → Odoo');
    console.log('='.repeat(60));

    const files = await listAllFiles();
    if (!files.length) { console.log('ℹ️ No images found'); return; }

    await downloadFiles(files);
    await uploadToOdoo(files);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 IMAGE MIGRATION COMPLETE!');
    console.log(`   Backup: ${DOWNLOAD_DIR}`);
    console.log('='.repeat(60));
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
