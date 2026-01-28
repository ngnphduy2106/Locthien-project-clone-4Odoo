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
    getOrders: async () => {
        const res = await fetch(`${API_BASE}/orders`);
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

    assignOrder: async (id, driverName, plate, note) => {
        const res = await fetch(`${API_BASE}/orders/${id}/assign`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverName, plate, note })
        });
        return res.json();
    },

    startOrder: async (id) => {
        const res = await fetch(`${API_BASE}/orders/${id}/start`, {
            method: 'PUT'
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

    // === IMPORTS ===
    createImport: async (data) => {
        // Map keys to match server/routes/imports.js
        const payload = {
            supplier_name: data.supplier || data.customer || '',
            supplier_address: data.address || '',
            expected_date: data.date || '',
            products: data.products || []
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
    }
};

window.api = api;

