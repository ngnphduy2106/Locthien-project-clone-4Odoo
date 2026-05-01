// ===============================================
// LỘC THIÊN ERP - ORDER SERVICE
// ===============================================

/**
 * @fileoverview Xử lý đơn hàng - điều phối, giao nhận
 * @author Lộc Thiên Dev Team
 */

const OrderService = {
  
  /**
   * Lấy danh sách đơn hàng cho Admin
   * @returns {Object} Danh sách đơn pending và assigned
   */
  getOrdersForAdmin: function() {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEETS.ORDERS);
      const lastRow = sheet.getLastRow();
      
      if (lastRow < 2) {
        return { error: false, pending: [], assigned: [], drivers: [] };
      }

      // Giới hạn 1000 dòng gần nhất để tối ưu performance
      const LIMIT = 1000;
      const startRow = Math.max(2, lastRow - LIMIT + 1);
      const numRows = lastRow - startRow + 1;
      const data = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        .map(h => String(h).toLowerCase().trim());

      // Mapping column indexes
      const idx = {
        SO_DON: headers.indexOf("sale_order_no"),
        KHACH: headers.indexOf("account_name"),
        NGAY: headers.indexOf("sale_order_date"),
        DIA_CHI: headers.indexOf("shipping_address"),
        STATUS_GIAO: headers.indexOf("delivery_status"),
        TAI_XE: headers.indexOf("custom_field13"),
        BIEN_SO: headers.indexOf("custom_field14"),
        JSON_HANG: headers.indexOf("sale_order_product_mappings"),
        MO_TA: headers.indexOf("description")
      };

      let pendingList = [];
      let assignedList = [];
      const completedStatuses = ["Đã giao hàng", "Hoàn thành", "Đã hủy", "Hủy bỏ"];

      // Duyệt từ cuối lên (đơn mới nhất trước)
      for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        const statusGiao = String(row[idx.STATUS_GIAO] || "").trim();
        
        // Bỏ qua đơn đã hoàn thành/hủy
        if (completedStatuses.includes(statusGiao)) continue;

        // Parse ngày
        const dateStr = formatDate(row[idx.NGAY]);

        // Parse tên tài xế
        let driverName = String(row[idx.TAI_XE] || "").trim();
        if (driverName === "0") driverName = "";

        // Parse products từ JSON
        const products = this._parseProducts(row[idx.JSON_HANG], row[idx.MO_TA]);
        
        // Xác định loại đơn
        const orderCode = String(row[idx.SO_DON]);
        const type = orderCode.startsWith("NK") ? "IMPORT" : "EXPORT";

        const item = {
          rowIndex: startRow + i,
          soDon: orderCode,
          ngay: dateStr,
          khach: row[idx.KHACH] || "",
          diaChi: row[idx.DIA_CHI] || "---",
          taiXe: driverName,
          bienSo: row[idx.BIEN_SO] || "",
          status: statusGiao || CONFIG.STATUS.NEW,
          products: products,
          type: type
        };

        // Phân loại pending/assigned
        if (!driverName) {
          pendingList.push(item);
        } else {
          assignedList.push(item);
        }
      }
      
      // Lấy danh sách tài xế
      const drivers = this._getDriverList();

      return { 
        error: false, 
        pending: pendingList, 
        assigned: assignedList, 
        drivers: drivers 
      };
      
    } catch (e) { 
      return createResponse(true, "Lỗi lấy đơn: " + e.toString()); 
    }
  },
  
  /**
   * Parse products từ JSON hoặc description
   * @private
   */
  _parseProducts: function(jsonStr, description) {
    let products = [];
    
    try {
      if (jsonStr && String(jsonStr).startsWith("[")) {
        const parsed = JSON.parse(jsonStr);
        products = parsed.map(p => ({
          name: p.product_name || p.inventory_item_name || p.description || "Hàng hóa",
          qty: Number(p.quantity || p.amount || 0),
          unit: p.unit_name || p.unit || "",
          density: p.density || "",
          code: p.product_code || ""
        }));
      }
    } catch (e) {
      console.error('Error parsing products JSON:', e);
    }
    
    // Fallback nếu không có products
    if (products.length === 0 && description) {
      products.push({ 
        name: String(description), 
        qty: 1, 
        unit: "Lô", 
        density: "", 
        code: "" 
      });
    }
    
    return products;
  },
  
  /**
   * Lấy danh sách tài xế active
   * @private
   */
  _getDriverList: function() {
    try {
      const userSS = SpreadsheetApp.openById(CONFIG.USER_DB_ID);
      const userRows = userSS.getSheetByName(CONFIG.SHEETS.USERS).getDataRange().getValues();
      
      const drivers = [];
      for (let k = 1; k < userRows.length; k++) {
        if (String(userRows[k][6]) === 'ACTIVE' && 
            String(userRows[k][4]) === CONFIG.ROLES.DRIVER) {
          drivers.push({ 
            name: userRows[k][3], 
            plate: userRows[k][5] 
          });
        }
      }
      return drivers;
    } catch(e) {
      return [];
    }
  },
  
  /**
   * Lấy đơn hàng cho tài xế
   * @param {string} driverName - Tên tài xế
   * @param {string} role - Vai trò user
   * @returns {Object} Danh sách đơn
   */
  getOrdersForDriver: function(driverName, role) {
    const res = this.getOrdersForAdmin(); 
    if (res.error) return res;
    
    // Lấy danh sách tài xế nội bộ
    const userSS = SpreadsheetApp.openById(CONFIG.USER_DB_ID);
    const userRows = userSS.getSheetByName(CONFIG.SHEETS.USERS).getDataRange().getValues();
    
    const internalDrivers = [];
    for (let k = 1; k < userRows.length; k++) {
      if (String(userRows[k][4]).trim() === CONFIG.ROLES.DRIVER) {
        internalDrivers.push(String(userRows[k][3]).trim().toUpperCase());
      }
    }

    const myName = String(driverName).trim().toUpperCase();
    let myData = [];

    if (role === CONFIG.ROLES.ADMIN || role === CONFIG.ROLES.TESTER) {
      // Admin/Tester thấy đơn của mình VÀ đơn xe ngoài
      myData = res.assigned.filter(o => {
        const tName = String(o.taiXe).trim().toUpperCase();
        const isMe = (tName === myName);
        const isExternal = tName && !internalDrivers.includes(tName);
        return isMe || isExternal;
      });
    } else {
      // Tài xế chỉ thấy đơn của mình
      myData = res.assigned.filter(o => 
        String(o.taiXe).trim().toUpperCase() === myName
      );
    }
    
    // Thêm statusCode cho frontend
    myData.forEach(o => { 
      o.statusCode = (o.status === CONFIG.STATUS.DELIVERING) ? 'DANG_GIAO' : 'CHO_GIAO'; 
    });
    
    return { error: false, data: myData };
  },
  
  /**
   * Tạo đơn nhập thủ công
   * @param {Object} data - Thông tin đơn hàng
   * @returns {Object} Kết quả
   */
  createImportOrder: function(data) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEETS.ORDERS);
      const ts = getTimestamp();
      
      // Tạo mã đơn nhập
      const id = "NK" + ts.short; 
      const dateStr = formatDate(data.date);
      
      // Tạo JSON products
      const productJson = JSON.stringify(data.products.map(p => ({
        product_name: p.name,
        quantity: Number(p.qty),
        unit_name: p.unit,
        stock_name: "KHO_TAM",
        density: p.density 
      })));

      // Lấy column indexes
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const idxSoDon = headers.indexOf("sale_order_no");
      const idxKhach = headers.indexOf("account_name");
      const idxNgay = headers.indexOf("sale_order_date");
      const idxDiaChi = headers.indexOf("shipping_address");
      const idxStatus = headers.indexOf("delivery_status");
      const idxJson = headers.indexOf("sale_order_product_mappings");
      
      // Tạo row mới
      const newRow = new Array(sheet.getLastColumn()).fill("");
      newRow[idxSoDon] = id;
      newRow[idxKhach] = data.customer;
      newRow[idxNgay] = dateStr;
      newRow[idxDiaChi] = data.address;
      newRow[idxStatus] = CONFIG.STATUS.WAITING;
      newRow[idxJson] = productJson;

      sheet.appendRow(newRow);
      
      return createResponse(false, "Đã tạo đơn nhập: " + id, { orderId: id });
      
    } catch(e) { 
      return createResponse(true, e.toString()); 
    }
  },
  
  /**
   * Gán tài xế cho đơn hàng
   * @param {number} idx - Row index
   * @param {string} name - Tên tài xế
   * @param {string} plate - Biển số xe
   * @returns {Object} Kết quả
   */
  assignDriver: function(idx, name, plate) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEETS.ORDERS);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      
      const colDriver = headers.indexOf("custom_field13") + 1;
      const colPlate = headers.indexOf("custom_field14") + 1;
      const colStatus = headers.indexOf("delivery_status") + 1;
      const colSoDon = headers.indexOf("sale_order_no") + 1;
      const colKhach = headers.indexOf("account_name") + 1;
      
      const soDon = sheet.getRange(idx, colSoDon).getValue();
      const khach = sheet.getRange(idx, colKhach).getValue();
      const typeTitle = String(soDon).startsWith("NK") 
        ? "🟠 ĐIỀU PHỐI ĐƠN NHẬP" 
        : "🟢 ĐIỀU PHỐI ĐƠN XUẤT";

      // Cập nhật thông tin
      if (colDriver > 0) sheet.getRange(idx, colDriver).setValue(name);
      if (colPlate > 0) sheet.getRange(idx, colPlate).setValue(plate);
      if (colStatus > 0) sheet.getRange(idx, colStatus).setValue(CONFIG.STATUS.WAITING);

      // Gửi thông báo Telegram
      NotificationService.sendTelegram(
        `👮 <b>${typeTitle}</b>\n` +
        `📦 Mã: <b>${soDon}</b>\n` +
        `🏢 Khách: ${khach}\n` +
        `👤 Tài xế: <b>${name}</b>\n` +
        `🚛 Xe: ${plate}`,
        CONFIG.TELEGRAM_CHAT_NOTIFY
      );
      
      return createResponse(false, "Đã gán tài xế!");
      
    } catch(e) { 
      return createResponse(true, e.toString()); 
    }
  },
  
  /**
   * Xử lý action của tài xế (nhận đơn)
   * @param {Object} data - Thông tin action
   * @returns {Object} Kết quả
   */
  processDriverAction: function(data) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return createResponse(true, "Hệ thống bận!");
    }

    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEETS.ORDERS);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      
      const idxStatus = headers.indexOf("delivery_status");
      const idxSoDon = headers.indexOf("sale_order_no");
      const idxKhach = headers.indexOf("account_name");
      const idxTaiXe = headers.indexOf("custom_field13");

      const row = data.rowIndex; 
      const soDon = String(sheet.getRange(row, idxSoDon + 1).getValue());
      const khach = sheet.getRange(row, idxKhach + 1).getValue();
      const taiXe = sheet.getRange(row, idxTaiXe + 1).getValue();
      
      const isImportOrder = soDon.startsWith("NK");
      const typeTitle = isImportOrder ? "NHẬP" : "GIAO";
      const icon = isImportOrder ? "🟠" : "🚚";

      if (data.action === "START") {
        // Cập nhật trạng thái
        if (idxStatus > -1) {
          sheet.getRange(row, idxStatus + 1).setValue(CONFIG.STATUS.DELIVERING);
        }
        
        // Gửi thông báo
        NotificationService.sendTelegram(
          `${icon} <b>TÀI XẾ NHẬN ĐƠN ${typeTitle}</b>\n` +
          `📦 Đơn: ${soDon}\n` +
          `🏢 Khách: ${khach}\n` +
          `👤 Tài xế: <b>${taiXe}</b>`,
          CONFIG.TELEGRAM_CHAT_NOTIFY
        );
        
        return createResponse(false, "Đã nhận đơn!");
      }
      
      return createResponse(true, "Action không hợp lệ!");
      
    } catch (e) { 
      return createResponse(true, e.toString()); 
    } finally { 
      lock.releaseLock(); 
    }
  },
  
  /**
   * Submit form hoàn thành đơn
   * @param {Object} form - Dữ liệu form
   * @returns {Object} Kết quả
   */
  submitDeliveryForm: function(form) {
    const lock = LockService.getScriptLock();
    
    try {
      if (!lock.tryLock(10000)) {
        return createResponse(true, 'Hệ thống bận!');
      }
      
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      
      // === PHẦN 1: CẬP NHẬT ĐƠN HÀNG GỐC ===
      if (form.orderRowIndex && form.orderRowIndex > 0) {
        this._updateOriginalOrder(ss, form);
      }

      // === PHẦN 2: TẠO PHIẾU KHO ===
      const result = this._createWarehouseTicket(ss, form);

      return result;
      
    } catch (e) { 
      return createResponse(true, 'Lỗi: ' + e.toString()); 
    } finally { 
      lock.releaseLock(); 
    }
  },
  
  /**
   * Cập nhật đơn hàng gốc
   * @private
   */
  _updateOriginalOrder: function(ss, form) {
    const orderSheet = ss.getSheetByName(CONFIG.SHEETS.ORDERS);
    const headers = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
    
    const idxStatus = headers.indexOf("delivery_status");
    const idxMainStatus = headers.indexOf("status");
    const idxJson = headers.indexOf("sale_order_product_mappings");
    const idxN8n = headers.indexOf("N8N_CHECK");
    const idxKhach = headers.indexOf("account_name"); 
    const idxTaiXe = headers.indexOf("custom_field13"); 
    const idxBienSo = headers.indexOf("custom_field14"); 

    const row = form.orderRowIndex;
    
    // Cập nhật thông tin cơ bản
    if (idxKhach > -1 && form.partner) orderSheet.getRange(row, idxKhach + 1).setValue(form.partner);
    if (idxTaiXe > -1 && form.driver_name) orderSheet.getRange(row, idxTaiXe + 1).setValue(form.driver_name);
    if (idxBienSo > -1 && form.plate) orderSheet.getRange(row, idxBienSo + 1).setValue(form.plate);

    // Cập nhật trạng thái
    if (idxStatus > -1) orderSheet.getRange(row, idxStatus + 1).setValue(CONFIG.STATUS.DELIVERED);
    if (idxMainStatus > -1) orderSheet.getRange(row, idxMainStatus + 1).setValue("Đã thực hiện");
    if (idxN8n > -1) orderSheet.getRange(row, idxN8n + 1).setValue(""); 

    // Cập nhật số lượng thực tế trong JSON
    if (idxJson > -1) {
      this._updateProductQuantities(orderSheet, row, idxJson + 1, form.cart);
    }
  },
  
  /**
   * Cập nhật số lượng sản phẩm
   * @private
   */
  _updateProductQuantities: function(sheet, row, col, cart) {
    try {
      const oldJsonStr = sheet.getRange(row, col).getValue();
      let oldProds = JSON.parse(oldJsonStr);
      if (!Array.isArray(oldProds)) oldProds = [oldProds];

      const newProducts = oldProds.map(op => {
        // Khớp sản phẩm bằng CODE hoặc TÊN
        const cartItem = cart.find(c => {
          const matchCode = (c.code && op.product_code && String(c.code) === String(op.product_code));
          const opName = standardizeData(op.product_name || op.inventory_item_name || op.description, 'PRODUCT');
          const cName = standardizeData(c.product, 'PRODUCT');
          const matchName = (cName === opName);
          return matchCode || matchName;
        });
        
        if (cartItem) {
          const newQty = Number(cartItem.weight_kg);
          
          // Cập nhật số lượng
          op.amount = newQty; 
          op.quantity = newQty;
          op.usage_unit_amount = newQty;
          op.shipping_amount = newQty;
          op.density = cartItem.density; 
          
          // Tính lại tiền
          const price = Number(op.price || op.unit_price || 0);
          if (price > 0) {
            const discount = Number(op.discount || 0);
            let newTotalBeforeTax = (newQty * price) - discount;
            if (newTotalBeforeTax < 0) newTotalBeforeTax = 0;

            op.to_currency = newTotalBeforeTax;
            op.amount_oc = newTotalBeforeTax;
            
            let taxVal = 0;
            if (op.tax_percent) {
              const taxRate = parseFloat(String(op.tax_percent).replace('%', '')) / 100;
              if (!isNaN(taxRate)) taxVal = newTotalBeforeTax * taxRate;
            }
            op.tax = taxVal;
            op.total = newTotalBeforeTax + taxVal;
          }
        }
        return op;
      });
      
      sheet.getRange(row, col).setValue(JSON.stringify(newProducts));
      
    } catch(e) {
      console.error('Error updating product quantities:', e);
    }
  },
  
  /**
   * Tạo phiếu kho
   * @private
   */
  _createWarehouseTicket: function(ss, form) {
    const sheetName = form.type === 'NHAP' ? CONFIG.SHEETS.DATA_NHAP : CONFIG.SHEETS.DATA_XUAT;
    const prefix = form.type === 'NHAP' ? 'N' : 'X';
    const dataSheet = ss.getSheetByName(sheetName);
    
    // Tạo ID mới
    const lastRow = dataSheet.getLastRow();
    let nextId = prefix + "0001";
    if (lastRow >= 2) {
      const lastIdVal = String(dataSheet.getRange(lastRow, 1).getValue());
      const num = parseInt(lastIdVal.replace(prefix, ""));
      if (!isNaN(num)) { 
        let s = (num + 1).toString(); 
        while (s.length < 4) s = "0" + s; 
        nextId = prefix + s; 
      }
    }

    // Upload ảnh
    const imgLinks = [];
    const blobs = [];
    if (form.images && form.images.length > 0) {
      const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
      form.images.forEach((b64, i) => {
        try {
          const decoded = Utilities.base64Decode(b64.split(',')[1]);
          const blob = Utilities.newBlob(decoded, 'image/jpeg', `${nextId}_${i + 1}.jpg`);
          const file = folder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          imgLinks.push(file.getUrl());
          blobs.push(blob);
        } catch(e) {}
      });
    }
    
    // Cập nhật link ảnh vào đơn gốc
    if (form.orderRowIndex && imgLinks.length > 0) {
      const orderSheet = ss.getSheetByName(CONFIG.SHEETS.ORDERS);
      const idxDesc = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].indexOf("description");
      if (idxDesc > -1) {
        const oldD = orderSheet.getRange(form.orderRowIndex, idxDesc + 1).getValue();
        orderSheet.getRange(form.orderRowIndex, idxDesc + 1).setValue(oldD + "\n[Ảnh: " + imgLinks[0] + "]");
      }
    }

    // Xử lý vỏ/can
    const shellData = { can: {out: 0, in: 0}, phuy: {out: 0, in: 0}, tank: {out: 0, in: 0} };
    const goodsItems = []; 
    const shellNote = [];

    form.cart.forEach(item => {
      if (item.isShell) {
        const qty = Number(item.weight_kg); 
        const name = String(item.product).toUpperCase();
        
        if (name.includes('PHUY')) { 
          if (item.shellAction === 'OUT') shellData.phuy.out += qty; 
          else shellData.phuy.in += qty; 
        } else if (name.includes('TANK')) { 
          if (item.shellAction === 'OUT') shellData.tank.out += qty; 
          else shellData.tank.in += qty; 
        } else { 
          if (item.shellAction === 'OUT') shellData.can.out += qty; 
          else shellData.can.in += qty; 
        }
        
        const actName = item.shellAction === 'OUT' ? 'Xuất' : 'Thu';
        shellNote.push(`${actName} ${qty} ${item.product}`);
      } else { 
        goodsItems.push(item); 
      }
    });

    if (goodsItems.length === 0 && shellNote.length > 0) {
      goodsItems.push({ product: "Vỏ/Can (Chi tiết vỏ)", density: "", unit: "Lô", weight_kg: 0 });
    }

    // Chuẩn bị data
    const ts = getTimestamp();
    const userDateStr = formatDateVN(form.report_date);
    let finalNote = form.note || "";
    if (shellNote.length > 0) finalNote += " | " + shellNote.join(", ");

    // Tạo các dòng dữ liệu
    const dataRows = goodsItems.map((item, index) => {
      const isFirst = (index === 0);
      return [
        nextId, 
        userDateStr, 
        ts.full, 
        ts.time, 
        form.warehouse, 
        form.partner,
        form.driver_name, 
        form.assistant_name || "", 
        form.plate,
        standardizeData(item.product, 'PRODUCT'), 
        item.density || "", 
        item.unit, 
        item.weight_kg, 
        (item.weight_kg / 1000),
        (isFirst ? finalNote : ""), 
        (isFirst ? imgLinks.join('\n') : ""), 
        form.sender,
        (isFirst && shellData.can.out > 0) ? shellData.can.out : "",
        (isFirst && shellData.can.in > 0) ? shellData.can.in : "",
        (isFirst && shellData.phuy.out > 0) ? shellData.phuy.out : "",
        (isFirst && shellData.phuy.in > 0) ? shellData.phuy.in : "",
        (isFirst && shellData.tank.out > 0) ? shellData.tank.out : "",
        (isFirst && shellData.tank.in > 0) ? shellData.tank.in : "",
        "", 
        "", 
        form.partner
      ];
    });

    // Ghi vào sheet
    if (dataRows.length > 0) {
      dataSheet.getRange(lastRow + 1, 1, dataRows.length, 26).setValues(dataRows);
    }

    // Gửi thông báo Telegram
    this._sendDeliveryNotification(form, nextId, userDateStr, goodsItems, shellNote, blobs);

    return createResponse(false, 'Hoàn thành! Mã phiếu: ' + nextId, { ticketId: nextId });
  },
  
  /**
   * Gửi thông báo Telegram sau khi hoàn thành giao hàng
   * @private
   */
  _sendDeliveryNotification: function(form, ticketId, dateStr, goods, shellNote, blobs) {
    try {
      const chatID = form.type === 'NHAP' ? CONFIG.TELEGRAM_CHAT_NHAP : CONFIG.TELEGRAM_CHAT_XUAT;
      const title = form.type === 'NHAP' ? "🟢 NHẬP KHO (HOÀN THÀNH)" : "🟠 XUẤT KHO (HOÀN THÀNH)";
      
      let msg = `<b>${title} ${ticketId}</b>\n`;
      msg += `📅 ${dateStr}\n`;
      msg += `🏭 ${form.warehouse}\n`;
      msg += `🏢 ${form.partner}\n`;
      msg += `🚛 ${form.plate}\n`;
      msg += `👤 ${form.driver_name}\n\n`;
      
      goods.forEach(i => { 
        if (i.weight_kg > 0) {
          msg += `- ${i.product}: ${Number(i.weight_kg).toLocaleString()} ${i.unit}\n`; 
        }
      });
      
      if (shellNote.length > 0) {
        msg += `\n🛢️ <b>VỎ/CAN:</b>\n` + shellNote.join('\n') + `\n`;
      }
      
      msg += `\n📝 ${form.note || ""}`;
      
      const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}`;
      
      if (blobs.length > 0) {
        UrlFetchApp.fetch(url + '/sendPhoto', { 
          method: 'post', 
          payload: { 
            chat_id: chatID, 
            photo: blobs[0], 
            caption: msg, 
            parse_mode: 'HTML' 
          }
        });
      } else {
        UrlFetchApp.fetch(url + '/sendMessage', { 
          method: 'post', 
          payload: { 
            chat_id: chatID, 
            text: msg, 
            parse_mode: 'HTML' 
          }
        });
      }
    } catch(e) {
      console.error('Error sending Telegram notification:', e);
    }
  }
  /**
   * Lấy tin nhắn chat từ Supabase
   */
  getOrderChat: function(orderId) {
    try {
      const url = `${CONFIG.SUPABASE_URL}/rest/v1/order_messages?order_id=eq.${orderId}&select=*&order=created_at.asc`;
      const options = {
        method: 'get',
        headers: {
          'apikey': CONFIG.SUPABASE_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
        }
      };
      
      const res = UrlFetchApp.fetch(url, options);
      const data = JSON.parse(res.getContentText());
      
      return { error: false, messages: data || [] };
    } catch (e) {
      return { error: true, messages: [], msg: e.toString() };
    }
  },

  /**
   * Gửi tin nhắn chat lên Supabase
   */
  sendOrderChat: function(orderId, msgData) {
    try {
      const url = `${CONFIG.SUPABASE_URL}/rest/v1/order_messages`;
      const payload = {
        order_id: orderId,
        sender_name: msgData.sender_name,
        sender_role: msgData.sender_role,
        message: msgData.message,
        image: msgData.image
      };
      
      const options = {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'apikey': CONFIG.SUPABASE_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
          'Prefer': 'return=representation'
        },
        payload: JSON.stringify(payload)
      };
      
      UrlFetchApp.fetch(url, options);
      return { error: false, msg: "Gửi thành công" };
    } catch (e) {
      return { error: true, msg: e.toString() };
    }
  },

  /**
   * Lấy đơn hàng cho tài xế (Mở rộng cho Lịch sử)
   */
  getOrdersForDriver: function(driverName, role) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEETS.ORDERS);
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return { error: false, data: [] };

      const LIMIT = 500; // Load history 500 dòng
      const startRow = Math.max(2, lastRow - LIMIT + 1);
      const numRows = lastRow - startRow + 1;
      const data = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().trim());

      const idx = {
        SO_DON: headers.indexOf("sale_order_no"),
        KHACH: headers.indexOf("account_name"),
        NGAY: headers.indexOf("sale_order_date"),
        DIA_CHI: headers.indexOf("shipping_address"),
        STATUS_GIAO: headers.indexOf("delivery_status"),
        STATUS_MAIN: headers.indexOf("status"),
        TAI_XE: headers.indexOf("custom_field13"),
        BIEN_SO: headers.indexOf("custom_field14"),
        JSON_HANG: headers.indexOf("sale_order_product_mappings"),
        MO_TA: headers.indexOf("description")
      };

      const myName = String(driverName).trim().toUpperCase();
      const result = [];

      for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        const tName = String(row[idx.TAI_XE] || "").trim().toUpperCase();
        if(!tName || tName === "0") continue;

        // Filter: Admin thấy hết, Driver chỉ thấy mình
        if (role !== 'ADMIN' && role !== 'TESTER' && tName !== myName) continue;

        const statusGiao = String(row[idx.STATUS_GIAO] || "").trim();
        const statusMain = String(row[idx.STATUS_MAIN] || "").trim();

        result.push({
          rowIndex: startRow + i,
          soDon: String(row[idx.SO_DON]),
          ngay: formatDate(row[idx.NGAY]),
          khach: row[idx.KHACH] || "",
          diaChi: row[idx.DIA_CHI] || "",
          taiXe: row[idx.TAI_XE],
          status: statusMain || statusGiao,
          statusCode: (statusGiao === CONFIG.STATUS.DELIVERING) ? 'DANG_GIAO' : 'CHO_GIAO',
          products: this._parseProducts(row[idx.JSON_HANG], row[idx.MO_TA])
        });
      }

      return { error: false, data: result };
    } catch(e) {
      return { error: true, msg: e.toString() };
    }
  }
};
