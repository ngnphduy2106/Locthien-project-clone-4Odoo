// ===============================================
// LỘC THIÊN ERP - API CLIENT
// ===============================================

const getApiBase = () => {
    // 1. Check URL parameters first (high priority for manual overrides)
    const urlParams = new URLSearchParams(window.location.search);
    const apiOverride = urlParams.get('apiUrl');
    if (apiOverride) return apiOverride;

    // 2. Check local storage (persistent setting)
    const savedApi = localStorage.getItem('LT_API_URL');
    if (savedApi) return savedApi;

    // 3. Fallback to default
    // If running on localhost or Netlify, use relative /api
    return '/api';
};

const API_BASE = getApiBase();

const api = {

    // === AUTH ===
    login: async (username, password) => {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        return res.json();
    },

    register: async (data) => {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    // === ORDERS ===
    getOrders: async (includeDeleted = false) => {
        const url = includeDeleted ? `${API_BASE}/orders?includeDeleted=true` : `${API_BASE}/orders`;
        const res = await fetch(url);
        return res.json();
    },

    getOrderDetail: async (orderId) => {
        const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`);
        return res.json();
    },

    getMyOrders: async (driverName, role) => {
        const res = await fetch(`${API_BASE}/orders/my/${encodeURIComponent(driverName)}?role=${role}`);
        return res.json();
    },

    createOrder: async (data) => {
        const res = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    // Create local export order (không sync MISA)
    createLocalExport: async (data) => {
        const payload = {
            customer_name: data.customer || data.supplier || '',
            customer_address: data.address || '',
            expected_date: data.date || '',
            products: data.products || [],
            description: data.description || '',
            note: data.note || ''
        };
        const res = await fetch(`${API_BASE}/orders/local`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return res.json();
    },

    pinOrder: async (id, isPinned) => {
        const res = await fetch(`${API_BASE}/orders/${id}/pin`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_pinned: isPinned })
        });
        return res.json();
    },

    pinImport: async (id, isPinned) => {
        const res = await fetch(`${API_BASE}/imports/${id}/pin`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_pinned: isPinned })
        });
        return res.json();
    },

    assignOrder: async (id, driverName, plate, note, assistantName = null, deliveryTime = null) => {
        const res = await fetch(`${API_BASE}/orders/${id}/assign`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverName, plate, note, assistantName, deliveryTime })
        });
        return res.json();
    },

    startOrder: async (id, assignmentId = null) => {
        const res = await fetch(`${API_BASE}/orders/${id}/start`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignment_id: assignmentId })
        });
        return res.json();
    },

    completeOrder: async (id, data) => {
        const res = await fetch(`${API_BASE}/orders/${id}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    editAssignment: async (orderId, data) => {
        const res = await fetch(`${API_BASE}/orders/${orderId}/edit-assignment`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    editImportAssignment: async (importId, data) => {
        const res = await fetch(`${API_BASE}/imports/${importId}/edit-assignment`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    // === HR ===
    getEmployees: async () => {
        const res = await fetch(`${API_BASE}/hr/employees`);
        return res.json();
    },

    addEmployee: async (data) => {
        const res = await fetch(`${API_BASE}/hr/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    // === MATERIALS ===
    getMaterials: async (search = '') => {
        const url = search ? `${API_BASE}/materials?search=${encodeURIComponent(search)}` : `${API_BASE}/materials`;
        const res = await fetch(url);
        return res.json();
    },

    addMaterial: async (data) => {
        const res = await fetch(`${API_BASE}/materials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    // === WAREHOUSE ===
    getWarehouses: async () => {
        const res = await fetch(`${API_BASE}/warehouse`);
        return res.json();
    },

    getInventory: async (warehouseId = '') => {
        const url = warehouseId ? `${API_BASE}/warehouse/inventory?warehouseId=${warehouseId}` : `${API_BASE}/warehouse/inventory`;
        const res = await fetch(url);
        return res.json();
    },

    getAlerts: async () => {
        const res = await fetch(`${API_BASE}/warehouse/alerts`);
        return res.json();
    },

    transferStock: async (data) => {
        const res = await fetch(`${API_BASE}/warehouse/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    // === REPORTS ===
    getReportInventory: async () => {
        const res = await fetch(`${API_BASE}/reports/inventory`);
        return res.json();
    },

    getReportSummary: async (from, to, partner, product) => {
        let url = `${API_BASE}/reports/summary?from=${from}&to=${to}`;
        if (partner) url += `&partner=${encodeURIComponent(partner)}`;
        if (product) url += `&product=${encodeURIComponent(product)}`;
        const res = await fetch(url);
        return res.json();
    },

    getDashboard: async () => {
        const res = await fetch(`${API_BASE}/reports/dashboard`);
        return res.json();
    },

    // Alias for getDashboard (used by new UI)
    getDashboardStats: async () => {
        const res = await fetch(`${API_BASE}/reports/dashboard`);
        return res.json();
    },

    // === COMPLETE ORDER ===
    completeOrder: async (id, data) => {
        const res = await fetch(`${API_BASE}/orders/${id}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    // === ORDER HISTORY ===
    getOrderHistory: async () => {
        const res = await fetch(`${API_BASE}/reports/order-history`);
        return res.json();
    },

    // === SUPPLIERS ===
    getSuppliers: async () => {
        const res = await fetch(`${API_BASE}/suppliers`);
        return res.json();
    },

    createSupplier: async (data) => {
        const res = await fetch(`${API_BASE}/suppliers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    updateSupplier: async (id, data) => {
        const res = await fetch(`${API_BASE}/suppliers/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    deleteSupplier: async (id) => {
        const res = await fetch(`${API_BASE}/suppliers/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        return res.json();
    },

    importSuppliersFromSheet: async () => {
        const res = await fetch(`${API_BASE}/suppliers/import-sheet`, {
            method: 'POST'
        });
        return res.json();
    },

    // === IMPORTS ===
    createImport: async (data) => {
        // Map keys to match server/routes/imports.js
        const payload = {
            supplier_name: data.supplier || data.customer || '',
            supplier_address: data.address || '',
            expected_date: data.date || '',
            products: data.products || [],
            description: data.description || '',  // Mô tả khi tạo đơn
            note: data.note || ''  // Ghi chú của tài xế
        };
        const res = await fetch(`${API_BASE}/imports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return res.json();
    },

    getImports: async () => {
        const res = await fetch(`${API_BASE}/imports`);
        return res.json();
    },

    getImportsCompleted: async (page = 1, limit = 50) => {
        const res = await fetch(`${API_BASE}/imports?tab=completed&page=${page}&limit=${limit}`);
        return res.json();
    },

    assignImportDriver: async (id, driverName, plate) => {
        const res = await fetch(`${API_BASE}/imports/${id}/assign`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driver_name: driverName, plate })
        });
        return res.json();
    },

    completeImport: async (id, data) => {
        const res = await fetch(`${API_BASE}/imports/${id}/complete`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    updateImport: async (id, data) => {
        const res = await fetch(`${API_BASE}/imports/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    // === CHAT ===
    getUnreadCounts: async (userId) => {
        const res = await fetch(`${API_BASE}/chat/unread-counts?userId=${encodeURIComponent(userId)}`);
        return res.json();
    },

    markMessagesRead: async (id, userId, type = 'export') => {
        const typeParam = type === 'import' ? '?type=import' : '';
        const res = await fetch(`${API_BASE}/chat/${id}/mark-read${typeParam}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        return res.json();
    },

    // === NOTIFICATIONS ===
    registerFcmToken: async (userId, fcmToken) => {
        const res = await fetch(`${API_BASE}/auth/register-fcm-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, fcmToken })
        });
        return res.json();
    },

    // === WAREHOUSE ===
    getWarehouses: async () => {
        const res = await fetch(`${API_BASE}/warehouse`);
        return res.json();
    },

    getInventory: async (warehouseId) => {
        const url = warehouseId ? `${API_BASE}/warehouse/inventory?warehouseId=${warehouseId}` : `${API_BASE}/warehouse/inventory`;
        const res = await fetch(url);
        return res.json();
    },

    getWarehouseAlerts: async () => {
        const res = await fetch(`${API_BASE}/warehouse/alerts`);
        return res.json();
    },

    adjustInventory: async (data) => {
        const res = await fetch(`${API_BASE}/warehouse/adjust`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    getProductHistory: async (productName) => {
        const res = await fetch(`${API_BASE}/warehouse/history/${encodeURIComponent(productName)}`);
        return res.json();
    },

    // === CUSTOMERS (Khách hàng) ===
    getCustomers: async () => {
        const res = await fetch(`${API_BASE}/customers`);
        return res.json();
    },

    createCustomer: async (data) => {
        const res = await fetch(`${API_BASE}/customers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    updateCustomer: async (id, data) => {
        const res = await fetch(`${API_BASE}/customers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    deleteCustomer: async (id) => {
        const res = await fetch(`${API_BASE}/customers/${id}`, {
            method: 'DELETE'
        });
        return res.json();
    },

    importCustomersFromSheet: async () => {
        const res = await fetch(`${API_BASE}/customers/import-sheet`, {
            method: 'POST'
        });
        return res.json();
    }
};

window.api = api;

