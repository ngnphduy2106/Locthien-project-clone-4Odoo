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

    // Select chat ID based on type
    let chatId = process.env.TELEGRAM_CHAT_NOTIFY;
    if (type === 'NHAP') chatId = process.env.TELEGRAM_CHAT_NHAP;
    if (type === 'XUAT') chatId = process.env.TELEGRAM_CHAT_XUAT;
    if (type === 'DRIVER') chatId = process.env.TELEGRAM_CHAT_DRIVER;
    if (type === 'SALES') chatId = process.env.TELEGRAM_CHAT_SALES;

    if (!token || !chatId || token.includes('YOUR_')) {
        console.warn(`⚠️ Telegram not configured for ${type}. Skipping notification.`);
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

    let chatId = process.env.TELEGRAM_CHAT_NOTIFY;
    if (type === 'NHAP') chatId = process.env.TELEGRAM_CHAT_NHAP;
    if (type === 'XUAT') chatId = process.env.TELEGRAM_CHAT_XUAT;
    if (type === 'DRIVER') chatId = process.env.TELEGRAM_CHAT_DRIVER;
    if (type === 'SALES') chatId = process.env.TELEGRAM_CHAT_SALES;

    if (!token || !chatId || !photoUrls?.length) return null;

    try {
        if (photoUrls.length === 1) {
            // Single photo: use sendPhoto
            const url = `https://api.telegram.org/bot${token}/sendPhoto`;
            const body = {
                chat_id: chatId,
                photo: photoUrls[0],
                caption: caption || undefined,
                parse_mode: 'HTML'
            };
            if (replyToMessageId) body.reply_to_message_id = replyToMessageId;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const json = await response.json();
            if (!json.ok) console.error(`❌ Telegram Photo Error (${type}):`, json.description);
            else console.log(`📸 Telegram Photo Sent (${type}).`);
            return json.result?.message_id || null;
        } else {
            // Multiple photos: use sendMediaGroup (album)
            const url = `https://api.telegram.org/bot${token}/sendMediaGroup`;
            const media = photoUrls.slice(0, 10).map((photoUrl, i) => ({
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
            else console.log(`📸 Telegram ${photoUrls.length} Photos Sent (${type}).`);
            return json.result?.[0]?.message_id || null;
        }
    } catch (e) {
        console.error(`❌ Telegram Photos Exception (${type}):`, e.message);
        return null;
    }
};
