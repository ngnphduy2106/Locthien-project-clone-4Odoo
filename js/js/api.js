// ===============================================
// LỘC THIÊN ERP - API CLIENT
// ===============================================

const API_BASE = '/api';

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
    }
};

window.api = api;
