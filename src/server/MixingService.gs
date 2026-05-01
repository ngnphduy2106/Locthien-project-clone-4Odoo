// ===============================================
// LỘC THIÊN ERP - MIXING SERVICE (PHA CHẾ)
// ===============================================

/**
 * @fileoverview Xử lý pha chế hóa chất
 * @author Lộc Thiên Dev Team
 */

const MixingService = {
  
  /**
   * Submit phiếu pha chế
   * @param {Object} form - Thông tin pha chế
   * @returns {Object} Kết quả
   */
  submit: function(form) {
    const lock = LockService.getScriptLock();
    
    try {
      if (!lock.tryLock(10000)) {
        return createResponse(true, 'Hệ thống bận!');
      }
      
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const ts = getTimestamp();
      const userDate = formatDateVN(form.date);
      const mixId = "PHA" + ts.short;
      
      // === XUẤT NGUYÊN LIỆU ===
      const sheetXuat = ss.getSheetByName(CONFIG.SHEETS.DATA_XUAT);
      const rowsXuat = form.ingredients.map(item => [
        mixId + "-X", 
        userDate, 
        ts.full, 
        ts.time, 
        form.warehouse, 
        "NỘI BỘ (PHA CHẾ)", 
        form.user, 
        "", 
        "NỘI BỘ", 
        standardizeData(item.name, 'PRODUCT'), 
        item.density || "", 
        "Kg", 
        item.qty, 
        (item.qty / 1000), 
        `Xuất pha chế mẻ: ${mixId}`, 
        "", 
        form.user, 
        "", "", "", "", "", "", "", "", 
        "NỘI BỘ"
      ]);
      
      if (rowsXuat.length > 0) {
        sheetXuat.getRange(sheetXuat.getLastRow() + 1, 1, rowsXuat.length, 26).setValues(rowsXuat);
      }
      
      // === NHẬP THÀNH PHẨM ===
      const sheetNhap = ss.getSheetByName(CONFIG.SHEETS.DATA_NHAP);
      const rowNhap = [
        mixId + "-N", 
        userDate, 
        ts.full, 
        ts.time, 
        form.warehouse, 
        "NỘI BỘ (PHA CHẾ)", 
        form.user, 
        "", 
        "NỘI BỘ", 
        standardizeData(form.product.name, 'PRODUCT'), 
        form.product.density || "", 
        "Kg", 
        form.product.qty, 
        (form.product.qty / 1000), 
        `Thành phẩm mẻ: ${mixId}`, 
        "", 
        form.user, 
        "", "", "", "", "", "", "", "", 
        "NỘI BỘ"
      ];
      
      sheetNhap.getRange(sheetNhap.getLastRow() + 1, 1, 1, 26).setValues([rowNhap]);
      
      // Gửi thông báo
      this._sendNotification(form, mixId, userDate);
      
      return createResponse(false, 'Đã lưu phiếu pha chế!', { mixId: mixId });
      
    } catch (e) { 
      return createResponse(true, 'Lỗi: ' + e.toString()); 
    } finally { 
      lock.releaseLock(); 
    }
  },
  
  /**
   * Gửi thông báo pha chế
   * @private
   */
  _sendNotification: function(form, mixId, dateStr) {
    try {
      let msg = `🧪 <b>PHA CHẾ ${mixId}</b>\n`;
      msg += `📅 ${dateStr}\n`;
      msg += `🏭 ${form.warehouse}\n`;
      msg += `👤 ${form.user}\n\n`;
      
      msg += `📤 <b>NGUYÊN LIỆU:</b>\n`;
      form.ingredients.forEach(i => {
        msg += `- ${i.name}: ${Number(i.qty).toLocaleString()} kg\n`;
      });
      
      msg += `\n📥 <b>THÀNH PHẨM:</b>\n`;
      msg += `- ${form.product.name}: ${Number(form.product.qty).toLocaleString()} kg`;
      if (form.product.density) msg += ` (d=${form.product.density})`;
      
      NotificationService.sendTelegram(msg, CONFIG.TELEGRAM_CHAT_NOTIFY);
      
    } catch(e) {
      console.error('Error sending mixing notification:', e);
    }
  },
  
  /**
   * Lấy lịch sử pha chế
   * @param {string} fromDate - Từ ngày
   * @param {string} toDate - Đến ngày
   * @returns {Object} Danh sách phiếu pha chế
   */
  getHistory: function(fromDate, toDate) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const sheetNhap = ss.getSheetByName(CONFIG.SHEETS.DATA_NHAP);
      const data = sheetNhap.getDataRange().getValues();
      
      const from = new Date(fromDate);
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      
      const result = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const id = String(row[0]);
        
        // Chỉ lấy phiếu pha chế (có suffix -N)
        if (!id.includes('PHA') || !id.endsWith('-N')) continue;
        
        // Parse ngày
        let rowDate;
        try {
          const dateStr = String(row[1]);
          const p = dateStr.split('/');
          if (p.length === 3) {
            rowDate = new Date(p[2], p[1] - 1, p[0]);
          }
        } catch(e) { continue; }
        
        if (rowDate < from || rowDate > to) continue;
        
        result.push({
          id: id.replace('-N', ''),
          date: row[1],
          warehouse: row[4],
          user: row[6],
          product: row[9],
          quantity: row[12],
          density: row[10]
        });
      }
      
      return createResponse(false, 'OK', result);
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  }
};
