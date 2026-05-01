// ===============================================
// LỘC THIÊN ERP - MATERIAL SERVICE (VẬT TƯ)
// ===============================================

/**
 * @fileoverview Quản lý danh mục vật tư, sản phẩm hóa chất
 * @author Lộc Thiên Dev Team
 */

const MaterialService = {
  
  /**
   * Lấy danh sách vật tư
   * @param {Object} filters - Bộ lọc (category, active, etc.)
   * @returns {Object} Danh sách vật tư
   */
  getMaterials: function(filters = {}) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      
      // Kiểm tra sheet VatTu
      let sheet = ss.getSheetByName(CONFIG.SHEETS.VAT_TU);
      if (!sheet) {
        // Tạo sheet mới với headers
        sheet = ss.insertSheet(CONFIG.SHEETS.VAT_TU);
        sheet.appendRow([
          'Mã VT', 'Tên Vật Tư', 'Tên Tiếng Anh', 'Nhóm', 'CAS Number',
          'Nồng Độ', 'ĐVT Chính', 'ĐVT Phụ', 'Tỷ Lệ Quy Đổi', 'Tỷ Trọng',
          'Giá Mua', 'Giá Bán', 'Phân Loại Nguy Hiểm', 'Điều Kiện Bảo Quản',
          'Tồn Tối Thiểu', 'Hoạt Động', 'MISA ID', 'Mô Tả', 'Ngày Tạo', 'Ngày Cập Nhật'
        ]);
        return createResponse(false, 'OK', []);
      }
      
      const data = sheet.getDataRange().getValues();
      const materials = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const isActive = row[15] !== false && row[15] !== 'FALSE' && row[15] !== 0;
        const category = String(row[3]).trim();
        
        // Apply filters
        if (filters.active !== undefined && isActive !== filters.active) continue;
        if (filters.category && category !== filters.category) continue;
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          const nameMatch = String(row[1]).toLowerCase().includes(searchLower);
          const codeMatch = String(row[0]).toLowerCase().includes(searchLower);
          if (!nameMatch && !codeMatch) continue;
        }
        
        materials.push({
          code: row[0],
          name: row[1],
          nameEn: row[2],
          category: category,
          casNumber: row[4],
          concentration: row[5],
          unitPrimary: row[6],
          unitSecondary: row[7],
          conversionRate: row[8],
          density: row[9],
          purchasePrice: row[10],
          salePrice: row[11],
          hazardClass: row[12],
          storageCondition: row[13],
          minStock: row[14],
          isActive: isActive,
          misaId: row[16],
          description: row[17],
          createdDate: row[18],
          updatedDate: row[19]
        });
      }
      
      return createResponse(false, 'OK', materials);
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Lấy danh sách nhóm vật tư
   * @returns {Object} Danh sách categories
   */
  getCategories: function() {
    try {
      const materialsRes = this.getMaterials();
      if (materialsRes.error) return materialsRes;
      
      const categories = [...new Set(
        materialsRes.data
          .map(m => m.category)
          .filter(c => c)
      )].sort();
      
      return createResponse(false, 'OK', categories);
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Thêm vật tư mới
   * @param {Object} data - Thông tin vật tư
   * @returns {Object} Kết quả
   */
  addMaterial: function(data) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      let sheet = ss.getSheetByName(CONFIG.SHEETS.VAT_TU);
      
      if (!sheet) {
        // Tạo sheet nếu chưa có
        sheet = ss.insertSheet(CONFIG.SHEETS.VAT_TU);
        sheet.appendRow([
          'Mã VT', 'Tên Vật Tư', 'Tên Tiếng Anh', 'Nhóm', 'CAS Number',
          'Nồng Độ', 'ĐVT Chính', 'ĐVT Phụ', 'Tỷ Lệ Quy Đổi', 'Tỷ Trọng',
          'Giá Mua', 'Giá Bán', 'Phân Loại Nguy Hiểm', 'Điều Kiện Bảo Quản',
          'Tồn Tối Thiểu', 'Hoạt Động', 'MISA ID', 'Mô Tả', 'Ngày Tạo', 'Ngày Cập Nhật'
        ]);
      }
      
      // Validate
      if (!data.name) return createResponse(true, 'Vui lòng nhập tên vật tư!');
      
      // Tạo mã vật tư tự động nếu chưa có
      let code = data.code;
      if (!code) {
        const lastRow = sheet.getLastRow();
        const lastCode = lastRow > 1 ? String(sheet.getRange(lastRow, 1).getValue()) : 'VT-000';
        const num = parseInt(lastCode.replace('VT-', '')) || 0;
        code = 'VT-' + String(num + 1).padStart(3, '0');
      }
      
      const now = formatDate(new Date());
      
      sheet.appendRow([
        code,
        data.name,
        data.nameEn || '',
        data.category || 'Hóa chất',
        data.casNumber || '',
        data.concentration || '',
        data.unitPrimary || 'Kg',
        data.unitSecondary || '',
        data.conversionRate || 1,
        data.density || '',
        data.purchasePrice || 0,
        data.salePrice || 0,
        data.hazardClass || '',
        data.storageCondition || '',
        data.minStock || 0,
        true, // isActive
        data.misaId || '',
        data.description || '',
        now,
        now
      ]);
      
      return createResponse(false, 'Đã thêm vật tư!', { code: code });
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Cập nhật vật tư
   * @param {string} code - Mã vật tư
   * @param {Object} data - Thông tin cập nhật
   * @returns {Object} Kết quả
   */
  updateMaterial: function(code, data) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEETS.VAT_TU);
      
      if (!sheet) return createResponse(true, 'Sheet VatTu không tồn tại!');
      
      const allData = sheet.getDataRange().getValues();
      let rowIndex = -1;
      
      // Tìm row theo mã
      for (let i = 1; i < allData.length; i++) {
        if (String(allData[i][0]) === String(code)) {
          rowIndex = i + 1;
          break;
        }
      }
      
      if (rowIndex === -1) return createResponse(true, 'Không tìm thấy vật tư!');
      
      // Cập nhật từng field
      if (data.name !== undefined) sheet.getRange(rowIndex, 2).setValue(data.name);
      if (data.nameEn !== undefined) sheet.getRange(rowIndex, 3).setValue(data.nameEn);
      if (data.category !== undefined) sheet.getRange(rowIndex, 4).setValue(data.category);
      if (data.casNumber !== undefined) sheet.getRange(rowIndex, 5).setValue(data.casNumber);
      if (data.concentration !== undefined) sheet.getRange(rowIndex, 6).setValue(data.concentration);
      if (data.unitPrimary !== undefined) sheet.getRange(rowIndex, 7).setValue(data.unitPrimary);
      if (data.unitSecondary !== undefined) sheet.getRange(rowIndex, 8).setValue(data.unitSecondary);
      if (data.conversionRate !== undefined) sheet.getRange(rowIndex, 9).setValue(data.conversionRate);
      if (data.density !== undefined) sheet.getRange(rowIndex, 10).setValue(data.density);
      if (data.purchasePrice !== undefined) sheet.getRange(rowIndex, 11).setValue(data.purchasePrice);
      if (data.salePrice !== undefined) sheet.getRange(rowIndex, 12).setValue(data.salePrice);
      if (data.hazardClass !== undefined) sheet.getRange(rowIndex, 13).setValue(data.hazardClass);
      if (data.storageCondition !== undefined) sheet.getRange(rowIndex, 14).setValue(data.storageCondition);
      if (data.minStock !== undefined) sheet.getRange(rowIndex, 15).setValue(data.minStock);
      if (data.isActive !== undefined) sheet.getRange(rowIndex, 16).setValue(data.isActive);
      if (data.description !== undefined) sheet.getRange(rowIndex, 18).setValue(data.description);
      
      // Cập nhật ngày sửa
      sheet.getRange(rowIndex, 20).setValue(formatDate(new Date()));
      
      return createResponse(false, 'Đã cập nhật vật tư!');
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Xóa vật tư (soft delete)
   * @param {string} code - Mã vật tư
   * @returns {Object} Kết quả
   */
  deleteMaterial: function(code) {
    return this.updateMaterial(code, { isActive: false });
  },
  
  /**
   * Tìm kiếm vật tư
   * @param {string} query - Từ khóa tìm kiếm
   * @returns {Object} Kết quả tìm kiếm
   */
  searchMaterials: function(query) {
    return this.getMaterials({ search: query, active: true });
  },
  
  /**
   * Lấy vật tư theo mã
   * @param {string} code - Mã vật tư
   * @returns {Object} Thông tin vật tư
   */
  getMaterialByCode: function(code) {
    try {
      const materialsRes = this.getMaterials();
      if (materialsRes.error) return materialsRes;
      
      const material = materialsRes.data.find(m => m.code === code);
      if (!material) {
        return createResponse(true, 'Không tìm thấy vật tư!');
      }
      
      return createResponse(false, 'OK', material);
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  },
  
  /**
   * Import vật tư từ array
   * @param {Array} items - Danh sách vật tư cần import
   * @returns {Object} Kết quả import
   */
  importMaterials: function(items) {
    try {
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      items.forEach((item, index) => {
        try {
          const result = this.addMaterial(item);
          if (result.error) {
            errorCount++;
            errors.push(`Dòng ${index + 1}: ${result.msg}`);
          } else {
            successCount++;
          }
        } catch(e) {
          errorCount++;
          errors.push(`Dòng ${index + 1}: ${e.toString()}`);
        }
      });
      
      return createResponse(false, `Import hoàn tất: ${successCount} thành công, ${errorCount} lỗi`, {
        success: successCount,
        errors: errorCount,
        errorDetails: errors
      });
      
    } catch(e) {
      return createResponse(true, e.toString());
    }
  }
};
