// ===============================================
// MIGRATION: Convert base64 import images → Supabase Storage URLs
// Run: node server/migrations/migrate_import_images_to_storage.js
// ===============================================
// This script finds all import_tickets with base64 images,
// uploads them to Supabase Storage, and replaces the DB entries
// with CDN URLs. Safe to re-run (skips already-migrated URLs).

import { supabase } from '../db/supabase.js';
import { uploadImages } from '../services/storage.js';

async function migrate() {
    console.log('🔄 Starting import images migration...\n');

    const { data: tickets, error } = await supabase
        .from('import_tickets')
        .select('id, ticket_no, images')
        .not('images', 'is', null);

    if (error) {
        console.error('❌ Failed to fetch tickets:', error.message);
        process.exit(1);
    }

    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const ticket of (tickets || [])) {
        const images = ticket.images || [];
        if (images.length === 0) continue;

        // Check if any images are still base64
        const base64Images = images.filter(img => !img.startsWith('http'));
        if (base64Images.length === 0) {
            totalSkipped++;
            continue;
        }

        console.log(`📸 Migrating ${ticket.ticket_no || ticket.id}: ${base64Images.length} base64 images...`);

        try {
            // Upload all images (uploadImages skips URLs automatically)
            const newImages = await uploadImages(images, ticket.id);
            const cdnCount = newImages.filter(u => u.startsWith('http')).length;

            if (cdnCount > 0) {
                await supabase
                    .from('import_tickets')
                    .update({ images: newImages })
                    .eq('id', ticket.id);

                totalMigrated++;
                console.log(`  ✅ ${ticket.ticket_no}: ${cdnCount}/${images.length} → CDN`);
            } else {
                totalFailed++;
                console.log(`  ⚠️ ${ticket.ticket_no}: upload failed, kept base64`);
            }

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            totalFailed++;
            console.error(`  ❌ ${ticket.ticket_no}: ${e.message}`);
        }
    }

    console.log('\n✨ Migration complete!');
    console.log(`  Migrated: ${totalMigrated}`);
    console.log(`  Skipped (already CDN): ${totalSkipped}`);
    console.log(`  Failed: ${totalFailed}`);
    process.exit(0);
}

migrate();
