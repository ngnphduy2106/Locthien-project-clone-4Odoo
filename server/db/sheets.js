// ===============================================
// GOOGLE SHEETS HELPER - Mock Data
// ===============================================

/**
 * Vì không có Google Service Account credentials,
 * file này sử dụng mock data cho development.
 * 
 * Để kết nối thực với Google Sheets:
 * 1. Tạo Service Account trong Google Cloud Console
 * 2. Download JSON credentials
 * 3. Share Sheet với email của Service Account
 * 4. Install: npm install googleapis
 * 5. Uncomment code phía dưới
 */

// === MOCK DATA ===
let mockUsers = [
    { id: '1', username: '0901234567', password: '234567', fullName: 'Admin Test', role: 'ADMIN', plate: '', status: 'ACTIVE' },
    { id: '2', username: '0909876543', password: '876543', fullName: 'Tài Xế A', role: 'DRIVER', plate: '51C-12345', status: 'ACTIVE' },
    { id: '3', username: '0905555555', password: '555555', fullName: 'Nhân Viên Kho', role: 'WAREHOUSE', plate: '', status: 'ACTIVE' }
];

let mockOrders = [
    {
        rowIndex: 1, soDon: 'DH001', ngay: '2026-01-10',
        khach: 'Công ty ABC', diaChi: '123 Nguyễn Văn A, Q.1, TP.HCM',
        taiXe: '', bienSo: '', status: 'Mới', type: 'EXPORT',
        products: [
            { name: 'NaOH 32%', qty: 1000, unit: 'Kg', code: 'NAOH32' },
            { name: 'HCl 35%', qty: 500, unit: 'Kg', code: 'HCL35' }
        ]
    },
    {
        rowIndex: 2, soDon: 'NK001', ngay: '2026-01-10',
        khach: 'NCC Hóa Chất XYZ', diaChi: '456 Lê Văn B, Q.7, TP.HCM',
        taiXe: 'Tài Xế A', bienSo: '51C-12345', status: 'Chờ giao hàng', type: 'IMPORT',
        products: [
            { name: 'H2SO4 98%', qty: 2000, unit: 'Kg', code: 'H2SO498' }
        ]
    }
];

let mockMaterials = [
    { code: 'NAOH32', name: 'NaOH 32%', category: 'Base', casNumber: '1310-73-2', unitPrimary: 'Kg', salePrice: 8000, isActive: true },
    { code: 'HCL35', name: 'HCl 35%', category: 'Acid', casNumber: '7647-01-0', unitPrimary: 'Kg', salePrice: 5000, isActive: true },
    { code: 'H2SO498', name: 'H2SO4 98%', category: 'Acid', casNumber: '7664-93-9', unitPrimary: 'Kg', salePrice: 6000, isActive: true },
    { code: 'PAC17', name: 'PAC 17%', category: 'Salt', casNumber: '1327-41-9', unitPrimary: 'Kg', salePrice: 7000, isActive: true }
];

let mockEmployees = [
    { id: 'EMP001', fullName: 'Nguyễn Văn A', phone: '0901234567', role: 'ADMIN', status: 'ACTIVE', baseSalary: 15000000 },
    { id: 'EMP002', fullName: 'Trần Văn B', phone: '0909876543', role: 'DRIVER', plate: '51C-12345', status: 'ACTIVE', baseSalary: 10000000 },
    { id: 'EMP003', fullName: 'Lê Thị C', phone: '0905555555', role: 'WAREHOUSE', status: 'ACTIVE', baseSalary: 8000000 }
];

let mockInventory = [
    { name: 'NAOH32%', warehouse: 'LT1', qty: 5000, totalIn: 10000, totalOut: 5000 },
    { name: 'HCL35%', warehouse: 'LT1', qty: 3000, totalIn: 5000, totalOut: 2000 },
    { name: 'H2SO498%', warehouse: 'LT2', qty: 80, totalIn: 1000, totalOut: 920 },
    { name: 'PAC17%', warehouse: 'LT1', qty: 2500, totalIn: 3000, totalOut: 500 }
];

let mockDataNhap = [];
let mockDataXuat = [];

// === EXPORTED FUNCTIONS ===

export const sheets = {

    // === USERS ===
    getUsers: async () => {
        return mockUsers;
    },

    addUser: async (user) => {
        const newUser = { ...user, id: 'USER' + Date.now() };
        mockUsers.push(newUser);
        return newUser;
    },

    updateUser: async (id, data) => {
        const index = mockUsers.findIndex(u => u.id === id);
        if (index > -1) {
            mockUsers[index] = { ...mockUsers[index], ...data };
            return mockUsers[index];
        }
        return null;
    },

    // === ORDERS ===
    getOrders: async () => {
        return mockOrders;
    },

    addOrder: async (order) => {
        const newOrder = { ...order, rowIndex: mockOrders.length + 1 };
        mockOrders.push(newOrder);
        return newOrder;
    },

    updateOrder: async (rowIndex, data) => {
        const index = mockOrders.findIndex(o => o.rowIndex === rowIndex);
        if (index > -1) {
            mockOrders[index] = { ...mockOrders[index], ...data };
            return mockOrders[index];
        }
        return null;
    },

    // === MATERIALS ===
    getMaterials: async () => {
        return mockMaterials;
    },

    addMaterial: async (material) => {
        const code = material.code || 'MAT' + Date.now();
        const newMaterial = { ...material, code, isActive: true };
        mockMaterials.push(newMaterial);
        return newMaterial;
    },

    updateMaterial: async (code, data) => {
        const index = mockMaterials.findIndex(m => m.code === code);
        if (index > -1) {
            mockMaterials[index] = { ...mockMaterials[index], ...data };
            return mockMaterials[index];
        }
        return null;
    },

    // === EMPLOYEES ===
    getEmployees: async () => {
        return mockEmployees;
    },

    addEmployee: async (employee) => {
        const id = 'EMP' + Date.now();
        const newEmployee = { ...employee, id, status: 'ACTIVE' };
        mockEmployees.push(newEmployee);
        return newEmployee;
    },

    updateEmployee: async (id, data) => {
        const index = mockEmployees.findIndex(e => e.id === id);
        if (index > -1) {
            mockEmployees[index] = { ...mockEmployees[index], ...data };
            return mockEmployees[index];
        }
        return null;
    },

    // === INVENTORY ===
    getInventory: async (warehouseId = '') => {
        if (warehouseId) {
            return mockInventory.filter(i => i.warehouse === warehouseId);
        }
        return mockInventory;
    },

    // === DATA NHAP/XUAT ===
    addDataNhap: async (data) => {
        mockDataNhap.push(data);
        // Update inventory
        const existing = mockInventory.find(i => i.name === data.product);
        if (existing) {
            existing.qty += data.qty;
            existing.totalIn += data.qty;
        } else {
            mockInventory.push({
                name: data.product,
                warehouse: data.warehouse,
                qty: data.qty,
                totalIn: data.qty,
                totalOut: 0
            });
        }
        return data;
    },

    addDataXuat: async (data) => {
        mockDataXuat.push(data);
        // Update inventory
        const existing = mockInventory.find(i => i.name === data.product);
        if (existing) {
            existing.qty -= data.qty;
            existing.totalOut += data.qty;
        }
        return data;
    },

    getDataNhap: async () => mockDataNhap,
    getDataXuat: async () => mockDataXuat,

    // === MASTER DATA ===
    getTrucks: async () => {
        return ['51C-12345', '51C-67890', '51C-11111'];
    },

    getCustomers: async () => {
        return ['Công ty ABC', 'Công ty XYZ', 'Nhà máy 123'];
    },

    getSuppliers: async () => {
        return ['NCC Hóa Chất XYZ', 'NCC ABC', 'NCC DEF'];
    }
};

export default sheets;
