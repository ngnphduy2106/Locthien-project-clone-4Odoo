// ===============================================
// LỘC THIÊN ERP - NOTIFICATION SERVICE
// ===============================================

/**
 * @fileoverview Xử lý thông báo Telegram, Email, etc.
 * @author Lộc Thiên Dev Team
 */

const NotificationService = {
  
  /**
   * Gửi thông báo Telegram
   * @param {string} message - Nội dung tin nhắn (HTML)
   * @param {string} chatId - ID chat/group
   * @returns {boolean} Thành công hay không
   */
  sendTelegram: function(message, chatId) {
    try {
      if (!CONFIG.TELEGRAM_TOKEN || !chatId) {
        console.log('Missing Telegram config');
        return false;
      }
      
      const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
      
      UrlFetchApp.fetch(url, { 
        method: 'post', 
        payload: { 
          chat_id: chatId, 
          text: message, 
          parse_mode: 'HTML' 
        } 
      });
      
      return true;
      
    } catch (e) {
      console.error('Telegram error:', e);
      return false;
    }
  },
  
  /**
   * Gửi ảnh qua Telegram
   * @param {Blob} imageBlob - Blob ảnh
   * @param {string} caption - Caption (HTML)
   * @param {string} chatId - ID chat/group
   * @returns {boolean} Thành công hay không
   */
  sendTelegramPhoto: function(imageBlob, caption, chatId) {
    try {
      if (!CONFIG.TELEGRAM_TOKEN || !chatId) {
        return false;
      }
      
      const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendPhoto`;
      
      UrlFetchApp.fetch(url, { 
        method: 'post', 
        payload: { 
          chat_id: chatId, 
          photo: imageBlob, 
          caption: caption, 
          parse_mode: 'HTML' 
        } 
      });
      
      return true;
      
    } catch (e) {
      console.error('Telegram photo error:', e);
      return false;
    }
  },
  
  /**
   * Gửi thông báo đơn hàng mới
   * @param {Object} order - Thông tin đơn hàng
   */
  notifyNewOrder: function(order) {
    const isImport = order.type === 'IMPORT';
    const icon = isImport ? '🟠' : '🟢';
    const title = isImport ? 'ĐƠN NHẬP MỚI' : 'ĐƠN XUẤT MỚI';
    
    let msg = `${icon} <b>${title}</b>\n`;
    msg += `📦 Mã: <b>${order.soDon}</b>\n`;
    msg += `📅 Ngày: ${order.ngay}\n`;
    msg += `🏢 Khách: ${order.khach}\n`;
    msg += `📍 Địa chỉ: ${order.diaChi}\n\n`;
    
    if (order.products && order.products.length > 0) {
      msg += `📋 <b>Sản phẩm:</b>\n`;
      order.products.forEach(p => {
        msg += `- ${p.name}: ${p.qty} ${p.unit}\n`;
      });
    }
    
    this.sendTelegram(msg, CONFIG.TELEGRAM_CHAT_NOTIFY);
  },
  
  /**
   * Gửi thông báo điều phối
   * @param {Object} order - Thông tin đơn hàng
   * @param {string} driverName - Tên tài xế
   * @param {string} plate - Biển số xe
   */
  notifyOrderAssigned: function(order, driverName, plate) {
    const isImport = order.type === 'IMPORT';
    const icon = isImport ? '🟠' : '🟢';
    const title = isImport ? 'ĐIỀU PHỐI ĐƠN NHẬP' : 'ĐIỀU PHỐI ĐƠN XUẤT';
    
    const msg = `👮 <b>${icon} ${title}</b>\n` +
      `📦 Mã: <b>${order.soDon}</b>\n` +
      `🏢 Khách: ${order.khach}\n` +
      `👤 Tài xế: <b>${driverName}</b>\n` +
      `🚛 Xe: ${plate}`;
    
    this.sendTelegram(msg, CONFIG.TELEGRAM_CHAT_NOTIFY);
  },
  
  /**
   * Gửi thông báo hoàn thành giao hàng
   * @param {Object} data - Thông tin hoàn thành
   */
  notifyDeliveryComplete: function(data) {
    const chatId = data.type === 'NHAP' ? CONFIG.TELEGRAM_CHAT_NHAP : CONFIG.TELEGRAM_CHAT_XUAT;
    const title = data.type === 'NHAP' ? '🟢 NHẬP KHO (HOÀN THÀNH)' : '🟠 XUẤT KHO (HOÀN THÀNH)';
    
    let msg = `<b>${title} ${data.ticketId}</b>\n`;
    msg += `📅 ${data.date}\n`;
    msg += `🏭 ${data.warehouse}\n`;
    msg += `🏢 ${data.partner}\n`;
    msg += `🚛 ${data.plate}\n`;
    msg += `👤 ${data.driver}\n\n`;
    
    if (data.products && data.products.length > 0) {
      data.products.forEach(p => {
        if (p.qty > 0) {
          msg += `- ${p.name}: ${Number(p.qty).toLocaleString()} ${p.unit}\n`;
        }
      });
    }
    
    if (data.note) {
      msg += `\n📝 ${data.note}`;
    }
    
    if (data.imageBlob) {
      this.sendTelegramPhoto(data.imageBlob, msg, chatId);
    } else {
      this.sendTelegram(msg, chatId);
    }
  },
  
  /**
   * Gửi cảnh báo tồn kho thấp
   * @param {Array} lowStockItems - Danh sách items tồn kho thấp
   */
  notifyLowStock: function(lowStockItems) {
    if (!lowStockItems || lowStockItems.length === 0) return;
    
    let msg = `⚠️ <b>CẢNH BÁO TỒN KHO THẤP</b>\n\n`;
    
    lowStockItems.forEach(item => {
      const icon = item.alertLevel === 'CRITICAL' ? '🔴' : '🟡';
      msg += `${icon} ${item.name}: ${item.qty} kg\n`;
    });
    
    msg += `\n🕐 ${getTimestamp().full}`;
    
    this.sendTelegram(msg, CONFIG.TELEGRAM_CHAT_NOTIFY);
  },
  
  /**
   * Gửi email thông báo
   * @param {string} to - Email người nhận
   * @param {string} subject - Tiêu đề
   * @param {string} body - Nội dung (HTML)
   * @returns {boolean} Thành công hay không
   */
  sendEmail: function(to, subject, body) {
    try {
      MailApp.sendEmail({
        to: to,
        subject: `[Lộc Thiên ERP] ${subject}`,
        htmlBody: body
      });
      return true;
    } catch(e) {
      console.error('Email error:', e);
      return false;
    }
  },
  
  /**
   * Kiểm tra và gửi cảnh báo tồn kho hàng ngày
   * (Có thể đặt trigger chạy mỗi ngày)
   */
  dailyStockCheck: function() {
    try {
      const alertsRes = WarehouseService.getLowStockAlerts(100);
      
      if (!alertsRes.error && alertsRes.data && alertsRes.data.length > 0) {
        this.notifyLowStock(alertsRes.data);
      }
    } catch(e) {
      console.error('Daily stock check error:', e);
    }
  }
};
