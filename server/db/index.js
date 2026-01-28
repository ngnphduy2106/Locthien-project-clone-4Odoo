// ===============================================
// DATABASE ABSTRACTION LAYER
// Supports: Supabase (Primary), Firebase RTDB, Mock
// ===============================================

import { supabase, supabaseInitialized } from './supabase.js';
import { db as firebaseDb, firebaseInitialized } from './firebase.js';

// Priority: Supabase > Firebase > Mock
const getMode = () => {
    const useSupabase = supabaseInitialized && supabase !== null;
    const useFirebase = !useSupabase && firebaseInitialized && firebaseDb !== null;
    return { useSupabase, useFirebase };
};

// Log detailed diagnostics at startup
const { useSupabase, useFirebase } = getMode();
console.log(`📦 DATABASE DIAGNOSTICS:`);
console.log(`   - SUPABASE_URL: ${process.env.SUPABASE_URL ? 'PRESENT' : 'MISSING'}`);
console.log(`   - SUPABASE_KEY: ${process.env.SUPABASE_KEY ? 'PRESENT' : 'MISSING'}`);
console.log(`   - PREFERRED MODE: ${useSupabase ? 'Supabase' : (useFirebase ? 'Firebase RTDB' : 'Mock (In-Memory)')}`);

// ===============================================
// MOCK DATA (Fallback)
// ===============================================

let mockData = {
    users: [
        { id: '1', username: '0901234567', password: '234567', fullName: 'Admin Test', role: 'ADMIN', plate: '', status: 'ACTIVE', phone: '0901234567', baseSalary: 15000000 },
        { id: '2', username: '0909876543', password: '876543', fullName: 'Tài Xế A', role: 'DRIVER', plate: '51C-12345', status: 'ACTIVE', phone: '0909876543', baseSalary: 10000000 },
        { id: '3', username: '0905555555', password: '555555', fullName: 'Nhân Viên Kho', role: 'WAREHOUSE', plate: '', status: 'ACTIVE', phone: '0905555555', baseSalary: 8000000 }
    ],
    orders: [],
    materials: [],
    employees: [],
    inventory: [],
    trucks: ['51C-12345', '51C-67890'],
    customers: ['Công ty ABC', 'Công ty XYZ'],
    suppliers: ['NCC Hóa Chất']
};

// ===============================================
// HELPERS
// ===============================================

const sanitizeId = (id) => {
    if (!id) return id;
    return String(id).replace(/[.#$[\]]/g, '_');
};

// ===============================================
// DATABASE API
// ===============================================

export const db = {

    // === USERS ===
    getUsers: async () => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const { data, error } = await supabase.from('users').select('*');
            if (error) console.error('Supabase getUsers error:', error);
            // Map Supabase lowercase to frontend camelCase
            return (data || []).map(u => ({
                ...u,
                fullName: u.fullname || u.fullName || '',
                baseSalary: u.basesalary || 0,
                createdAt: u.createdat || u.createdAt
            }));
        }
        if (useFirebase) {
            const snapshot = await firebaseDb.ref('users').once('value');
            return snapshot.val() ? Object.values(snapshot.val()) : [];
        }
        return mockData.users;
    },

    getUserById: async (id) => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
            return data;
        }
        if (useFirebase) {
            const snapshot = await firebaseDb.ref(`users/${sanitizeId(id)}`).once('value');
            return snapshot.val();
        }
        return mockData.users.find(u => u.id === id);
    },

    addUser: async (user) => {
        const { useSupabase, useFirebase } = getMode();
        const id = sanitizeId(user.id || ('USER' + Date.now()));
        const newUser = { ...user, id, createdAt: new Date().toISOString() };
        if (useSupabase) {
            const { data, error } = await supabase.from('users').insert(newUser).select().single();
            if (error) console.error('Supabase addUser error:', error);
            return data || newUser;
        }
        if (useFirebase) {
            await firebaseDb.ref(`users/${id}`).set(newUser);
        } else {
            mockData.users.push(newUser);
        }
        return newUser;
    },

    updateUser: async (id, data) => {
        const { useSupabase, useFirebase } = getMode();
        const safeId = sanitizeId(id);
        if (useSupabase) {
            const { data: updated, error } = await supabase.from('users').update(data).eq('id', safeId).select().single();
            return updated;
        }
        if (useFirebase) {
            await firebaseDb.ref(`users/${safeId}`).update(data);
            return { id: safeId, ...data };
        }
        const index = mockData.users.findIndex(u => u.id === id);
        if (index > -1) {
            mockData.users[index] = { ...mockData.users[index], ...data };
            return mockData.users[index];
        }
        return null;
    },

    // === ORDERS ===
    getOrders: async () => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const { data, error } = await supabase.from('orders').select('*').order('sale_order_date', { ascending: false });
            if (error) console.error('Supabase getOrders error:', error);
            // Map to frontend field names for compatibility
            return (data || []).map(o => {
                // Parse products from JSONB
                let products = [];
                try {
                    if (typeof o.sale_order_product_mappings === 'string') {
                        products = JSON.parse(o.sale_order_product_mappings);
                    } else if (Array.isArray(o.sale_order_product_mappings)) {
                        products = o.sale_order_product_mappings;
                    }
                } catch (e) { }

                return {
                    ...o,
                    // Basic info
                    soDon: o.sale_order_no,
                    ngay: o.sale_order_date,
                    khach: o.account_name,
                    // Address - fallback to billing if shipping is empty
                    diaChi: o.shipping_address || o.billing_address || '',
                    // Financial
                    amount: o.sale_order_amount || 0,
                    // Driver info (from MISA custom fields)
                    taiXe: o.custom_field13 || '',
                    bienSo: o.custom_field14 || '',
                    driver: o.custom_field13 || '',
                    plate: o.custom_field14 || '',
                    // Products
                    products: products,
                    cart: products
                };
            });
        }
        if (useFirebase) {
            const snapshot = await firebaseDb.ref('orders').once('value');
            const data = snapshot.val();
            return data ? Object.values(data) : [];
        }
        return mockData.orders;
    },

    getOrder: async (id) => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const safeId = sanitizeId(id);
            // Try by id first
            let { data, error } = await supabase.from('orders').select('*').eq('id', safeId).single();

            // If not found, try by sale_order_no (with original id, might have dots)
            if (!data || error) {
                const { data: data2, error: error2 } = await supabase.from('orders').select('*').eq('sale_order_no', id).single();
                data = data2;
                error = error2;
            }

            // If still not found, try sale_order_no with sanitized id (underscores)
            if (!data || error) {
                const { data: data3, error: error3 } = await supabase.from('orders').select('*').ilike('sale_order_no', `%${safeId.replace(/_/g, '%')}%`).single();
                data = data3;
            }

            if (data) {
                // Parse products from JSONB
                let products = [];
                try {
                    if (typeof data.sale_order_product_mappings === 'string') {
                        products = JSON.parse(data.sale_order_product_mappings);
                    } else if (Array.isArray(data.sale_order_product_mappings)) {
                        products = data.sale_order_product_mappings;
                    }
                } catch (e) { }

                data.products = products;
                data.cart = products;
            }

            return data;
        }
        if (useFirebase) {
            const snapshot = await firebaseDb.ref(`orders/${sanitizeId(id)}`).once('value');
            return snapshot.val();
        }
        return mockData.orders.find(o => o.id === id);
    },


    addOrder: async (order) => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const id = sanitizeId(order.id || order.sale_order_no || order.soDon);
            // Map ALL MISA fields directly to Supabase columns
            const safeOrder = {
                id,
                // Core Info
                misa_id: order.misa_id || order.id || null, // Preserve numeric MISA ID
                sale_order_no: order.sale_order_no || order.soDon || null,
                sale_order_name: order.sale_order_name || null,
                sale_order_date: order.sale_order_date || order.ngay || null,
                book_date: order.book_date || null,
                deadline_date: order.deadline_date || null,
                due_date: order.due_date || null,
                delivery_date: order.delivery_date || null,
                // Customer
                account_name: order.account_name || order.khach || null,
                account_code: order.account_code || null,
                contact_name: order.contact_name || null,
                phone: order.phone || null,
                // Status
                status: order.status || 'Mới',
                delivery_status: order.delivery_status || null,
                pay_status: order.pay_status || null,
                revenue_status: order.revenue_status || null,
                sale_order_type: order.sale_order_type || null,
                // Shipping
                shipping_address: order.shipping_address || order.diaChi || null,
                shipping_province: order.shipping_province || null,
                shipping_district: order.shipping_district || null,
                shipping_ward: order.shipping_ward || null,
                shipping_code: order.shipping_code || null,
                // Financial
                sale_order_amount: Number(order.sale_order_amount || order.amount || 0),
                total_summary: Number(order.total_summary || 0),
                tax_summary: Number(order.tax_summary || 0),
                discount_summary: Number(order.discount_summary || 0),
                // Products (JSONB)
                sale_order_product_mappings: order.sale_order_product_mappings || order.cart
                    ? JSON.stringify(order.sale_order_product_mappings || order.cart)
                    : null,
                list_product: order.list_product || null,
                // Custom Fields (Driver/Plate)
                custom_field13: order.custom_field13 || order.driver || order.taiXe || null,
                custom_field14: order.custom_field14 || order.plate || order.bienSo || null,
                // Organization
                organization_unit_name: order.organization_unit_name || null,
                owner_name: order.owner_name || null,
                form_layout: order.form_layout || null,
                description: order.description || order.note || null,
                // Metadata
                created_date: order.created_date || null,
                modified_date: order.modified_date || null
            };
            const { data, error } = await supabase.from('orders').upsert(safeOrder, { onConflict: 'id' }).select().single();
            if (error) console.error('Supabase addOrder error:', error);
            return data || safeOrder;
        }
        if (useFirebase) {
            const id = sanitizeId(order.id || order.soDon);
            const safeOrder = { ...order, id };
            await firebaseDb.ref(`orders/${id}`).set(safeOrder);
            return safeOrder;
        }
        mockData.orders.push(order);
        return order;
    },

    updateOrder: async (id, data) => {
        const { useSupabase, useFirebase } = getMode();
        const safeId = sanitizeId(id);
        if (useSupabase) {
            // Map incoming data to Supabase column names
            const safeData = {};

            // Direct mappings (camelCase/Vietnamese → Supabase columns)
            if (data.status !== undefined) safeData.status = data.status;
            if (data.misa_id !== undefined) safeData.misa_id = data.misa_id;
            if (data.note !== undefined) safeData.description = data.note;
            if (data.description !== undefined) safeData.description = data.description;

            // Driver/Plate → custom_field13/14
            if (data.taiXe !== undefined) safeData.custom_field13 = data.taiXe;
            if (data.bienSo !== undefined) safeData.custom_field14 = data.bienSo;
            if (data.driver !== undefined) safeData.custom_field13 = data.driver;
            if (data.plate !== undefined) safeData.custom_field14 = data.plate;
            if (data.custom_field13 !== undefined) safeData.custom_field13 = data.custom_field13;
            if (data.custom_field14 !== undefined) safeData.custom_field14 = data.custom_field14;

            // Other fields
            if (data.phone !== undefined) safeData.phone = data.phone;
            if (data.amount !== undefined) safeData.sale_order_amount = data.amount;
            if (data.sale_order_amount !== undefined) safeData.sale_order_amount = data.sale_order_amount;
            if (data.delivery_status !== undefined) safeData.delivery_status = data.delivery_status;

            // Address
            if (data.diaChi !== undefined) safeData.shipping_address = data.diaChi;
            if (data.shipping_address !== undefined) safeData.shipping_address = data.shipping_address;

            // Products
            if (data.cart !== undefined) {
                safeData.sale_order_product_mappings = typeof data.cart === 'string' ? data.cart : JSON.stringify(data.cart);
            }
            if (data.sale_order_product_mappings !== undefined) {
                safeData.sale_order_product_mappings = typeof data.sale_order_product_mappings === 'string'
                    ? data.sale_order_product_mappings
                    : JSON.stringify(data.sale_order_product_mappings);
            }

            console.log(`📝 Updating order ${safeId}:`, Object.keys(safeData));
            const { data: updated, error } = await supabase.from('orders').update(safeData).eq('id', safeId).select().single();
            if (error) console.error('Supabase updateOrder error:', error);
            return updated || { id: safeId, ...safeData };
        }
        if (useFirebase) {
            await firebaseDb.ref(`orders/${safeId}`).update(data);
            return { id: safeId, ...data };
        }
        const index = mockData.orders.findIndex(o => o.id === id);
        if (index !== -1) {
            mockData.orders[index] = { ...mockData.orders[index], ...data };
            return mockData.orders[index];
        }
        return null;
    },

    clearOrders: async () => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const { error } = await supabase.from('orders').delete().neq('id', '');
            if (error) console.error('Supabase clearOrders error:', error);
            return;
        }
        if (useFirebase) {
            await firebaseDb.ref('orders').remove();
            return;
        }
        mockData.orders = [];
    },

    // === MATERIALS ===
    getMaterials: async () => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const { data, error } = await supabase.from('materials').select('*');
            if (error) console.error('Supabase getMaterials error:', error);
            return data || [];
        }
        if (useFirebase) {
            const snapshot = await firebaseDb.ref('materials').once('value');
            return snapshot.val() ? Object.values(snapshot.val()) : [];
        }
        return mockData.materials;
    },

    addMaterial: async (material) => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const id = sanitizeId(material.id || material.code);
            const safeMaterial = { ...material, id };
            const { data, error } = await supabase.from('materials').upsert(safeMaterial, { onConflict: 'id' }).select().single();
            if (error) console.error('Supabase addMaterial error:', error);
            return data || safeMaterial;
        }
        if (useFirebase) {
            const id = sanitizeId(material.id || material.code);
            const safeMaterial = { ...material, id };
            await firebaseDb.ref(`materials/${id}`).set(safeMaterial);
            return safeMaterial;
        }
        mockData.materials.push(material);
        return material;
    },

    updateMaterial: async (code, data) => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const { data: updated, error } = await supabase.from('materials').update(data).eq('id', sanitizeId(code)).select().single();
            return updated || { code, ...data };
        }
        if (useFirebase) {
            await firebaseDb.ref(`materials/${sanitizeId(code)}`).update(data);
            return { code, ...data };
        }
        return null;
    },

    // === EMPLOYEES ===
    getEmployees: async () => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const { data, error } = await supabase.from('employees').select('*');
            return data || [];
        }
        if (useFirebase) {
            const snapshot = await firebaseDb.ref('employees').once('value');
            return snapshot.val() ? Object.values(snapshot.val()) : [];
        }
        return mockData.employees;
    },

    addEmployee: async (employee) => {
        const { useSupabase, useFirebase } = getMode();
        const id = sanitizeId('EMP' + Date.now());
        const newEmployee = { ...employee, id, status: 'ACTIVE' };
        if (useSupabase) {
            const { data, error } = await supabase.from('employees').insert(newEmployee).select().single();
            return data || newEmployee;
        }
        if (useFirebase) {
            await firebaseDb.ref(`employees/${id}`).set(newEmployee);
        } else {
            mockData.employees.push(newEmployee);
        }
        return newEmployee;
    },

    updateEmployee: async (id, data) => {
        const { useSupabase, useFirebase } = getMode();
        const safeId = sanitizeId(id);
        if (useSupabase) {
            const { data: updated, error } = await supabase.from('employees').update(data).eq('id', safeId).select().single();
            return updated;
        }
        if (useFirebase) {
            await firebaseDb.ref(`employees/${safeId}`).update(data);
            return { id: safeId, ...data };
        }
        return null;
    },

    // === INVENTORY ===
    getInventory: async () => {
        const { useSupabase, useFirebase } = getMode();
        if (useSupabase) {
            const { data, error } = await supabase.from('inventory').select('*');
            return data || [];
        }
        if (useFirebase) {
            const snapshot = await firebaseDb.ref('inventory').once('value');
            return snapshot.val() ? Object.values(snapshot.val()) : [];
        }
        return mockData.inventory;
    },

    updateInventory: async () => { return true; },
    addDataNhap: async (d) => { return d; },
    addDataXuat: async (d) => { return d; },

    // === MASTER DATA ===
    getTrucks: async () => { return mockData.trucks; },
    getCustomers: async () => { return mockData.customers; },
    getSuppliers: async () => { return mockData.suppliers; }
};

export default db;
