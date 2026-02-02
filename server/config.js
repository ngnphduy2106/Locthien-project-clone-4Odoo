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
    TELEGRAM_CHAT_DRIVER: process.env.TELEGRAM_CHAT_DRIVER || '',

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
