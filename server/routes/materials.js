// ===============================================
// MATERIALS ROUTES
// ===============================================

import { Router } from 'express';
import { createResponse } from '../config.js';
import db from '../db/index.js';

const router = Router();

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
