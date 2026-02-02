// ===============================================
// TELEGRAM NOTIFICATION SERVICE
// ===============================================

import fetch from 'node-fetch';

export const sendTelegramMessage = async (text, type = 'NOTIFY') => {
    const token = process.env.TELEGRAM_TOKEN;

    // Select chat ID based on type
    let chatId = process.env.TELEGRAM_CHAT_NOTIFY;
    if (type === 'NHAP') chatId = process.env.TELEGRAM_CHAT_NHAP;
    if (type === 'XUAT') chatId = process.env.TELEGRAM_CHAT_XUAT;
    if (type === 'DRIVER') chatId = process.env.TELEGRAM_CHAT_DRIVER;

    if (!token || !chatId || token.includes('YOUR_')) {
        console.warn(`⚠️ Telegram not configured for ${type}. Skipping notification.`);
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const body = {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        };

        // Fire and forget - don't block the caller
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(response => response.json())
            .then(json => {
                if (!json.ok) console.error(`❌ Telegram Error (${type}):`, json.description);
                else console.log(`✅ Telegram Sent (${type}).`);
            })
            .catch(err => console.error(`❌ Telegram Fetch Error (${type}):`, err.message));

    } catch (e) {
        console.error(`❌ Telegram Exception (${type}):`, e.message);
    }
};
