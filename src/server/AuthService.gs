// ===============================================
// LỘC THIÊN ERP - AUTHENTICATION SERVICE
// ===============================================

/**
 * @fileoverview Xử lý đăng nhập và quản lý tài khoản
 * @author Lộc Thiên Dev Team
 */

const AuthService = {
  
  /**
   * Xử lý đăng nhập
   * @param {string} username - SĐT hoặc username
   * @param {string} password - Mật khẩu
   * @returns {Object} Kết quả đăng nhập với thông tin user và master data
   */
  login: function(username, password) {
    try {
      const userSS = SpreadsheetApp.openById(CONFIG.USER_DB_ID);
      const userSheet = userSS.getSheetByName(CONFIG.SHEETS.USERS);
      const userData = userSheet.getDataRange().getValues();
      const dataSS = SpreadsheetApp.openById(CONFIG.SHEET_ID);

      const uInput = String(username).trim().toLowerCase(); 
      const pInput = String(password).trim();
      const removeZero = (s) => s.replace(/^0+/, '');

      let userFound = null;
      let allStaff = [];
      
      // Duyệt qua danh sách user
      for (let i = 1; i < userData.length; i++) {
        const row = userData[i];
        const status = String(row[6]).trim();
        
        // Thu thập tất cả nhân viên active
        if (status === 'ACTIVE') {
          allStaff.push({ 
            id: row[0],
            name: row[3], 
            role: row[4], 
            plate: String(row[5]).trim().toUpperCase() 
          });
        }
        
        // Kiểm tra đăng nhập
        const dbUser = String(row[1]).trim().toLowerCase();
        const isMatch = (removeZero(uInput) === removeZero(dbUser) && removeZero(uInput).length > 5);
        
        if (isMatch && String(row[2]).trim() === pInput) {
          if (status !== 'ACTIVE') {
            return createResponse(true, 'Tài khoản đã bị KHÓA!');
          }
          userFound = { 
            id: row[0], 
            name: row[3], 
            role: row[4], 
            plate: String(row[5]).trim().toUpperCase() 
          };
        }
      }

      // Nếu đăng nhập thành công, lấy thêm master data
      if (userFound) {
        const masterData = this._getMasterData(dataSS);
        
        return { 
          error: false, 
          user: userFound, 
          staffList: allStaff, 
          truckList: masterData.trucks, 
          customerList: masterData.customers, 
          supplierList: masterData.suppliers, 
          drivers: allStaff.filter(s => s.role === CONFIG.ROLES.DRIVER)
        };
      }
      
      return createResponse(true, 'Sai tên đăng nhập hoặc mật khẩu!');
      
    } catch (e) { 
      return createResponse(true, 'Lỗi Login: ' + e.toString()); 
    }
  },
  
  /**
   * Lấy master data (xe, khách hàng, nhà cung cấp)
   * @private
   */
  _getMasterData: function(dataSS) {
    let trucks = [], customers = [], suppliers = [];
    
    try {
      // Lấy danh sách xe
      const truckSheet = dataSS.getSheetByName(CONFIG.SHEETS.XE_CONGTY);
      if (truckSheet) {
        const tData = truckSheet.getDataRange().getValues();
        for (let j = 1; j < tData.length; j++) {
          if (String(tData[j][3]).trim() === 'HOẠT ĐỘNG') {
            trucks.push(String(tData[j][0]).trim().toUpperCase());
          }
        }
      }
      
      // Lấy danh sách khách hàng
      const custSheet = dataSS.getSheetByName(CONFIG.SHEETS.CONG_TY);
      if (custSheet) {
        const cData = custSheet.getDataRange().getValues();
        for (let k = 1; k < cData.length; k++) {
          if (cData[k][1]) customers.push(String(cData[k][1]).trim());
        }
      }
      
      // Lấy danh sách nhà cung cấp
      const supSheet = dataSS.getSheetByName(CONFIG.SHEETS.NHA_CUNG_CAP);
      if (supSheet) {
        const sData = supSheet.getDataRange().getValues();
        for (let m = 1; m < sData.length; m++) {
          if (sData[m][1]) suppliers.push(String(sData[m][1]).trim());
        }
      }
    } catch(e) {
      console.error('Error loading master data:', e);
    }
    
    return {
      trucks: trucks.sort(),
      customers: customers.sort(),
      suppliers: suppliers.sort()
    };
  },
  
  /**
   * Tạo tài khoản mới
   * @param {Object} data - Thông tin user
   * @returns {Object} Kết quả
   */
  createUser: function(data) {
    try {
      const userSS = SpreadsheetApp.openById(CONFIG.USER_DB_ID);
      const userSheet = userSS.getSheetByName(CONFIG.SHEETS.USERS);
      
      // Tạo ID mới
      const newId = new Date().getTime().toString();
      
      // Chuẩn hóa username (loại bỏ số 0 đầu)
      const cleanUser = String(data.username).trim().toLowerCase().replace(/^0+/, '');
      
      // Validate
      if (!cleanUser || cleanUser.length < 6) {
        return createResponse(true, 'SĐT phải có ít nhất 6 ký tự!');
      }
      if (!data.password || data.password.length < 4) {
        return createResponse(true, 'Mật khẩu phải có ít nhất 4 ký tự!');
      }
      if (!data.fullname) {
        return createResponse(true, 'Vui lòng nhập họ tên!');
      }
      
      // Kiểm tra trùng username
      const existingUsers = userSheet.getDataRange().getValues();
      for (let i = 1; i < existingUsers.length; i++) {
        const existUser = String(existingUsers[i][1]).trim().toLowerCase().replace(/^0+/, '');
        if (existUser === cleanUser) {
          return createResponse(true, 'SĐT này đã được đăng ký!');
        }
      }
      
      // Thêm user mới
      userSheet.appendRow([
        newId, 
        "'" + cleanUser, // Thêm ' để giữ format text
        data.password, 
        data.fullname, 
        data.role || CONFIG.ROLES.DRIVER, 
        data.plate ? data.plate.toUpperCase() : "", 
        'ACTIVE'
      ]);
      
      return createResponse(false, 'Đã tạo tài khoản thành công!', { id: newId });
      
    } catch (e) { 
      return createResponse(true, 'Lỗi tạo user: ' + e.toString()); 
    }
  },
  
  /**
   * Kiểm tra quyền truy cập
   * @param {string} userId - ID user
   * @param {string} requiredRole - Role yêu cầu
   * @returns {boolean} Có quyền hay không
   */
  checkPermission: function(userId, requiredRole) {
    try {
      const userSS = SpreadsheetApp.openById(CONFIG.USER_DB_ID);
      const userSheet = userSS.getSheetByName(CONFIG.SHEETS.USERS);
      const userData = userSheet.getDataRange().getValues();
      
      for (let i = 1; i < userData.length; i++) {
        if (String(userData[i][0]) === String(userId)) {
          const userRole = String(userData[i][4]);
          
          // Admin có mọi quyền
          if (userRole === CONFIG.ROLES.ADMIN) return true;
          
          // Kiểm tra role cụ thể
          if (requiredRole === userRole) return true;
          
          // Manager có quyền gần như admin
          if (userRole === CONFIG.ROLES.MANAGER && 
              requiredRole !== CONFIG.ROLES.ADMIN) return true;
        }
      }
      
      return false;
    } catch(e) {
      return false;
    }
  },
  
  /**
   * Cập nhật mật khẩu
   * @param {string} userId - ID user
   * @param {string} oldPass - Mật khẩu cũ
   * @param {string} newPass - Mật khẩu mới
   * @returns {Object} Kết quả
   */
  changePassword: function(userId, oldPass, newPass) {
    try {
      const userSS = SpreadsheetApp.openById(CONFIG.USER_DB_ID);
      const userSheet = userSS.getSheetByName(CONFIG.SHEETS.USERS);
      const userData = userSheet.getDataRange().getValues();
      
      for (let i = 1; i < userData.length; i++) {
        if (String(userData[i][0]) === String(userId)) {
          // Kiểm tra mật khẩu cũ
          if (String(userData[i][2]).trim() !== oldPass) {
            return createResponse(true, 'Mật khẩu cũ không đúng!');
          }
          
          // Cập nhật mật khẩu mới
          userSheet.getRange(i + 1, 3).setValue(newPass);
          return createResponse(false, 'Đổi mật khẩu thành công!');
        }
      }
      
      return createResponse(true, 'Không tìm thấy user!');
      
    } catch(e) {
      return createResponse(true, 'Lỗi: ' + e.toString());
    }
  }
};
