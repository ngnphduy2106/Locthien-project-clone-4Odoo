// ===============================================
// TELEGRAM NOTIFICATION SERVICE
// ===============================================

import fetch from 'node-fetch';

// Dispatchers to tag in NOTIFY group for new orders
// Uses tg://user?id= format (works without public username)
const NOTIFY_DISPATCHERS = [
    { name: 'Lê Kim Chức', telegramUserId: '8537304516' },
    { name: 'Huỳnh Hương', telegramUserId: '8763113077' },
];

export function getNotifyGroupMentions() {
    return NOTIFY_DISPATCHERS
        .map(d => `<a href="tg://user?id=${d.telegramUserId}">${d.name}</a>`)
        .join(' ');
}

export const sendTelegramMessage = async (text, type = 'NOTIFY', replyToMessageId = null) => {
    const token = process.env.TELEGRAM_TOKEN;
    const { CONFIG } = await import('../config.js');

    // Select chat ID based on type — map old names to new config values
    let chatId = CONFIG.TELEGRAM_CHAT_DIEU_PHOI; // Default: Điều phối
    if (type === 'NOTIFY_NHAP' || type === 'IMPORT_TICKETS') chatId = CONFIG.TELEGRAM_CHAT_IMPORT_TICKETS;
    if (type === 'NHAP') chatId = CONFIG.TELEGRAM_CHAT_NHAP;
    if (type === 'XUAT') chatId = CONFIG.TELEGRAM_CHAT_XUAT;
    if (type === 'DRIVER' || type === 'DELIVERY') chatId = CONFIG.TELEGRAM_CHAT_DELIVERY;
    if (type === 'SALES') chatId = CONFIG.TELEGRAM_CHAT_DRIVER;
    if (type === 'ERROR') chatId = CONFIG.TELEGRAM_CHAT_ERROR;
    if (type === 'NOTIFY') chatId = CONFIG.TELEGRAM_CHAT_DIEU_PHOI;

    if (!token || !chatId || token.includes('YOUR_')) {
        console.warn(`⚠️ Telegram not configured for ${type}. token=${token ? 'SET' : 'MISSING'}, chatId=${chatId || 'MISSING'}. Skipping.`);
        return null;
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const body = {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        };

        // Support reply to a specific message
        if (replyToMessageId) {
            body.reply_to_message_id = replyToMessageId;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const json = await response.json();

        if (!json.ok) {
            console.error(`❌ Telegram Error (${type}):`, json.description);
            return null;
        }

        console.log(`✅ Telegram Sent (${type}).`);
        return json.result?.message_id || null;

    } catch (e) {
        console.error(`❌ Telegram Exception (${type}):`, e.message);
        return null;
    }
};

/**
 * Send photos to a Telegram group
 * @param {string[]} photoUrls - Array of image URLs
 * @param {string} caption - Caption for the first photo
 * @param {string} type - Group type (NOTIFY, NHAP, XUAT, DRIVER, SALES)
 * @param {number|null} replyToMessageId - Optional message ID to reply to
 */
export const sendTelegramPhotos = async (photoUrls, caption = '', type = 'XUAT', replyToMessageId = null) => {
    const token = process.env.TELEGRAM_TOKEN;
    const { CONFIG } = await import('../config.js');

    let chatId = CONFIG.TELEGRAM_CHAT_DIEU_PHOI; // Default: Điều phối
    if (type === 'NOTIFY_NHAP' || type === 'IMPORT_TICKETS') chatId = CONFIG.TELEGRAM_CHAT_IMPORT_TICKETS;
    if (type === 'NHAP') chatId = CONFIG.TELEGRAM_CHAT_NHAP;
    if (type === 'XUAT') chatId = CONFIG.TELEGRAM_CHAT_XUAT;
    if (type === 'DRIVER' || type === 'DELIVERY') chatId = CONFIG.TELEGRAM_CHAT_DELIVERY;
    if (type === 'SALES') chatId = CONFIG.TELEGRAM_CHAT_DRIVER;
    if (type === 'ERROR') chatId = CONFIG.TELEGRAM_CHAT_ERROR;
    if (type === 'NOTIFY') chatId = CONFIG.TELEGRAM_CHAT_DIEU_PHOI;

    if (!token || !chatId || !photoUrls?.length) return null;

    // Helper: check if string is a base64 data URL
    const isBase64 = (str) => typeof str === 'string' && str.startsWith('data:');

    // Helper: send single photo (supports both URL and base64)
    const sendSinglePhoto = async (photoData, captionText, isFirst = true) => {
        const url = `https://api.telegram.org/bot${token}/sendPhoto`;

        if (isBase64(photoData)) {
            // Base64 → multipart form-data upload
            const matches = photoData.match(/^data:image\/(\w+);base64,(.+)$/);
            if (!matches) {
                console.error('❌ Invalid base64 image format');
                return null;
            }
            const ext = matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            const boundary = '----TelegramBoundary' + Date.now();

            let body = '';
            body += `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
            if (captionText) body += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${captionText}\r\n`;
            if (captionText) body += `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;
            if (replyToMessageId && isFirst) body += `--${boundary}\r\nContent-Disposition: form-data; name="reply_to_message_id"\r\n\r\n${replyToMessageId}\r\n`;
            body += `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="proof.${ext}"\r\nContent-Type: image/${ext}\r\n\r\n`;

            const prefix = Buffer.from(body, 'utf-8');
            const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
            const fullBody = Buffer.concat([prefix, buffer, suffix]);

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                body: fullBody
            });
            return response.json();
        } else {
            // HTTP URL → JSON body
            const body = {
                chat_id: chatId,
                photo: photoData,
                caption: captionText || undefined,
                parse_mode: 'HTML'
            };
            if (replyToMessageId && isFirst) body.reply_to_message_id = replyToMessageId;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return response.json();
        }
    };

    try {
        const hasBase64 = photoUrls.some(isBase64);
        const photos = photoUrls.slice(0, 5); // Max 5 photos

        if (photos.length === 1) {
            // Single photo: sendPhoto with caption
            const json = await sendSinglePhoto(photos[0], caption, true);
            if (json?.ok) {
                console.log(`📸 Telegram Photo Sent (${type}).`);
                return json.result?.message_id || null;
            } else {
                console.error(`❌ Telegram Photo Error (${type}):`, json?.description);
                return null;
            }
        } else if (hasBase64) {
            // Multiple base64 photos: sendMediaGroup with multipart file attachments
            const url = `https://api.telegram.org/bot${token}/sendMediaGroup`;
            const boundary = '----TgAlbum' + Date.now();
            const buffers = [];

            // Build media JSON array referencing attached files
            const media = photos.map((photo, i) => ({
                type: 'photo',
                media: isBase64(photo) ? `attach://photo_${i}` : photo,
                ...(i === 0 && caption ? { caption, parse_mode: 'HTML' } : {})
            }));

            // Add chat_id field
            buffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));

            // Add media JSON field
            buffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"\r\n\r\n${JSON.stringify(media)}\r\n`));

            if (replyToMessageId) {
                buffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reply_to_message_id"\r\n\r\n${replyToMessageId}\r\n`));
            }

            // Add each base64 photo as file attachment
            for (let i = 0; i < photos.length; i++) {
                if (isBase64(photos[i])) {
                    const matches = photos[i].match(/^data:image\/(\w+);base64,(.+)$/);
                    if (!matches) continue;
                    const ext = matches[1];
                    const imgBuffer = Buffer.from(matches[2], 'base64');
                    buffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo_${i}"; filename="proof_${i}.${ext}"\r\nContent-Type: image/${ext}\r\n\r\n`));
                    buffers.push(imgBuffer);
                    buffers.push(Buffer.from('\r\n'));
                }
            }

            // Close boundary
            buffers.push(Buffer.from(`--${boundary}--\r\n`));
            const fullBody = Buffer.concat(buffers);

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                body: fullBody
            });
            const json = await response.json();
            if (!json.ok) console.error(`❌ Telegram MediaGroup Error (${type}):`, json.description);
            else console.log(`📸 Telegram ${photos.length} Photos Album Sent (${type}).`);
            return json.result?.[0]?.message_id || null;
        } else {
            // Multiple HTTP URL photos: sendMediaGroup with JSON
            const url = `https://api.telegram.org/bot${token}/sendMediaGroup`;
            const media = photos.map((photoUrl, i) => ({
                type: 'photo',
                media: photoUrl,
                ...(i === 0 && caption ? { caption, parse_mode: 'HTML' } : {})
            }));
            const body = { chat_id: chatId, media };
            if (replyToMessageId) body.reply_to_message_id = replyToMessageId;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const json = await response.json();
            if (!json.ok) console.error(`❌ Telegram MediaGroup Error (${type}):`, json.description);
            else console.log(`📸 Telegram ${photos.length} Photos Sent (${type}).`);
            return json.result?.[0]?.message_id || null;
        }
    } catch (e) {
        console.error(`❌ Telegram Photos Exception (${type}):`, e.message);
        return null;
    }
};
