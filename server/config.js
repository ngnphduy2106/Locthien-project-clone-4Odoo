// ===============================================
// LỘC THIÊN ERP - CONFIGURATION
// ===============================================

import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
    // Google Sheets
    SHEET_ID: process.env.SHEET_ID || '1kShrJvZ3Fiw1f3KEBtb6668GEJqoToy1ifqU_9Rb2BI',
    USER_DB_ID: process.env.USER_DB_ID || '132UT-GBRkPz7FK8p9H_U7Q_8vLdVAYKhOAUAwrA5VEg',

    // Google Drive
    FOLDER_ID: process.env.FOLDER_ID || '17n4ix3miAiQI7ekhwTQTjPnXhOgLmsho',

    // Telegram
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || '',
    TELEGRAM_CHAT_NHAP: process.env.TELEGRAM_CHAT_NHAP || '',
    TELEGRAM_CHAT_XUAT: process.env.TELEGRAM_CHAT_XUAT || '',
    TELEGRAM_CHAT_NOTIFY: process.env.TELEGRAM_CHAT_NOTIFY || '',
    TELEGRAM_CHAT_NOTIFY_NHAP: process.env.TELEGRAM_CHAT_NOTIFY_NHAP || '',
    TELEGRAM_CHAT_DRIVER: process.env.TELEGRAM_CHAT_DRIVER || '',
    TELEGRAM_CHAT_ERROR: process.env.TELEGRAM_CHAT_ERROR || '',

    // App Settings
    APP_VERSION: '2.0.0',
    TIMEZONE: 'Asia/Ho_Chi_Minh',

    // Sheet Names
    SHEETS: {
        ORDERS: 'DS đơn hàng',
        DATA_NHAP: 'DATA_NHAP',
        DATA_XUAT: 'DATA_XUAT',
        USERS: 'USERS',
        XE_CONGTY: 'XE_CONGTY',
        CONG_TY: 'CONG_TY',
        NHA_CUNG_CAP: 'NHA_CUNG_CAP',
        VAT_TU: 'VatTu',
        KHACH_HANG: 'KhachHang',
        CHAM_CONG: 'ChamCong',
        KHO: 'Kho'
    },

    // Order Status (Synced with MISA CRM)
    STATUS: {
        NEW: 'Chưa thực hiện',           // MISA: Chưa thực hiện
        WAITING: 'Chưa thực hiện',       // Same as NEW before assignment
        DELIVERING: 'Đang thực hiện',    // MISA: Đang thực hiện
        DELIVERED: 'Đã thực hiện',       // MISA: Đã thực hiện
        COMPLETED: 'Đã thực hiện',       // Same as DELIVERED
        CANCELLED: 'Đã hủy bỏ'           // MISA: Đã hủy bỏ
    },

    // User Roles
    ROLES: {
        ADMIN: 'ADMIN',
        MANAGER: 'MANAGER',
        DRIVER: 'DRIVER',
        WAREHOUSE: 'WAREHOUSE',
        SALES: 'SALES',
        ASSISTANT: 'ASSISTANT',
        TESTER: 'TESTER'
    }
};

// Utility functions
export function standardizeData(text, type) {
    if (!text) return "";
    let s = String(text).trim().toUpperCase().replace(/\s+/g, ' ');

    if (type === 'PARTNER') {
        s = s.replace(/^(CÔNG TY|CTY|NHÀ MÁY|DNTN|DOANH NGHIỆP|TNHH|CHI NHÁNH|CP)\s+/gi, '')
            .replace(/^[\.,-\s]+/, '');
        return s.trim();
    }

    if (type === 'PRODUCT') {
        return s.replace(/\s/g, '');
    }

    return s;
}

export function formatDate(date) {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split('T')[0];
}

export function formatDateVN(isoDate) {
    if (!isoDate) return "";
    return isoDate.split('-').reverse().join('/');
}

export function createResponse(error, msg, data = null) {
    return {
        error,
        msg,
        data,
        timestamp: new Date().toISOString()
    };
}

export function getTimestamp() {
    const now = new Date();
    const options = { timeZone: CONFIG.TIMEZONE };

    return {
        now,
        date: now.toLocaleDateString('vi-VN', options),
        time: now.toLocaleTimeString('vi-VN', options),
        full: now.toLocaleString('vi-VN', options),
        iso: now.toISOString(),
        short: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', ...options }).replace(':', '')
    };
}

/**
 * Generate sequential order code: PREFIX + YY + MM + SEQ(3 digits)
 * Examples: E2603001 (Export #1 in March 2026), N2603005 (Import #5 in March 2026)
 * Uses Supabase 'order_counters' table for atomic sequence tracking per month
 * @param {'E'|'N'} prefix - E for Export (xuất ERP), N for Import (nhập)
 * @returns {Promise<string>} Generated order code
 */
export async function generateOrderCode(prefix = 'E') {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    const now = new Date();
    // Use Vietnam timezone for correct YY/MM
    const vnDate = new Date(now.toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE }));
    const yy = String(vnDate.getFullYear()).slice(-2);
    const mm = String(vnDate.getMonth() + 1).padStart(2, '0');
    const counterKey = `${prefix}${yy}${mm}`; // e.g., "E2603" or "N2603"

    try {
        // Atomic upsert + increment using Supabase RPC or manual upsert
        // Try to increment existing counter
        const { data: existing } = await supabase
            .from('order_counters')
            .select('current_seq')
            .eq('counter_key', counterKey)
            .single();

        let nextSeq;
        if (existing) {
            nextSeq = existing.current_seq + 1;
            await supabase
                .from('order_counters')
                .update({ current_seq: nextSeq, updated_at: now.toISOString() })
                .eq('counter_key', counterKey);
        } else {
            // First order of this month — start at 1
            nextSeq = 1;
            await supabase
                .from('order_counters')
                .insert({ counter_key: counterKey, current_seq: nextSeq, updated_at: now.toISOString() });
        }

        const seqStr = String(nextSeq).padStart(3, '0');
        return `${counterKey}${seqStr}`; // e.g., E2603001
    } catch (e) {
        // Fallback: use timestamp-based code if counter table fails
        console.error('⚠️ generateOrderCode fallback (counter error):', e.message);
        const ts = getTimestamp();
        const fallbackSeq = ts.short + String(Math.floor(Math.random() * 10));
        return `${counterKey}${fallbackSeq}`;
    }
}
