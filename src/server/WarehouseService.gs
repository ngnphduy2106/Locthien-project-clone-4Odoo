// ===============================================
// LỘC THIÊN ERP - WAREHOUSE SERVICE (KHO HÀNG)
// ===============================================

/**
 * @fileoverview Quản lý kho hàng, tồn kho, xuất nhập
 * @author Lộc Thiên Dev Team
 */

const WarehouseService = {
  
  /**
   * Lấy danh sách kho
   * @returns {Object} Danh sách kho
   */
  getWarehouses: function() {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      
      // Kiểm tra sheet Kho
      let sheet = ss.getSheetByName(CONFIG.SHEETS.KHO);
      if (!sheet) {
        // Tạo sheet với dữ liệu mặc định
        sheet = ss.insertSheet(CONFIG.SHEETS.KHO);
        sheet.appendRow(['Mã Kho', 'Tên Kho', 'Địa Chỉ', 'Quản Lý', 'Sức Chứa (m³)', 'Hoạt Động']);
        sheet.appendRow(['LT1', 'Kho Lộc Thiên 1', 'Địa chỉ kho 1', '', 1000, true]);
        sheet.appendRow(['LT2', 'Kho Lộc Thiên 2', 'Địa chỉ kho 2', '', 500, true]);
      }
      
      const data = sheet.getDataRange().getValues();
      const warehouses = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        warehouses.push({
          id: row[0],
          name: row[1],
          address: row[2],
          manager: row[3],
          capacity: row[4],
          isActive: row[5] !== false && row[5] !== 'FALSE'
        });
      }
      
      return createResponse(false, 'OK', warehouses);
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Lấy tồn kho theo kho
   * @param {string} warehouseId - ID kho (LT1, LT2, etc.)
   * @returns {Object} Tồn kho
   */
  getInventory: function(warehouseId) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const dataNhap = ss.getSheetByName(CONFIG.SHEETS.DATA_NHAP).getDataRange().getValues();
      const dataXuat = ss.getSheetByName(CONFIG.SHEETS.DATA_XUAT).getDataRange().getValues();
      
      let stockMap = {};
      
      // Cộng nhập theo kho
      for (let i = 1; i < dataNhap.length; i++) {
        const warehouse = String(dataNhap[i][4]).trim().toUpperCase();
        
        // Filter theo kho nếu có
        if (warehouseId && warehouse !== warehouseId.toUpperCase()) continue;
        
        const item = standardizeData(dataNhap[i][9], 'PRODUCT');
        const qty = Number(dataNhap[i][12]) || 0;
        
        if (item) {
          const key = warehouseId ? item : `${warehouse}|${item}`;
          if (!stockMap[key]) {
            stockMap[key] = { 
              name: item, 
              warehouse: warehouse,
              qty: 0,
              totalIn: 0,
              totalOut: 0
            };
          }
          stockMap[key].qty += qty;
          stockMap[key].totalIn += qty;
        }
      }
      
      // Trừ xuất theo kho
      for (let j = 1; j < dataXuat.length; j++) {
        const warehouse = String(dataXuat[j][4]).trim().toUpperCase();
        
        if (warehouseId && warehouse !== warehouseId.toUpperCase()) continue;
        
        const item = standardizeData(dataXuat[j][9], 'PRODUCT');
        const qty = Number(dataXuat[j][12]) || 0;
        
        if (item) {
          const key = warehouseId ? item : `${warehouse}|${item}`;
          if (!stockMap[key]) {
            stockMap[key] = { 
              name: item, 
              warehouse: warehouse,
              qty: 0,
              totalIn: 0,
              totalOut: 0
            };
          }
          stockMap[key].qty -= qty;
          stockMap[key].totalOut += qty;
        }
      }
      
      // Chuyển đổi thành array
      const result = [];
      for (const key in stockMap) {
        const item = stockMap[key];
        item.qty = Math.round(item.qty * 100) / 100;
        
        // Xác định trạng thái
        if (item.qty <= 0) {
          item.status = 'OUT_OF_STOCK';
          item.statusText = 'Hết hàng';
        } else if (item.qty < 100) {
          item.status = 'LOW';
          item.statusText = 'Sắp hết';
        } else {
          item.status = 'OK';
          item.statusText = 'Còn hàng';
        }
        
        result.push(item);
      }
      
      return createResponse(false, 'OK', result.sort((a, b) => a.name.localeCompare(b.name)));
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Điều chỉnh tồn kho
   * @param {Object} data - { warehouseId, materialCode, adjustQty, reason }
   * @returns {Object} Kết quả
   */
  adjustStock: function(data) {
    const lock = LockService.getScriptLock();
    
    try {
      if (!lock.tryLock(10000)) {
        return createResponse(true, 'Hệ thống bận!');
      }
      
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const ts = getTimestamp();
      
      // Xác định đây là điều chỉnh tăng hay giảm
      const adjustQty = Number(data.adjustQty);
      const sheetName = adjustQty >= 0 ? CONFIG.SHEETS.DATA_NHAP : CONFIG.SHEETS.DATA_XUAT;
      const prefix = adjustQty >= 0 ? 'DC-N' : 'DC-X';
      
      const dataSheet = ss.getSheetByName(sheetName);
      const lastRow = dataSheet.getLastRow();
      
      // Tạo ID điều chỉnh
      let nextId = prefix + ts.short;
      
      // Tạo row điều chỉnh
      const row = [
        nextId,
        ts.date,
        ts.full,
        ts.time,
        data.warehouseId || 'LT1',
        'NỘI BỘ (ĐIỀU CHỈNH)',
        data.user || 'SYSTEM',
        '',
        'NỘI BỘ',
        standardizeData(data.materialCode || data.materialName, 'PRODUCT'),
        '',
        'Kg',
        Math.abs(adjustQty),
        Math.abs(adjustQty) / 1000,
        `Điều chỉnh: ${data.reason || 'Không có lý do'}`,
        '',
        data.user || 'SYSTEM',
        '', '', '', '', '', '', '', '',
        'NỘI BỘ'
      ];
      
      dataSheet.getRange(lastRow + 1, 1, 1, 26).setValues([row]);
      
      return createResponse(false, 'Đã điều chỉnh tồn kho!', { id: nextId });
      
    } catch(e) {
      return createResponse(true, e.toString());
    } finally {
      lock.releaseLock();
    }
  },
  
  /**
   * Chuyển kho
   * @param {Object} data - { fromWarehouse, toWarehouse, items: [{name, qty}], user }
   * @returns {Object} Kết quả
   */
  transferStock: function(data) {
    const lock = LockService.getScriptLock();
    
    try {
      if (!lock.tryLock(10000)) {
        return createResponse(true, 'Hệ thống bận!');
      }
      
      if (!data.fromWarehouse || !data.toWarehouse) {
        return createResponse(true, 'Vui lòng chọn kho xuất và kho nhập!');
      }
      
      if (data.fromWarehouse === data.toWarehouse) {
        return createResponse(true, 'Kho xuất và kho nhập không được giống nhau!');
      }
      
      if (!data.items || data.items.length === 0) {
        return createResponse(true, 'Vui lòng chọn vật tư cần chuyển!');
      }
      
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const ts = getTimestamp();
      const transferId = 'CK' + ts.short;
      
      const sheetXuat = ss.getSheetByName(CONFIG.SHEETS.DATA_XUAT);
      const sheetNhap = ss.getSheetByName(CONFIG.SHEETS.DATA_NHAP);
      
      const rowsXuat = [];
      const rowsNhap = [];
      
      data.items.forEach((item, index) => {
        const prodName = standardizeData(item.name, 'PRODUCT');
        const qty = Number(item.qty);
        
        if (qty <= 0) return;
        
        // Phiếu xuất từ kho nguồn
        rowsXuat.push([
          `${transferId}-X${index + 1}`,
          ts.date,
          ts.full,
          ts.time,
          data.fromWarehouse,
          `CHUYỂN KHO → ${data.toWarehouse}`,
          data.user || 'SYSTEM',
          '',
          'NỘI BỘ',
          prodName,
          '',
          'Kg',
          qty,
          qty / 1000,
          `Chuyển kho: ${transferId}`,
          '',
          data.user || 'SYSTEM',
          '', '', '', '', '', '', '', '',
          'NỘI BỘ'
        ]);
        
        // Phiếu nhập vào kho đích
        rowsNhap.push([
          `${transferId}-N${index + 1}`,
          ts.date,
          ts.full,
          ts.time,
          data.toWarehouse,
          `CHUYỂN KHO ← ${data.fromWarehouse}`,
          data.user || 'SYSTEM',
          '',
          'NỘI BỘ',
          prodName,
          '',
          'Kg',
          qty,
          qty / 1000,
          `Chuyển kho: ${transferId}`,
          '',
          data.user || 'SYSTEM',
          '', '', '', '', '', '', '', '',
          'NỘI BỘ'
        ]);
      });
      
      // Ghi vào sheets
      if (rowsXuat.length > 0) {
        sheetXuat.getRange(sheetXuat.getLastRow() + 1, 1, rowsXuat.length, 26).setValues(rowsXuat);
      }
      if (rowsNhap.length > 0) {
        sheetNhap.getRange(sheetNhap.getLastRow() + 1, 1, rowsNhap.length, 26).setValues(rowsNhap);
      }
      
      // Thông báo
      NotificationService.sendTelegram(
        `📦 <b>CHUYỂN KHO ${transferId}</b>\n` +
        `📤 Từ: ${data.fromWarehouse}\n` +
        `📥 Đến: ${data.toWarehouse}\n` +
        `👤 Người thực hiện: ${data.user}\n\n` +
        data.items.map(i => `- ${i.name}: ${i.qty} Kg`).join('\n'),
        CONFIG.TELEGRAM_CHAT_NOTIFY
      );
      
      return createResponse(false, 'Đã chuyển kho thành công!', { transferId: transferId });
      
    } catch(e) {
      return createResponse(true, e.toString());
    } finally {
      lock.releaseLock();
    }
  },
  
  /**
   * Lấy cảnh báo tồn kho thấp
   * @param {number} threshold - Ngưỡng cảnh báo (mặc định 100 kg)
   * @returns {Object} Danh sách cảnh báo
   */
  getLowStockAlerts: function(threshold = 100) {
    try {
      const inventoryRes = this.getInventory();
      if (inventoryRes.error) return inventoryRes;
      
      const alerts = inventoryRes.data.filter(item => {
        // Chỉ lấy items có tồn dương nhưng thấp
        return item.qty > 0 && item.qty < threshold;
      }).map(item => ({
        ...item,
        alertLevel: item.qty < threshold / 2 ? 'CRITICAL' : 'WARNING'
      }));
      
      return createResponse(false, 'OK', alerts.sort((a, b) => a.qty - b.qty));
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Lịch sử xuất nhập theo sản phẩm
   * @param {string} productName - Tên sản phẩm
   * @param {string} fromDate - Từ ngày
   * @param {string} toDate - Đến ngày
   * @returns {Object} Lịch sử xuất nhập
   */
  getProductHistory: function(productName, fromDate, toDate) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const prodClean = standardizeData(productName, 'PRODUCT');
      
      const from = new Date(fromDate);
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      
      const history = [];
      
      // Lấy từ sheet nhập
      const dataNhap = ss.getSheetByName(CONFIG.SHEETS.DATA_NHAP).getDataRange().getValues();
      for (let i = 1; i < dataNhap.length; i++) {
        const row = dataNhap[i];
        const rowProd = standardizeData(row[9], 'PRODUCT');
        
        if (rowProd !== prodClean) continue;
        
        // Parse date
        let rowDate;
        try {
          const p = String(row[1]).split('/');
          if (p.length === 3) rowDate = new Date(p[2], p[1] - 1, p[0]);
        } catch(e) { continue; }
        
        if (rowDate < from || rowDate > to) continue;
        
        history.push({
          id: row[0],
          date: row[1],
          time: row[3],
          warehouse: row[4],
          partner: row[5],
          type: 'NHAP',
          qty: Number(row[12]),
          driver: row[6],
          note: row[14]
        });
      }
      
      // Lấy từ sheet xuất
      const dataXuat = ss.getSheetByName(CONFIG.SHEETS.DATA_XUAT).getDataRange().getValues();
      for (let j = 1; j < dataXuat.length; j++) {
        const row = dataXuat[j];
        const rowProd = standardizeData(row[9], 'PRODUCT');
        
        if (rowProd !== prodClean) continue;
        
        let rowDate;
        try {
          const p = String(row[1]).split('/');
          if (p.length === 3) rowDate = new Date(p[2], p[1] - 1, p[0]);
        } catch(e) { continue; }
        
        if (rowDate < from || rowDate > to) continue;
        
        history.push({
          id: row[0],
          date: row[1],
          time: row[3],
          warehouse: row[4],
          partner: row[5],
          type: 'XUAT',
          qty: Number(row[12]),
          driver: row[6],
          note: row[14]
        });
      }
      
      // Sort theo ngày giờ
      history.sort((a, b) => {
        const dateA = a.date + ' ' + a.time;
        const dateB = b.date + ' ' + b.time;
        return dateB.localeCompare(dateA);
      });
      
      return createResponse(false, 'OK', history);
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  }
};
