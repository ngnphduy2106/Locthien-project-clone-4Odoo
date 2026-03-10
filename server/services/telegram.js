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
