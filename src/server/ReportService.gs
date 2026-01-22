// ===============================================
// LỘC THIÊN ERP - REPORT SERVICE
// ===============================================

/**
 * @fileoverview Xử lý báo cáo và thống kê
 * @author Lộc Thiên Dev Team
 */

const ReportService = {
  
  /**
   * Lấy dữ liệu báo cáo
   * @param {string} fromDateStr - Từ ngày (YYYY-MM-DD)
   * @param {string} toDateStr - Đến ngày (YYYY-MM-DD)
   * @param {string} sPartner - Lọc theo đối tác
   * @param {string} sProduct - Lọc theo sản phẩm
   * @returns {Object} Dữ liệu báo cáo
   */
  getReport: function(fromDateStr, toDateStr, sPartner, sProduct) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      
      // Chuẩn hóa filter
      const sPartnerClean = standardizeData(sPartner, 'PARTNER');
      const sProductClean = standardizeData(sProduct, 'PRODUCT');
      
      // Parse dates
      const fromDate = new Date(fromDateStr);
      const toDate = new Date(toDateStr);
      toDate.setHours(23, 59, 59, 999);
      
      let reportMap = {};
      
      // Xử lý từng sheet
      this._processSheet(ss, CONFIG.SHEETS.DATA_NHAP, 'NHAP', fromDate, toDate, sPartnerClean, sProductClean, reportMap);
      this._processSheet(ss, CONFIG.SHEETS.DATA_XUAT, 'XUAT', fromDate, toDate, sPartnerClean, sProductClean, reportMap);
      
      // Chuyển đổi map thành array
      const result = [];
      for (const key in reportMap) {
        const pList = [];
        for (const pKey in reportMap[key].products) {
          pList.push({ 
            name: pKey, 
            ...reportMap[key].products[pKey] 
          });
        }
        if (pList.length > 0) {
          result.push({ 
            name: key, 
            products: pList 
          });
        }
      }
      
      return createResponse(false, 'OK', result.sort((a, b) => a.name.localeCompare(b.name)));
      
    } catch (e) { 
      return createResponse(true, "Lỗi Báo Cáo: " + e.toString()); 
    }
  },
  
  /**
   * Xử lý dữ liệu từ sheet
   * @private
   */
  _processSheet: function(ss, sheetName, type, fromDate, toDate, sPartner, sProduct, reportMap) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Parse ngày
      let rowDate = row[1];
      if (!(rowDate instanceof Date)) {
        try {
          const p = String(rowDate).split('/');
          if (p.length === 3) {
            rowDate = new Date(p[2], p[1] - 1, p[0]);
          } else {
            rowDate = new Date(rowDate);
          }
        } catch(e) { continue; }
      }
      
      // Filter theo ngày
      if (rowDate < fromDate || rowDate > toDate) continue;
      
      // Chuẩn hóa dữ liệu
      const company = standardizeData(row[5], 'PARTNER');
      const prodName = standardizeData(row[9], 'PRODUCT');
      
      // Filter theo đối tác
      if (sPartner && !company.includes(sPartner)) continue;
      
      // Filter theo sản phẩm
      if (sProduct && !prodName.includes(sProduct)) continue;
      
      // Bỏ qua nếu không có tên công ty
      if (!company) continue;
      
      // Khởi tạo entry nếu chưa có
      if (!reportMap[company]) {
        reportMap[company] = { name: company, products: {} };
      }
      
      // Bỏ qua vỏ/can trong thống kê sản phẩm
      if (prodName && !prodName.includes("VỎ/CAN")) {
        if (!reportMap[company].products[prodName]) {
          reportMap[company].products[prodName] = { in: 0, out: 0 };
        }
        
        const kg = Number(row[12]) || 0;
        if (type === 'NHAP') {
          reportMap[company].products[prodName].in += kg;
        } else {
          reportMap[company].products[prodName].out += kg;
        }
      }
    }
  },
  
  /**
   * Lấy tồn kho real-time
   * @returns {Object} Dữ liệu tồn kho
   */
  getInventory: function() {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const dataNhap = ss.getSheetByName(CONFIG.SHEETS.DATA_NHAP).getDataRange().getValues();
      const dataXuat = ss.getSheetByName(CONFIG.SHEETS.DATA_XUAT).getDataRange().getValues();
      
      let stockMap = {};
      
      // Cộng nhập
      for (let i = 1; i < dataNhap.length; i++) {
        const item = standardizeData(dataNhap[i][9], 'PRODUCT');
        const qty = Number(dataNhap[i][12]) || 0;
        if (item) {
          if (!stockMap[item]) stockMap[item] = 0;
          stockMap[item] += qty;
        }
      }
      
      // Trừ xuất
      for (let j = 1; j < dataXuat.length; j++) {
        const item = standardizeData(dataXuat[j][9], 'PRODUCT');
        const qty = Number(dataXuat[j][12]) || 0;
        if (item) {
          if (!stockMap[item]) stockMap[item] = 0;
          stockMap[item] -= qty;
        }
      }
      
      // Chuyển đổi thành array và filter items có tồn
      const result = [];
      for (const key in stockMap) {
        if (Math.abs(stockMap[key]) > 0.001) {
          result.push({ 
            name: key, 
            qty: Math.round(stockMap[key] * 100) / 100 // Làm tròn 2 số lẻ
          });
        }
      }
      
      return createResponse(false, 'OK', result.sort((a, b) => a.name.localeCompare(b.name)));
      
    } catch(e) { 
      return createResponse(true, e.toString()); 
    }
  },
  
  /**
   * Lấy tồn kho theo kho
   * @param {string} warehouseId - ID kho (LT1, LT2, etc.)
   * @returns {Object} Tồn kho theo kho
   */
  getInventoryByWarehouse: function(warehouseId) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const dataNhap = ss.getSheetByName(CONFIG.SHEETS.DATA_NHAP).getDataRange().getValues();
      const dataXuat = ss.getSheetByName(CONFIG.SHEETS.DATA_XUAT).getDataRange().getValues();
      
      let stockMap = {};
      
      // Cộng nhập theo kho
      for (let i = 1; i < dataNhap.length; i++) {
        const warehouse = String(dataNhap[i][4]).trim().toUpperCase();
        if (warehouseId && warehouse !== warehouseId.toUpperCase()) continue;
        
        const item = standardizeData(dataNhap[i][9], 'PRODUCT');
        const qty = Number(dataNhap[i][12]) || 0;
        if (item) {
          if (!stockMap[item]) stockMap[item] = { qty: 0, warehouse: warehouse };
          stockMap[item].qty += qty;
        }
      }
      
      // Trừ xuất theo kho
      for (let j = 1; j < dataXuat.length; j++) {
        const warehouse = String(dataXuat[j][4]).trim().toUpperCase();
        if (warehouseId && warehouse !== warehouseId.toUpperCase()) continue;
        
        const item = standardizeData(dataXuat[j][9], 'PRODUCT');
        const qty = Number(dataXuat[j][12]) || 0;
        if (item) {
          if (!stockMap[item]) stockMap[item] = { qty: 0, warehouse: warehouse };
          stockMap[item].qty -= qty;
        }
      }
      
      const result = [];
      for (const key in stockMap) {
        if (Math.abs(stockMap[key].qty) > 0.001) {
          result.push({ 
            name: key, 
            qty: Math.round(stockMap[key].qty * 100) / 100,
            warehouse: stockMap[key].warehouse
          });
        }
      }
      
      return createResponse(false, 'OK', result.sort((a, b) => a.name.localeCompare(b.name)));
      
    } catch(e) { 
      return createResponse(true, e.toString()); 
    }
  },
  
  /**
   * Export báo cáo Excel
   * @param {string} fromDate - Từ ngày
   * @param {string} toDate - Đến ngày
   * @param {string} sPartner - Lọc theo đối tác
   * @param {string} sProduct - Lọc theo sản phẩm
   * @returns {Object} Base64 Excel file
   */
  exportExcel: function(fromDate, toDate, sPartner, sProduct) {
    try {
      // Lấy dữ liệu báo cáo
      const reportData = this.getReport(fromDate, toDate, sPartner, sProduct);
      if (reportData.error) return reportData;
      
      // Tạo spreadsheet tạm
      const tempSS = SpreadsheetApp.create('Báo cáo Lộc Thiên ' + formatDateVN(fromDate) + ' - ' + formatDateVN(toDate));
      const sheet = tempSS.getActiveSheet();
      sheet.setName('Báo cáo');
      
      // Header
      sheet.getRange(1, 1, 1, 5).setValues([['Đối tác', 'Sản phẩm', 'Nhập (Kg)', 'Xuất (Kg)', 'Tồn (Kg)']]);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');
      
      // Data
      let row = 2;
      reportData.data.forEach(partner => {
        partner.products.forEach((product, idx) => {
          sheet.getRange(row, 1, 1, 5).setValues([[
            idx === 0 ? partner.name : '',
            product.name,
            product.in || 0,
            product.out || 0,
            (product.in || 0) - (product.out || 0)
          ]]);
          row++;
        });
      });
      
      // Auto resize columns
      sheet.autoResizeColumns(1, 5);
      
      // Export to Excel
      const url = 'https://docs.google.com/spreadsheets/d/' + tempSS.getId() + '/export?format=xlsx';
      const token = ScriptApp.getOAuthToken();
      const response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      const blob = response.getBlob();
      const base64 = Utilities.base64Encode(blob.getBytes());
      
      // Xóa file tạm
      DriveApp.getFileById(tempSS.getId()).setTrashed(true);
      
      return {
        error: false,
        base64: base64,
        fileName: `BaoCao_LocThien_${fromDate}_${toDate}.xlsx`
      };
      
    } catch(e) {
      return createResponse(true, 'Lỗi export: ' + e.toString());
    }
  },
  
  /**
   * Thống kê tổng quan dashboard
   * @returns {Object} Dữ liệu dashboard
   */
  getDashboardStats: function() {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      
      // Đếm đơn hàng
      const orderSheet = ss.getSheetByName(CONFIG.SHEETS.ORDERS);
      const orderData = orderSheet.getDataRange().getValues();
      const headers = orderData[0].map(h => String(h).toLowerCase().trim());
      const idxStatus = headers.indexOf("delivery_status");
      
      let pendingOrders = 0;
      let deliveringOrders = 0;
      let completedToday = 0;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (let i = 1; i < orderData.length; i++) {
        const status = String(orderData[i][idxStatus]).trim();
        
        if (!status || status === 'Mới' || status === 'Chờ giao hàng') {
          pendingOrders++;
        } else if (status === 'Đang giao hàng') {
          deliveringOrders++;
        } else if (status === 'Đã giao hàng' || status === 'Hoàn thành') {
          // Đếm hoàn thành hôm nay (cần thêm logic check ngày)
          completedToday++;
        }
      }
      
      // Tổng tồn kho
      const inventoryRes = this.getInventory();
      let totalStock = 0;
      if (!inventoryRes.error && inventoryRes.data) {
        inventoryRes.data.forEach(item => {
          if (item.qty > 0) totalStock += item.qty;
        });
      }
      
      // Cảnh báo tồn kho thấp
      const lowStockAlerts = inventoryRes.data ? 
        inventoryRes.data.filter(item => item.qty < 100 && item.qty > 0).length : 0;
      
      return createResponse(false, 'OK', {
        pendingOrders: pendingOrders,
        deliveringOrders: deliveringOrders,
        completedToday: completedToday,
        totalStock: Math.round(totalStock),
        lowStockAlerts: lowStockAlerts
      });
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  }
};
