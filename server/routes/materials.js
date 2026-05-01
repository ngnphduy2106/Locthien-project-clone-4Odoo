// ===============================================
// MATERIALS ROUTES
// ===============================================

import { Router } from 'express';
import { createResponse } from '../config.js';
import db from '../db/index.js';
import { syncMisaProducts } from '../services/misa.js';

const router = Router();

// POST /api/materials/sync-misa - Sync products from MISA CRM
router.post('/sync-misa', async (req, res) => {
    try {
        console.log('📡 Manual MISA Product Sync requested...');
        const result = await syncMisaProducts();

        if (result && result.success === false) {
            return res.json(createResponse(true, result.error || 'MISA sync failed'));
        }

        const materials = await db.getMaterials();
        res.json(createResponse(false, `Đã đồng bộ ${result?.synced || 0} sản phẩm từ MISA! (Total in DB: ${materials.length})`, {
            count: materials.length,
            synced: result?.synced || 0
        }));
    } catch (e) {
        console.error('MISA Sync Error:', e);
        res.json(createResponse(true, 'Lỗi đồng bộ MISA: ' + e.message));
    }
});

// DELETE /api/materials/clear - Clear all materials (for resync)
router.delete('/clear', async (req, res) => {
    try {
        console.log('🗑️ Clearing all materials...');
        // Import supabase directly for this operation
        const { supabase } = await import('../db/supabase.js');
        const { error } = await supabase.from('materials').delete().neq('id', '');

        if (error) {
            console.error('Clear materials error:', error);
            return res.json(createResponse(true, 'Lỗi xóa dữ liệu: ' + error.message));
        }

        res.json(createResponse(false, 'Đã xóa tất cả materials. Hãy sync lại từ MISA!'));
    } catch (e) {
        console.error('Clear materials error:', e);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// GET /api/materials/test-misa - Test MISA Products API directly
router.get('/test-misa', async (req, res) => {
    try {
        const fetch = (await import('node-fetch')).default;

        // 1. Login to MISA
        console.log('🔑 Testing MISA login...');
        const authResponse = await fetch('https://crmconnect.misa.vn/api/v2/Account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: process.env.MISA_CLIENT_ID,
                client_secret: process.env.MISA_CLIENT_SECRET
            })
        });

        const authJson = await authResponse.json();
        console.log('🔑 MISA Auth Response:', JSON.stringify(authJson).substring(0, 300));

        const token = authJson.Data || authJson.data;
        if (!token) {
            return res.json(createResponse(true, 'MISA login failed', { authResponse: authJson }));
        }

        // 2. Fetch Products
        console.log('📦 Testing MISA Products API...');
        const productsResponse = await fetch('https://crmconnect.misa.vn/api/v2/Products?PageSize=10&Page=1', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Clientid': process.env.MISA_CLIENT_ID
            }
        });

        const productsJson = await productsResponse.json();
        console.log('📦 MISA Products Response:', JSON.stringify(productsJson).substring(0, 1000));

        res.json(createResponse(false, 'MISA API Test Complete', {
            authSuccess: !!(authJson.Success || authJson.success),
            token: token ? 'OK' : 'FAILED',
            productsResponse: productsJson
        }));
    } catch (e) {
        console.error('MISA Test Error:', e);
        res.json(createResponse(true, 'MISA test error: ' + e.message));
    }
});

// GET /api/materials
router.get('/', async (req, res) => {
    try {
        const { search, category, active } = req.query;
        let materials = await db.getMaterials();

        // Filter by search
        if (search) {
            const q = search.toLowerCase();
            materials = materials.filter(m =>
                m.name.toLowerCase().includes(q) ||
                m.code.toLowerCase().includes(q) ||
                (m.casNumber && m.casNumber.includes(q))
            );
        }

        // Filter by category
        if (category) {
            materials = materials.filter(m => m.category === category);
        }

        // Filter by active
        if (active !== undefined) {
            const isActive = active === 'true';
            materials = materials.filter(m => m.isActive === isActive);
        }

        res.json(createResponse(false, 'OK', materials));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/materials/categories
router.get('/categories', async (req, res) => {
    try {
        const materials = await db.getMaterials();
        const categories = [...new Set(materials.map(m => m.category).filter(c => c))].sort();
        res.json(createResponse(false, 'OK', categories));
    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/materials/:code
router.get('/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const materials = await db.getMaterials();
        const material = materials.find(m => m.code === code);

        if (!material) {
            return res.json(createResponse(true, 'Không tìm thấy vật tư!'));
        }

        res.json(createResponse(false, 'OK', material));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/materials
router.post('/', async (req, res) => {
    try {
        const { name, code, casNumber, concentration, category, purchasePrice, salePrice, unitPrimary } = req.body;

        if (!name) {
            return res.json(createResponse(true, 'Vui lòng nhập tên vật tư!'));
        }

        const material = await db.addMaterial({
            name,
            code,
            casNumber: casNumber || '',
            concentration: concentration || '',
            category: category || 'Hóa chất',
            purchasePrice: purchasePrice || 0,
            salePrice: salePrice || 0,
            unitPrimary: unitPrimary || 'Kg'
        });

        res.json(createResponse(false, 'Đã thêm vật tư!', { code: material.code }));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/materials/:code
router.put('/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const material = await db.updateMaterial(code, req.body);

        if (!material) {
            return res.json(createResponse(true, 'Không tìm thấy vật tư!'));
        }

        res.json(createResponse(false, 'Đã cập nhật vật tư!'));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// DELETE /api/materials/:code (soft delete)
router.delete('/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const material = await db.updateMaterial(code, { isActive: false });

        if (!material) {
            return res.json(createResponse(true, 'Không tìm thấy vật tư!'));
        }

        res.json(createResponse(false, 'Đã xóa vật tư!'));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

export default router;
