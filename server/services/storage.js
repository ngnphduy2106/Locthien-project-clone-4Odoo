// ===============================================
// SUPABASE STORAGE SERVICE — Image Upload/Management
// ===============================================
// Uploads proof images to Supabase Storage instead of storing base64 in DB.
// Returns public URLs for fast CDN-served image loading.

import { supabase } from '../db/supabase.js';
import crypto from 'crypto';

const BUCKET = 'proof-images';

/**
 * Upload a single base64 image to Supabase Storage
 * @param {string} base64Data - Full base64 data URL (data:image/webp;base64,...)
 * @param {string} orderId - Order ID for folder structure
 * @returns {Promise<{url: string|null, error: string|null}>}
 */
export async function uploadImage(base64Data, orderId) {
    try {
        // Parse base64
        const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
            return { url: null, error: 'Invalid base64 format' };
        }

        const rawExt = matches[1].toLowerCase(); // jpg, jpeg, png, webp, gif
        const ext = rawExt === 'jpeg' ? 'jpg' : rawExt; // normalize filename extension
        // Supabase requires 'image/jpeg' not 'image/jpg' — always normalize MIME type
        const mimeType = rawExt === 'jpg' ? 'image/jpeg' : `image/${rawExt}`;
        const buffer = Buffer.from(matches[2], 'base64');

        // Generate unique filename: orderId/timestamp_random.ext
        const hash = crypto.randomBytes(4).toString('hex');
        const timestamp = Date.now();
        const filePath = `${orderId}/${timestamp}_${hash}.${ext}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .upload(filePath, buffer, {
                contentType: mimeType,
                cacheControl: '31536000', // 1 year cache (images never change)
                upsert: false
            });

        if (error) {
            console.error(`❌ Storage upload error for ${orderId}:`, error.message);
            return { url: null, error: error.message };
        }

        // Get public URL
        const { data: publicData } = supabase.storage
            .from(BUCKET)
            .getPublicUrl(filePath);

        return { url: publicData.publicUrl, error: null };
    } catch (e) {
        console.error('Storage upload exception:', e.message);
        return { url: null, error: e.message };
    }
}

/**
 * Upload multiple base64 images, returning URLs for successful uploads
 * Falls back to keeping base64 for any that fail
 * @param {string[]} base64Images - Array of base64 data URLs
 * @param {string} orderId - Order ID
 * @returns {Promise<string[]>} - Array of URLs (or original base64 if upload failed)
 */
export async function uploadImages(base64Images, orderId) {
    if (!base64Images || !base64Images.length) return [];

    const results = await Promise.allSettled(
        base64Images.map(async (img) => {
            // Skip if already a URL (not base64)
            if (img.startsWith('http')) return img;

            const { url, error } = await uploadImage(img, orderId);
            if (url) return url;

            // Fallback: keep base64 if upload fails
            console.warn(`⚠️ Image upload failed for ${orderId}, keeping base64. Error: ${error}`);
            return img;
        })
    );

    return results.map(r => r.status === 'fulfilled' ? r.value : base64Images[results.indexOf(r)]);
}

/**
 * Delete all images for an order from storage
 * @param {string} orderId - Order ID
 */
export async function deleteOrderImages(orderId) {
    try {
        const { data: files } = await supabase.storage
            .from(BUCKET)
            .list(orderId);

        if (files && files.length > 0) {
            const paths = files.map(f => `${orderId}/${f.name}`);
            await supabase.storage.from(BUCKET).remove(paths);
            console.log(`🗑️ Deleted ${paths.length} images for order ${orderId}`);
        }
    } catch (e) {
        console.error('Delete images error:', e.message);
    }
}

/**
 * Check if a string is a URL (vs base64)
 */
export function isImageUrl(str) {
    return str && (str.startsWith('http://') || str.startsWith('https://'));
}
