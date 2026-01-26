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

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const json = await response.json();
        if (!json.ok) {
            console.error(`❌ Telegram Error (${type}):`, json.description);
        } else {
            console.log(`✅ Telegram Sent (${type}).`);
        }
    } catch (e) {
        console.error(`❌ Telegram Exception (${type}):`, e.message);
    }
};
