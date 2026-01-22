// ===============================================
// LỘC THIÊN ERP - MAIN ENTRY POINT
// ===============================================

/**
 * @fileoverview Entry point cho Web App - xử lý doGet và routing
 * @author Lộc Thiên Dev Team
 * @version 2.0.0
 */

/**
 * Xử lý GET request - render trang HTML chính
 * @param {Object} e - Event object từ GAS
 * @returns {HtmlOutput} Trang HTML
 */
function doGet(e) {
  const page = e?.parameter?.page || 'index';
  
  try {
    let template;
    
    // Router dựa trên tham số page
    switch(page) {
      case 'admin':
        template = HtmlService.createTemplateFromFile('AdminDashboard');
        break;
      case 'driver':
        template = HtmlService.createTemplateFromFile('DriverApp');
        break;
      case 'hr':
        template = HtmlService.createTemplateFromFile('AdminHR');
        break;
      case 'materials':
        template = HtmlService.createTemplateFromFile('AdminMaterials');
        break;
      case 'warehouse':
        template = HtmlService.createTemplateFromFile('AdminWarehouse');
        break;
      default:
        template = HtmlService.createTemplateFromFile('index');
    }
    
    return template.evaluate()
      .setTitle('LỘC THIÊN ERP - ' + CONFIG.APP_VERSION)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
      
  } catch(e) {
    // Fallback nếu template không tồn tại
    return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('KHO VẬN LỘC THIÊN')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  }
}

/**
 * Include file HTML partial (CSS, JS)
 * @param {string} filename - Tên file cần include
 * @returns {string} Nội dung file
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ===============================================
// AUTHENTICATION API
// ===============================================

/**
 * Xử lý đăng nhập
 * @param {string} username - Tên đăng nhập (SĐT)
 * @param {string} password - Mật khẩu
 * @returns {Object} Kết quả đăng nhập
 */
function doLogin(username, password) {
  return AuthService.login(username, password);
}

/**
 * Tạo tài khoản mới (Admin only)
 * @param {Object} data - Thông tin user mới
 * @returns {Object} Kết quả
 */
function createDriverAccount(data) {
  return AuthService.createUser(data);
}

// ===============================================
// ORDER MANAGEMENT API
// ===============================================

/**
 * Lấy danh sách đơn hàng cho Admin
 * @returns {Object} Danh sách đơn pending và assigned
 */
function getAdminOrders() {
  return OrderService.getOrdersForAdmin();
}

/**
 * Lấy đơn hàng của tài xế
 * @param {string} driverName - Tên tài xế
 * @param {string} role - Vai trò user
 * @returns {Object} Danh sách đơn của tài xế
 */
function getMyOrders(driverName, role) {
  return OrderService.getOrdersForDriver(driverName, role);
}

/**
 * Tạo đơn nhập thủ công
 * @param {Object} data - Thông tin đơn hàng
 * @returns {Object} Kết quả
 */
function createManualOrder(data) {
  return OrderService.createImportOrder(data);
}

/**
 * Gán tài xế cho đơn hàng
 * @param {number} idx - Row index
 * @param {string} name - Tên tài xế
 * @param {string} plate - Biển số xe
 * @returns {Object} Kết quả
 */
function adminAssignOrder(idx, name, plate) {
  return OrderService.assignDriver(idx, name, plate);
}

/**
 * Xử lý action của tài xế (nhận đơn, hoàn thành)
 * @param {Object} data - Thông tin action
 * @returns {Object} Kết quả
 */
function processDriverAction(data) {
  return OrderService.processDriverAction(data);
}

/**
 * Submit form hoàn thành đơn
 * @param {Object} form - Dữ liệu form
 * @returns {Object} Kết quả
 */
function submitForm(form) {
  return OrderService.submitDeliveryForm(form);
}

// ===============================================
// MIXING (PHA CHẾ) API
// ===============================================

/**
 * Submit phiếu pha chế
 * @param {Object} form - Thông tin pha chế
 * @returns {Object} Kết quả
 */
function submitMixing(form) {
  return MixingService.submit(form);
}

// ===============================================
// REPORT API
// ===============================================

/**
 * Lấy dữ liệu báo cáo
 * @param {string} fromDate - Từ ngày
 * @param {string} toDate - Đến ngày
 * @param {string} sPartner - Lọc theo đối tác
 * @param {string} sProduct - Lọc theo sản phẩm
 * @returns {Object} Dữ liệu báo cáo
 */
function getReportData(fromDate, toDate, sPartner, sProduct) {
  return ReportService.getReport(fromDate, toDate, sPartner, sProduct);
}

/**
 * Lấy tồn kho real-time
 * @returns {Object} Dữ liệu tồn kho
 */
function getTonKhoRealTime() {
  return ReportService.getInventory();
}

/**
 * Export báo cáo Excel
 * @param {string} fromDate - Từ ngày
 * @param {string} toDate - Đến ngày  
 * @param {string} sPartner - Lọc theo đối tác
 * @param {string} sProduct - Lọc theo sản phẩm
 * @returns {Object} Base64 Excel file
 */
function exportReportExcel(fromDate, toDate, sPartner, sProduct) {
  return ReportService.exportExcel(fromDate, toDate, sPartner, sProduct);
}

// ===============================================
// HR MANAGEMENT API
// ===============================================

/**
 * Lấy danh sách nhân viên
 * @returns {Object} Danh sách nhân viên
 */
function adminGetEmployees() {
  return HRService.getEmployees();
}

/**
 * Thêm nhân viên mới
 * @param {Object} data - Thông tin nhân viên
 * @returns {Object} Kết quả
 */
function adminAddEmployee(data) {
  return HRService.addEmployee(data);
}

/**
 * Cập nhật nhân viên
 * @param {string} id - ID nhân viên
 * @param {Object} data - Thông tin cập nhật
 * @returns {Object} Kết quả
 */
function adminUpdateEmployee(id, data) {
  return HRService.updateEmployee(id, data);
}

/**
 * Lấy bảng chấm công
 * @param {number} month - Tháng
 * @param {number} year - Năm
 * @returns {Object} Dữ liệu chấm công
 */
function adminGetAttendance(month, year) {
  return HRService.getAttendance(month, year);
}

/**
 * Tính lương nhân viên
 * @param {number} month - Tháng
 * @param {number} year - Năm
 * @returns {Object} Dữ liệu lương
 */
function adminCalculateSalary(month, year) {
  return HRService.calculateSalary(month, year);
}

// ===============================================
// MATERIALS MANAGEMENT API
// ===============================================

/**
 * Lấy danh sách vật tư
 * @returns {Object} Danh sách vật tư
 */
function adminGetMaterials() {
  return MaterialService.getMaterials();
}

/**
 * Thêm vật tư mới
 * @param {Object} data - Thông tin vật tư
 * @returns {Object} Kết quả
 */
function adminAddMaterial(data) {
  return MaterialService.addMaterial(data);
}

/**
 * Cập nhật vật tư
 * @param {string} id - ID vật tư
 * @param {Object} data - Thông tin cập nhật
 * @returns {Object} Kết quả
 */
function adminUpdateMaterial(id, data) {
  return MaterialService.updateMaterial(id, data);
}

// ===============================================
// WAREHOUSE MANAGEMENT API
// ===============================================

/**
 * Lấy danh sách kho
 * @returns {Object} Danh sách kho
 */
function adminGetWarehouses() {
  return WarehouseService.getWarehouses();
}

/**
 * Lấy tồn kho theo kho
 * @param {string} warehouseId - ID kho
 * @returns {Object} Tồn kho
 */
function adminGetInventory(warehouseId) {
  return WarehouseService.getInventory(warehouseId);
}

/**
 * Điều chỉnh tồn kho
 * @param {Object} data - Thông tin điều chỉnh
 * @returns {Object} Kết quả
 */
function adminAdjustStock(data) {
  return WarehouseService.adjustStock(data);
}

/**
 * Chuyển kho
 * @param {Object} data - Thông tin chuyển kho
 * @returns {Object} Kết quả
 */
function adminTransferStock(data) {
  return WarehouseService.transferStock(data);
}

/**
 * Lấy cảnh báo tồn kho thấp
 * @returns {Object} Danh sách cảnh báo
 */
function adminGetLowStockAlerts() {
  return WarehouseService.getLowStockAlerts();
}

// ===============================================
// TELEGRAM NOTIFICATION
// ===============================================

/**
 * Gửi thông báo Telegram
 * @param {string} message - Nội dung tin nhắn
 * @param {string} chatId - ID chat (optional)
 */
function sendTelegramNotify(message, chatId) {
  NotificationService.sendTelegram(message, chatId || CONFIG.TELEGRAM_CHAT_NOTIFY);
}
