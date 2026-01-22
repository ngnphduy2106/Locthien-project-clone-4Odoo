// ===============================================
// TELEGRAM NOTIFICATION SERVICE
// ===============================================

import fetch from 'node-fetch';

export const sendTelegramMessage = async (text) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId || token === 'YOUR_TELEGRAM_BOT_TOKEN') {
        console.warn('⚠️ Telegram not configured. Skipping notification.');
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
            console.error('❌ Telegram Error:', json.description);
        } else {
            console.log('✅ Telegram Sent.');
        }
    } catch (e) {
        console.error('❌ Telegram Exception:', e.message);
    }
};
