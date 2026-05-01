// ===============================================
// LỘC THIÊN ERP - CONFIG & CONSTANTS
// ===============================================

/**
 * @fileoverview Cấu hình toàn cục cho hệ thống ERP Lộc Thiên
 * @author Lộc Thiên Dev Team
 * @version 2.0.0
 */

const CONFIG = {
  // === SPREADSHEET IDs ===
  SHEET_ID: '1kShrJvZ3Fiw1f3KEBtb6668GEJqoToy1ifqU_9Rb2BI', 
  USER_DB_ID: '132UT-GBRkPz7FK8p9H_U7Q_8vLdVAYKhOAUAwrA5VEg',
  
  // === GOOGLE DRIVE ===
  FOLDER_ID: '17n4ix3miAiQI7ekhwTQTjPnXhOgLmsho', 
  
  // === TELEGRAM NOTIFICATIONS ===
  TELEGRAM_TOKEN: '8547589007:AAG-K10TbcvlCdRZmPKIJtjKMDRSSI8I-38', 
  TELEGRAM_CHAT_NHAP: '-1003188405868', 
  TELEGRAM_CHAT_XUAT: '-1003558895641',
  TELEGRAM_CHAT_NOTIFY: '-1003502049346',
  
  // === MISA CRM (lưu trong Script Properties cho bảo mật) ===
  // Lấy bằng: PropertiesService.getScriptProperties().getProperty('MISA_CLIENT_ID')
  
  // === APP SETTINGS ===
  APP_VERSION: 'V2.0.0',
  TIMEZONE: 'GMT+7',
  DATE_FORMAT: 'dd/MM/yyyy HH:mm:ss',
  
  // === SHEET NAMES ===
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
    NHAN_VIEN: 'NhanVien',
    CHAM_CONG: 'ChamCong',
    LUONG: 'Luong',
    KHO: 'Kho',
    TON_KHO: 'TonKho'
  },
  
  // === ORDER STATUS ===
  STATUS: {
    NEW: 'Mới',
    WAITING: 'Chờ giao hàng',
    DELIVERING: 'Đang giao hàng',
    DELIVERED: 'Đã giao hàng',
    COMPLETED: 'Hoàn thành',
    CANCELLED: 'Đã hủy'
  },
  
  // === USER ROLES ===
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

// === HELPER FUNCTIONS ===

/**
 * Chuẩn hóa text (loại bỏ khoảng trắng, uppercase)
 * @param {string} text - Text cần chuẩn hóa
 * @param {string} type - Loại: PARTNER, PRODUCT, hoặc khác
 * @returns {string} Text đã chuẩn hóa
 */
function standardizeData(text, type) {
  if (!text) return "";
  let s = String(text).trim().toUpperCase().replace(/\s+/g, ' '); 
  
  if (type === 'PARTNER') {
    // Loại bỏ tiền tố công ty
    s = s.replace(/^(CÔNG TY|CTY|NHÀ MÁY|DNTN|DOANH NGHIỆP|TNHH|CHI NHÁNH|CP)\s+/gi, '')
         .replace(/^[\.,-\s]+/, '');
    return s.trim();
  }
  
  if (type === 'PRODUCT') { 
    // Loại bỏ tất cả khoảng trắng để so sánh chính xác
    return s.replace(/\s/g, ''); 
  }
  
  return s;
}

/**
 * Format ngày thành chuỗi YYYY-MM-DD
 * @param {Date|string} rawDate - Ngày cần format
 * @returns {string} Chuỗi ngày đã format
 */
function formatDate(rawDate) {
  if (!rawDate) return "";
  try {
    if (rawDate instanceof Date) {
      return Utilities.formatDate(rawDate, CONFIG.TIMEZONE, "yyyy-MM-dd");
    }
    if (typeof rawDate === 'string') {
      if (rawDate.includes('/')) { 
        let p = rawDate.split('/'); 
        if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; 
      } 
      if (rawDate.includes('-')) { 
        return rawDate.split('T')[0]; 
      }
    }
  } catch(e) {}
  return "";
}

/**
 * Format ngày thành chuỗi DD/MM/YYYY
 * @param {string} isoDate - Ngày dạng YYYY-MM-DD
 * @returns {string} Chuỗi ngày DD/MM/YYYY
 */
function formatDateVN(isoDate) {
  if (!isoDate) return "";
  return isoDate.split('-').reverse().join('/');
}

/**
 * Tạo ID mới với prefix
 * @param {string} prefix - Tiền tố (N, X, NK, etc.)
 * @param {number} lastNum - Số cuối cùng
 * @returns {string} ID mới
 */
function generateId(prefix, lastNum) {
  let next = (lastNum || 0) + 1;
  let s = next.toString();
  while (s.length < 4) s = "0" + s;
  return prefix + s;
}

/**
 * Lấy timestamp với format đầy đủ
 * @returns {Object} Object chứa các format thời gian
 */
function getTimestamp() {
  const now = new Date();
  return {
    now: now,
    date: Utilities.formatDate(now, CONFIG.TIMEZONE, "dd/MM/yyyy"),
    time: Utilities.formatDate(now, CONFIG.TIMEZONE, "HH:mm:ss"),
    full: Utilities.formatDate(now, CONFIG.TIMEZONE, CONFIG.DATE_FORMAT),
    iso: Utilities.formatDate(now, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss"),
    short: Utilities.formatDate(now, CONFIG.TIMEZONE, "ddHHmm")
  };
}

/**
 * Trả về response JSON chuẩn
 * @param {boolean} error - Có lỗi không
 * @param {string} msg - Thông báo
 * @param {*} data - Dữ liệu trả về
 * @returns {Object} Response object
 */
function createResponse(error, msg, data = null) {
  return { 
    error: error, 
    msg: msg, 
    data: data,
    timestamp: new Date().toISOString()
  };
}
