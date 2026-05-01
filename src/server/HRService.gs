// ===============================================
// LỘC THIÊN ERP - HR SERVICE (NHÂN SỰ)
// ===============================================

/**
 * @fileoverview Quản lý nhân sự, chấm công, lương
 * @author Lộc Thiên Dev Team
 */

const HRService = {
  
  /**
   * Lấy danh sách nhân viên
   * @param {Object} filters - Bộ lọc (role, status, etc.)
   * @returns {Object} Danh sách nhân viên
   */
  getEmployees: function(filters = {}) {
    try {
      const userSS = SpreadsheetApp.openById(CONFIG.USER_DB_ID);
      const userSheet = userSS.getSheetByName(CONFIG.SHEETS.USERS);
      const data = userSheet.getDataRange().getValues();
      
      const employees = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const status = String(row[6]).trim();
        const role = String(row[4]).trim();
        
        // Apply filters
        if (filters.status && status !== filters.status) continue;
        if (filters.role && role !== filters.role) continue;
        
        employees.push({
          id: row[0],
          username: row[1],
          fullName: row[3],
          role: role,
          plate: row[5],
          status: status,
          // Thêm các field mở rộng nếu có
          phone: row[7] || '',
          email: row[8] || '',
          baseSalary: row[9] || 0,
          startDate: row[10] || '',
          department: row[11] || ''
        });
      }
      
      return createResponse(false, 'OK', employees);
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Thêm nhân viên mới
   * @param {Object} data - Thông tin nhân viên
   * @returns {Object} Kết quả
   */
  addEmployee: function(data) {
    try {
      const userSS = SpreadsheetApp.openById(CONFIG.USER_DB_ID);
      const userSheet = userSS.getSheetByName(CONFIG.SHEETS.USERS);
      
      // Validate required fields
      if (!data.fullName) return createResponse(true, 'Vui lòng nhập họ tên!');
      if (!data.phone) return createResponse(true, 'Vui lòng nhập số điện thoại!');
      
      // Tạo username từ phone
      const username = String(data.phone).trim().replace(/^0+/, '');
      
      // Kiểm tra trùng
      const existingData = userSheet.getDataRange().getValues();
      for (let i = 1; i < existingData.length; i++) {
        const existUser = String(existingData[i][1]).trim().replace(/^0+/, '');
        if (existUser === username) {
          return createResponse(true, 'Số điện thoại này đã được đăng ký!');
        }
      }
      
      // Tạo ID và password mặc định
      const id = 'EMP' + new Date().getTime();
      const defaultPassword = username.slice(-6); // 6 số cuối SĐT làm password
      
      // Thêm row mới
      userSheet.appendRow([
        id,
        "'" + username, // Prefix ' để giữ format text
        defaultPassword,
        data.fullName,
        data.role || CONFIG.ROLES.DRIVER,
        data.plate ? String(data.plate).toUpperCase() : '',
        'ACTIVE',
        data.phone,
        data.email || '',
        data.baseSalary || 0,
        data.startDate || formatDate(new Date()),
        data.department || ''
      ]);
      
      return createResponse(false, 'Đã thêm nhân viên!', { 
        id: id,
        username: username,
        password: defaultPassword 
      });
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Cập nhật thông tin nhân viên
   * @param {string} id - ID nhân viên
   * @param {Object} data - Thông tin cập nhật
   * @returns {Object} Kết quả
   */
  updateEmployee: function(id, data) {
    try {
      const userSS = SpreadsheetApp.openById(CONFIG.USER_DB_ID);
      const userSheet = userSS.getSheetByName(CONFIG.SHEETS.USERS);
      const allData = userSheet.getDataRange().getValues();
      
      // Tìm row cần update
      let rowIndex = -1;
      for (let i = 1; i < allData.length; i++) {
        if (String(allData[i][0]) === String(id)) {
          rowIndex = i + 1; // +1 vì sheet 1-indexed
          break;
        }
      }
      
      if (rowIndex === -1) {
        return createResponse(true, 'Không tìm thấy nhân viên!');
      }
      
      // Cập nhật từng field
      if (data.fullName !== undefined) userSheet.getRange(rowIndex, 4).setValue(data.fullName);
      if (data.role !== undefined) userSheet.getRange(rowIndex, 5).setValue(data.role);
      if (data.plate !== undefined) userSheet.getRange(rowIndex, 6).setValue(String(data.plate).toUpperCase());
      if (data.status !== undefined) userSheet.getRange(rowIndex, 7).setValue(data.status);
      if (data.phone !== undefined) userSheet.getRange(rowIndex, 8).setValue(data.phone);
      if (data.email !== undefined) userSheet.getRange(rowIndex, 9).setValue(data.email);
      if (data.baseSalary !== undefined) userSheet.getRange(rowIndex, 10).setValue(data.baseSalary);
      if (data.department !== undefined) userSheet.getRange(rowIndex, 12).setValue(data.department);
      
      return createResponse(false, 'Đã cập nhật thông tin!');
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Xóa nhân viên (soft delete)
   * @param {string} id - ID nhân viên
   * @returns {Object} Kết quả
   */
  deleteEmployee: function(id) {
    return this.updateEmployee(id, { status: 'INACTIVE' });
  },
  
  /**
   * Lấy bảng chấm công
   * @param {number} month - Tháng
   * @param {number} year - Năm
   * @returns {Object} Dữ liệu chấm công
   */
  getAttendance: function(month, year) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      
      // Kiểm tra xem có sheet CHAM_CONG không
      let sheet = ss.getSheetByName(CONFIG.SHEETS.CHAM_CONG);
      if (!sheet) {
        // Tạo sheet mới nếu chưa có
        sheet = ss.insertSheet(CONFIG.SHEETS.CHAM_CONG);
        sheet.appendRow(['ID', 'Mã NV', 'Tên NV', 'Ngày', 'Check-in', 'Check-out', 'Giờ làm', 'OT', 'Trạng thái', 'Ghi chú']);
        return createResponse(false, 'OK', []);
      }
      
      const data = sheet.getDataRange().getValues();
      const result = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const dateStr = String(row[3]);
        
        // Parse date và filter theo tháng/năm
        try {
          const dateParts = dateStr.split('/');
          if (dateParts.length === 3) {
            const rowMonth = parseInt(dateParts[1]);
            const rowYear = parseInt(dateParts[2]);
            
            if (rowMonth !== month || rowYear !== year) continue;
          }
        } catch(e) { continue; }
        
        result.push({
          id: row[0],
          employeeId: row[1],
          employeeName: row[2],
          date: row[3],
          checkIn: row[4],
          checkOut: row[5],
          workHours: row[6],
          overtimeHours: row[7],
          status: row[8],
          notes: row[9]
        });
      }
      
      return createResponse(false, 'OK', result);
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Check-in nhân viên
   * @param {string} employeeId - ID nhân viên
   * @returns {Object} Kết quả
   */
  checkIn: function(employeeId) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      let sheet = ss.getSheetByName(CONFIG.SHEETS.CHAM_CONG);
      
      if (!sheet) {
        sheet = ss.insertSheet(CONFIG.SHEETS.CHAM_CONG);
        sheet.appendRow(['ID', 'Mã NV', 'Tên NV', 'Ngày', 'Check-in', 'Check-out', 'Giờ làm', 'OT', 'Trạng thái', 'Ghi chú']);
      }
      
      // Lấy thông tin nhân viên
      const employeeRes = this.getEmployees({ status: 'ACTIVE' });
      const employee = employeeRes.data.find(e => e.id === employeeId);
      
      if (!employee) {
        return createResponse(true, 'Không tìm thấy nhân viên!');
      }
      
      const ts = getTimestamp();
      const id = 'ATT' + ts.short;
      
      // Kiểm tra đã check-in hôm nay chưa
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] === employeeId && data[i][3] === ts.date && !data[i][5]) {
          return createResponse(true, 'Đã check-in hôm nay rồi!');
        }
      }
      
      // Thêm record check-in
      sheet.appendRow([
        id,
        employeeId,
        employee.fullName,
        ts.date,
        ts.time,
        '', // check-out
        '', // work hours
        '', // OT
        'Present',
        ''
      ]);
      
      return createResponse(false, 'Check-in thành công!', { time: ts.time });
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Check-out nhân viên
   * @param {string} employeeId - ID nhân viên
   * @returns {Object} Kết quả
   */
  checkOut: function(employeeId) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEETS.CHAM_CONG);
      
      if (!sheet) {
        return createResponse(true, 'Chưa có dữ liệu chấm công!');
      }
      
      const ts = getTimestamp();
      const data = sheet.getDataRange().getValues();
      
      // Tìm record check-in hôm nay
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] === employeeId && data[i][3] === ts.date && !data[i][5]) {
          const rowIndex = i + 1;
          
          // Cập nhật check-out
          sheet.getRange(rowIndex, 6).setValue(ts.time);
          
          // Tính số giờ làm
          const checkInTime = data[i][4];
          const workHours = this._calculateWorkHours(checkInTime, ts.time);
          sheet.getRange(rowIndex, 7).setValue(workHours);
          
          // Tính OT (giờ làm thêm nếu > 8 tiếng)
          const ot = Math.max(0, workHours - 8);
          sheet.getRange(rowIndex, 8).setValue(ot);
          
          return createResponse(false, 'Check-out thành công!', { 
            time: ts.time, 
            workHours: workHours 
          });
        }
      }
      
      return createResponse(true, 'Chưa check-in hôm nay!');
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Tính số giờ làm việc
   * @private
   */
  _calculateWorkHours: function(checkIn, checkOut) {
    try {
      const [h1, m1] = checkIn.split(':').map(Number);
      const [h2, m2] = checkOut.split(':').map(Number);
      
      const minutes1 = h1 * 60 + m1;
      const minutes2 = h2 * 60 + m2;
      
      return Math.round((minutes2 - minutes1) / 60 * 10) / 10;
    } catch(e) {
      return 0;
    }
  },
  
  /**
   * Tính lương nhân viên
   * @param {number} month - Tháng
   * @param {number} year - Năm
   * @returns {Object} Bảng lương
   */
  calculateSalary: function(month, year) {
    try {
      // Lấy danh sách nhân viên active
      const employeesRes = this.getEmployees({ status: 'ACTIVE' });
      if (employeesRes.error) return employeesRes;
      
      // Lấy dữ liệu chấm công
      const attendanceRes = this.getAttendance(month, year);
      if (attendanceRes.error) return attendanceRes;
      
      const salaryList = [];
      
      employeesRes.data.forEach(emp => {
        // Tính số ngày công và OT
        const empAttendance = attendanceRes.data.filter(a => a.employeeId === emp.id);
        const workDays = empAttendance.filter(a => a.status === 'Present').length;
        const totalOT = empAttendance.reduce((sum, a) => sum + (Number(a.overtimeHours) || 0), 0);
        
        // Tính lương
        const baseSalary = Number(emp.baseSalary) || 0;
        const dailyRate = baseSalary / 26; // Giả sử 26 ngày công/tháng
        const otRate = dailyRate / 8 * 1.5; // OT rate = 150%
        
        const actualSalary = dailyRate * workDays;
        const otPay = otRate * totalOT;
        const totalSalary = actualSalary + otPay;
        
        salaryList.push({
          employeeId: emp.id,
          employeeName: emp.fullName,
          role: emp.role,
          baseSalary: baseSalary,
          workDays: workDays,
          overtimeHours: totalOT,
          actualSalary: Math.round(actualSalary),
          overtimePay: Math.round(otPay),
          totalSalary: Math.round(totalSalary),
          month: month,
          year: year
        });
      });
      
      return createResponse(false, 'OK', salaryList);
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  }
};
