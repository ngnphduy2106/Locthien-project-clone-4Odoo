// ===============================================
// MISA CRM SYNC SERVICE
// ===============================================

import fetch from 'node-fetch';
import db from '../db/index.js';
import { sendTelegramMessage } from './telegram.js';

const MISA_AUTH_URL = 'https://crmconnect.misa.vn/api/v2/Account';
const MISA_ORDERS_URL = 'https://crmconnect.misa.vn/api/v2/SaleOrders';
const MISA_PRODUCTS_URL = 'https://crmconnect.misa.vn/api/v2/Products';

let cachedToken = null;
let isSyncing = false; // Prevent race conditions

// Helper to check if syncing
export const getSyncStatus = () => isSyncing;

// Helper for fetch with timeout
async function fetchWithTimeout(url, options, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        if (e.name === 'AbortError') {
            throw new Error('MISA API Timeout (Chưa phản hồi sau 10 giây)');
        }
        throw e;
    }
}

async function loginMisa() {
    try {
        const response = await fetchWithTimeout(MISA_AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: process.env.MISA_CLIENT_ID,
                client_secret: process.env.MISA_CLIENT_SECRET
            })
        });

        const json = await response.json();

        // Handle various casing from MISA API
        const success = json.Success || json.success;
        const data = json.Data || json.data;

        if (success && data) {
            cachedToken = data;
            return cachedToken;
        }
        console.error('❌ MISA Login Failed:', json);
        return null;
    } catch (e) {
        console.error('❌ MISA Login Error:', e.message);
        return null; // Return null on failure
    }
}

// Fetch all products from MISA and sync to DB
export const syncMisaProducts = async () => {
    console.log('🔄 Starting MISA Product Sync...');
    if (!cachedToken) await loginMisa();
    if (!cachedToken) return;

    let page = 1;
    let hasMore = true;
    let totalSynced = 0;

    try {
        while (hasMore) {
            console.log(`📡 Fetching MISA Products Page ${page}...`);
            const response = await fetch(`${MISA_PRODUCTS_URL}?PageSize=100&Page=${page}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cachedToken}`,
                    'Clientid': process.env.MISA_CLIENT_ID
                }
            });

            const json = await response.json();
            const success = json.Success || json.success;
            const data = json.Data || json.data;

            if (success && data && Array.isArray(data) && data.length > 0) {
                // Upsert to Firestore
                for (const p of data) {
                    const material = {
                        code: p.product_code,
                        name: p.product_name,
                        unit: p.unit || '',
                        price: Number(p.price || 0),
                        sale_price: Number(p.price || 0), // Map to UI field (snake_case for Supabase)
                        category: 'MISA CRM', // Default category for filter
                        type: 'MisaProduct', // Tag as MISA
                        status: p.status === 2 ? 'INACTIVE' : 'ACTIVE', // Guessing status enum, or just map
                        description: p.description || ''
                    };

                    await db.addMaterial(material); // This handles upsert in our DB layer
                }

                totalSynced += data.length;
                page++;
            } else {
                hasMore = false;
            }
        }
        console.log(`✅ MISA Product Sync Complete. Total: ${totalSynced}`);
    } catch (e) {
        console.error('❌ MISA Product Sync Error:', e.message);
    }
};

export async function getMisaOrders(retryCount = 0, fullSync = true) {
    if (!cachedToken) await loginMisa();
    if (!cachedToken) return [];

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cachedToken}`,
        'Clientid': process.env.MISA_CLIENT_ID
    };

    const orderMap = new Map();

    // PRIORITY 1: Fetch newest orders (no Page param = realtime data)
    try {
        console.log(`📡 [REALTIME] Fetching newest orders...`);
        const url = `${MISA_ORDERS_URL}?PageSize=1000`;
        const response = await fetch(url, { method: 'GET', headers });

        if (response.ok) {
            const json = await response.json();
            const data = json.Data || json.data || [];
            data.forEach(order => orderMap.set(order.sale_order_no, order));
            console.log(`   ✅ Got ${data.length} newest orders`);
        }
    } catch (e) {
        console.error(`❌ Realtime fetch error:`, e.message);
    }

    // PRIORITY 2: Fetch historical pages (only if fullSync enabled)
    if (fullSync) {
        for (let page = 1; page <= 3; page++) {
            try {
                await new Promise(r => setTimeout(r, 200));
                console.log(`📡 [HISTORICAL] Page ${page}...`);
                const url = `${MISA_ORDERS_URL}?PageSize=1000&Page=${page}`;
                const response = await fetch(url, { method: 'GET', headers });

                if (!response.ok) break;

                const json = await response.json();
                const data = json.Data || json.data || [];
                if (data.length === 0) break;

                const before = orderMap.size;
                data.forEach(order => orderMap.set(order.sale_order_no, order));
                console.log(`   + ${data.length} orders, ${orderMap.size - before} new`);

                if (data.length < 100) break;
            } catch (e) {
                console.error(`❌ Page ${page} error:`, e.message);
                break;
            }
        }
    }

    console.log(`\n📊 Total: ${orderMap.size} unique orders`);
    return Array.from(orderMap.values());
}

// Helper to get detailed order info (including products) from MISA
async function getMisaOrderDetail(idOrName, isUuid = false) {
    if (!cachedToken) await loginMisa();
    if (!cachedToken) return null;

    try {
        let url;
        if (isUuid) {
            // Direct fetch by UUID: https://crmconnect.misa.vn/api/v2/SaleOrders/{id}
            url = `${MISA_ORDERS_URL}/${idOrName}`;
        } else {
            // Search by Order No using specific /code endpoint (Works for Drafts!)
            const filterVal = encodeURIComponent(idOrName);
            url = `${MISA_ORDERS_URL}/code?code=${filterVal}`;
        }

        const response = await fetchWithTimeout(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cachedToken}`,
                'Clientid': process.env.MISA_CLIENT_ID
            }
        });

        const json = await response.json();
        console.log(`DEBUG: MISA Detail Response for ${idOrName}:`, JSON.stringify(json).substring(0, 500));

        // MISA might return { Success: true, Data: {...} } OR direct object depending on endpoint?
        // Usually /v2/SaleOrders/{id} returns the object directly or Data wrapped.

        const success = json.Success !== false; // Sometimes implicit
        const data = json.Data || json.data || json; // Handle direct object return

        if (success && data) {
            // If fetching by UUID, data might be the object itself
            if (isUuid) return data;

            // If fetching by /code, data is Array
            if (Array.isArray(data) && data.length > 0) {
                // Find exact match just in case (though /code seems precise)
                const detail = data.find(d =>
                    d.sale_order_no === idOrName ||
                    d.SaleOrderNo === idOrName
                );

                if (!detail) {
                    console.warn(`⚠️ Mismatch! Requested ${idOrName}. /code returned items but none matched.`);
                    return null;
                }
                return detail;
            }
        }
        return null;
    } catch (e) {
        console.error('❌ MISA Detail Fetch Error:', e.message);
        return null;
    }
}

export const syncMisaOrders = async () => {
    if (isSyncing) {
        console.log('⚠️ Sync already in progress. Skipping...');
        return;
    }

    isSyncing = true;
    console.log('🔄 Starting MISA Sync...');

    try {
        // ... (existing logic continues in try block)
    } catch (e) {
        console.error('❌ MISA Sync Fatal Error:', e.message);
    } finally {
        isSyncing = false;
    }
};

// Internal actual sync logic to keep it clean
const performSync = async () => {
    // 1. Get Orders from MISA
    const misaOrders = await getMisaOrders();
    if (!misaOrders.length) {
        console.log('ℹ️ No orders found from MISA.');
        return;
    }

    // 2. Get Existing Orders from DB to check for duplicates
    // Optimization: In a huge DB we wouldn't fetch all, but for now it matches the n8n logic
    // We can optimize by fetching IDs only if possible, or simple cache. 
    // Since db.getOrders() returns all, we use it.
    const dbOrders = await db.getOrders();
    const existingIds = new Set(dbOrders.map(o => o.soDon || o.id));

    let newCount = 0;

    // 3. Process Orders
    for (const item of misaOrders) {
        // Normalize Keys
        const saleOrderNo = item.sale_order_no || item.SaleOrderNo;

        // Fix: item.id is Integer (useless for API). item.sale_order_id might be UUID.
        // Only use if it looks like a UUID.
        let rawId = item.sale_order_id || item.SaleOrderId || item.id;
        const saleOrderId = (typeof rawId === 'string' && rawId.length > 30) ? rawId : null;

        if (!saleOrderNo) continue;

        // Debug First Item to check keys
        if (newCount === 0) {
            console.log('🔍 Sample MISA Item Keys:', Object.keys(item));
            console.log('   sale_order_id (mapped):', saleOrderId);
            console.log('   list_product:', JSON.stringify(item.list_product || [], null, 2));
        }

        let shouldFetchDetail = false;

        if (!existingIds.has(saleOrderNo)) {
            // New Order
            shouldFetchDetail = true;
            newCount++;
        } else {
            // Existing Order: Check if it has products. If not, update it.
            const existingOrder = dbOrders.find(o => o.id === saleOrderNo || o.soDon === saleOrderNo);

            // Calculate Status from MISA Item (List View)
            const newStatus = mapMisaStatus(item);

            if (existingOrder) {
                // 1. Missing Data Check
                const hasProducts = existingOrder.products && existingOrder.products.length > 0;
                const hasZeroQty = hasProducts && existingOrder.products.some(p => p.qty === 0);
                const hasMisaId = !!existingOrder.misa_id;

                // 2. Status Change Check (Optimize: Only update if different and local is 'Mới')
                const statusChanged = existingOrder.status !== newStatus && existingOrder.status === 'Mới';

                if (!hasProducts || hasZeroQty || statusChanged || !hasMisaId) {
                    // console.log(`♻️ Updating ${saleOrderNo} (Diff detected)...`);
                    shouldFetchDetail = true;
                }
            }
        }

        if (!shouldFetchDetail) continue;

        // Fetch full details
        let detail = null;
        let products = [];
        let shippingAddress = item.shipping_address || item.description || '';

        // OPTIMIZATION: Check if List Item already has Product Mappings (It usually does!)
        if (item.sale_order_product_mappings && item.sale_order_product_mappings.length > 0) {
            // console.log(`⚡ Using List Data for ${saleOrderNo}`); // Debug
            products = item.sale_order_product_mappings.map(p => ({
                code: p.product_code,
                // User Request: Name from Description if Product Name missing
                name: p.product_name || p.description || p.product_code,
                // User Request: Correct Quantity (usage_unit_amount is Physical Qty)
                qty: Number(p.usage_unit_amount || p.amount || 0),
                unit: p.unit || ''
            }));
            // If address is missing in List item, we might still want Detail? 
            // Usually List has shipping_address too.
        }
        else {
            // ... Fallback paths ...

            // 1. Try Fetch Detail (UUID)
            if (saleOrderId) {
                detail = await getMisaOrderDetail(saleOrderId, true);
            } else {
                // Fallback to Filter
                detail = await getMisaOrderDetail(saleOrderNo, false);
            }

            if (detail && detail.sale_order_no === saleOrderNo) {
                // Success: Map from Detail
                products = (detail.sale_order_product_mappings || []).map(p => ({
                    code: p.product_code,
                    name: p.product_name || p.description || p.product_code,
                    qty: Number(p.amount || 0),
                    unit: p.unit || ''
                }));
                shippingAddress = detail.shipping_address || detail.description || '';
            } else {
                // 2. FAILSAFE: Use list_product string (Quantity will be 0)
                const productCodes = (item.list_product || '').split(',').map(s => s.trim()).filter(s => s);

                if (productCodes.length > 0) {
                    console.log(`⚠️ Using List Fallback (String) for ${saleOrderNo}: ${productCodes.join(', ')}`);
                    const localMaterials = await db.getMaterials();
                    products = productCodes.map(code => {
                        const mat = localMaterials.find(m => m.code === code);
                        return {
                            code: code,
                            name: mat ? mat.name : code,
                            qty: 0, // Unknown
                            unit: mat ? mat.unit : ''
                        };
                    });
                } else {
                    console.log(`⚠️ Skip ${saleOrderNo} (No Products found)`);
                    continue;
                }
            }
        }

        // Pass RAW MISA data directly - addOrder will map to Supabase columns
        const mappedOrder = {
            ...item,  // All MISA fields including delivery_status
            id: saleOrderNo,
            misa_id: item.id, // Store Numeric MISA ID for reliable updates
            status: mapMisaStatus(item),
            delivery_status: item.delivery_status || 'Chưa giao hàng', // Preserve MISA delivery_status
            sale_order_product_mappings: products,  // Products array
        };

        if (existingIds.has(saleOrderNo)) {
            // Preserve Local Fields (Driver, Status, Note)
            const oldOrder = dbOrders.find(o => o.soDon === saleOrderNo);
            if (oldOrder) {
                if (oldOrder.taiXe) mappedOrder.taiXe = oldOrder.taiXe;
                if (oldOrder.bienSo) mappedOrder.bienSo = oldOrder.bienSo;
                if (oldOrder.note) mappedOrder.note = oldOrder.note;

                // Only allow MISA to update status if local is 'Mới', otherwise keep local status
                // (Unless we implement a specific status mapping from MISA)
                if (oldOrder.status !== 'Mới') {
                    mappedOrder.status = oldOrder.status;
                }
            }
            await db.updateOrder(saleOrderNo, mappedOrder);
        } else {
            mappedOrder.createdAt = new Date().toISOString();
            await db.addOrder(mappedOrder);

            // Send Telegram notification for new orders
            const money = (mappedOrder.sale_order_amount || 0).toLocaleString('vi-VN');
            const productsList = (mappedOrder.sale_order_product_mappings || [])
                .map(p => `- ${p.name}: ${p.qty} ${p.unit}`)
                .join('\n');

            let msg = `🆕 <b>ĐƠN HÀNG MỚI TỪ MISA</b>\n`;
            msg += `📦 Mã: <b>${saleOrderNo}</b>\n`;
            msg += `📅 Ngày: ${item.sale_order_date || 'N/A'}\n`;
            msg += `👤 Khách: ${item.account_name || 'N/A'}\n`;
            msg += `💰 Tổng: <b>${money} VNĐ</b>\n`;
            msg += `📍 Địa chỉ: ${mappedOrder.shipping_address || 'N/A'}\n`;

            if (productsList) {
                msg += `\n📋 <b>Sản phẩm:</b>\n${productsList}\n`;
            }

            msg += `\n🔔 @sales (Vào Điều Phối gán tài xế)`;

            await sendTelegramMessage(msg);
        }

        console.log(`✅ Synced/Updated Order: ${saleOrderNo}`);
    }

    console.log(`✨ Sync Complete. New Orders: ${newCount}`);
};

// ============================================================
// MISA MAPPINGS (FROM N8N)
// ============================================================
const STOCK_MAPPING = {
    "HH": "HH",
    "TP": "TP",
    "K1": "KHO_1",
    "LT1": "LT1",
    "Kho hàng hóa": "KHO_HANG_HOA"
};

// Helper to map MISA status to local status (now using same values!)
// MISA Status Text: "Chưa thực hiện", "Đang thực hiện", "Đã thực hiện", "Đã hủy bỏ"
function mapMisaStatus(item) {
    // 1. Priority: Check delivery_status field
    const dStatus = (item.delivery_status || '').toLowerCase();
    if (dStatus.includes('đã giao') || dStatus.includes('delivered') || dStatus.includes('hoàn thành')) {
        return 'Đã thực hiện';
    }
    if (dStatus.includes('đang giao') || dStatus.includes('shipping')) {
        return 'Đang thực hiện';
    }

    // 2. If status is already a MISA text value, return it directly
    const statusText = String(item.status || '').trim();
    if (['Chưa thực hiện', 'Đang thực hiện', 'Đã thực hiện', 'Đã hủy bỏ'].includes(statusText)) {
        return statusText;
    }

    // 3. Fallback for numeric status (legacy)
    const oStatus = Number(item.status);
    switch (oStatus) {
        case 1: return 'Chưa thực hiện';
        case 2: return 'Đang thực hiện';
        case 3: return 'Đã thực hiện';
        case 4: return 'Đã hủy bỏ';
        default: return 'Chưa thực hiện';
    }
}

const DEFAULT_STOCK = "HH";

const UNIT_MAPPING = {
    "kg": "kg", "Kg": "kg", "KG": "kg",
    "cái": "cái", "Cái": "cái",
    "lit": "lít", "lít": "lít"
};

export const updateMisaOrder = async (orderId, updateData) => {
    if (!orderId) return;
    if (!cachedToken) await loginMisa();

    console.log(`📡 Pushing update to MISA for Order ${orderId}...`);
    console.log('📋 Update Data:', JSON.stringify(updateData, null, 2));

    try {
        // 1. Fetch Original Order to get Prices & Original Data
        console.log(`📡 Fetching detail for MISA Order: ${orderId}...`);
        const originalOrder = await getMisaOrderDetail(orderId);

        if (!originalOrder) {
            console.warn(`⚠️ Warning: Could not fetch original order detail for ${orderId}. Proceeding with updateData values only.`);
        }

        const originalProducts = originalOrder?.sale_order_product_mappings || [];
        console.log(`DEBUG: Original Products Count: ${originalProducts.length}`);

        // Create Price Map: ProductCode -> Original Item Data
        const originalItemMap = {};
        originalProducts.forEach(p => {
            originalItemMap[p.product_code] = p;
        });

        // Pre-fetch materials from Local DB for NEW items fallback
        const allMaterials = await db.getMaterials();
        const localPriceMap = {};
        allMaterials.forEach(m => {
            if (m.code) localPriceMap[m.code] = Number(m.salePrice || m.price || 0);
        });

        // 2. Map Status to MISA TEXT values (MISA uses text, not numeric!)
        // MISA Status Text: "Chưa thực hiện", "Đang thực hiện", "Đã thực hiện", "Đã hủy bỏ"
        let misaStatus = originalOrder?.status || 'Chưa thực hiện'; // Keep original if not specified
        if (updateData.status) {
            const statusMap = {
                'Chưa thực hiện': 'Chưa thực hiện',
                'Đang thực hiện': 'Đang thực hiện',
                'Đã thực hiện': 'Đã thực hiện',
                'Đã hủy bỏ': 'Đã hủy bỏ',
                'Mới': 'Chưa thực hiện',
                'Chờ giao': 'Đang thực hiện',
                'Đang giao': 'Đang thực hiện',
                'Đang giao hàng': 'Đang thực hiện',
                'Hoàn thành': 'Đã thực hiện',
                'Đã giao hàng': 'Đã thực hiện',
                'WAITING': 'Chưa thực hiện',
                'DELIVERING': 'Đang thực hiện',
                'DELIVERED': 'Đã thực hiện',
                'COMPLETED': 'Đã thực hiện',
                'CANCELLED': 'Đã hủy bỏ'
            };
            misaStatus = statusMap[updateData.status] || misaStatus;
        }

        // If delivery_status indicates completion, set status accordingly
        if (updateData.delivery_status === 'Đã giao hàng') {
            misaStatus = 'Đã thực hiện';
        } else if (updateData.delivery_status === 'Đang giao hàng' || updateData.delivery_status === 'Shipping') {
            misaStatus = 'Đang thực hiện';
        }

        // 3. Prepare Product List with Correct Calculations
        let mappedProducts = [];
        let orderTotalAmount = 0;
        let orderTotalDiscount = 0;
        let orderTotalTax = 0;
        let orderGrandTotal = 0;

        if (updateData.cart && Array.isArray(updateData.cart) && updateData.cart.length > 0) {
            mappedProducts = updateData.cart.map(p => {
                // Map Stock & Unit (Force "HH" as per user request to fix MISA category error)
                let stock = "HH";

                let unitInput = String(p.unit || "").trim();
                let unit = UNIT_MAPPING[unitInput] || unitInput || "kg";

                // Get Product Code
                const pCode = p.product_code || p.code || p.id || "";

                // Lookup Original Item for prices and tax rates
                const originalItem = originalItemMap[pCode] || {};

                // Get Price - Priority: Update Data > Original Order > Local DB
                let price = 0;
                if (p.price && Number(p.price) > 0) price = Number(p.price);
                else if (originalItem.price && Number(originalItem.price) > 0) price = Number(originalItem.price);

                // Fallback: If price is STILL 0 (e.g. original order data was damaged/cleared), lookup local DB
                if (price === 0 && localPriceMap[pCode]) {
                    price = localPriceMap[pCode];
                }

                // Get Quantity - from update data
                const qty = Number(p.weight_kg || p.qty || p.amount || 0);

                // Get Tax & Discount rates from original (default to 0 if missing)
                const discountPercent = Number(p.discount_percent || originalItem.discount_percent || 0);

                // Handle tax percent: MISA requires strict string format matching category (e.g. "0%", "8%")
                let taxPercentVal = 0; // Numeric value for calculation
                let taxPercentStr = originalItem.tax_percent; // String value for API payload

                const rawTax = p.tax_percent || originalItem.tax_percent;
                if (rawTax !== undefined && rawTax !== null) {
                    if (typeof rawTax === 'string') {
                        taxPercentVal = Number(rawTax.replace('%', ''));
                        taxPercentStr = rawTax;
                    } else {
                        taxPercentVal = Number(rawTax);
                        taxPercentStr = `${taxPercentVal}%`;
                    }
                }

                // Default to "0%" if still missing to avoid validation error
                if (!taxPercentStr) {
                    taxPercentStr = "0%";
                    taxPercentVal = 0;
                }

                // === FINANCIAL CALCULATIONS ===
                // to_currency = price * qty (Value before discount/tax)
                const toCurrency = Math.round(price * qty);

                // discount = to_currency * discount_percent / 100
                const discountAmt = Math.round(toCurrency * discountPercent / 100);

                // amount_after_discount = to_currency - discount
                const amountAfterDiscount = toCurrency - discountAmt;

                // tax = amount_after_discount * tax_percent / 100
                const taxAmt = Math.round(amountAfterDiscount * taxPercentVal / 100);

                // total = amount_after_discount + tax (Grand total for this line)
                const totalAmt = amountAfterDiscount + taxAmt;

                // Accumulate for order totals
                orderTotalAmount += toCurrency;
                orderTotalDiscount += discountAmt;
                orderTotalTax += taxAmt;
                orderGrandTotal += totalAmt;

                return {
                    "product_code": pCode,
                    "stock_name": stock,
                    "unit": unit,
                    "amount": qty,
                    "price": price,
                    // VND Fields
                    "to_currency": toCurrency,
                    "discount": discountAmt,
                    "discount_percent": discountPercent,
                    "tax_percent": taxPercentStr, // Send correctly formatted string
                    "tax": taxAmt,
                    "total": totalAmt,
                    // OC (Original Currency) fields - identical for VND
                    "to_currency_oc": toCurrency,
                    "discount_oc": discountAmt,
                    "tax_oc": taxAmt,
                    "total_oc": totalAmt,
                    // Usage unit fields
                    "usage_unit": unit,
                    "usage_unit_amount": qty,
                    // Description/Note
                    "description": p.note || p.description || originalItem.description || ""
                };
            });
        }

        // 4. Construct MISA Payload
        const payload = {
            "sale_order_no": updateData.sale_order_no || orderId,
            "form_layout": originalOrder?.form_layout || "Mẫu tiêu chuẩn", // Mandatory field
            "status": misaStatus,
            "description": updateData.description || originalOrder?.description || undefined
        };

        // IF we have the internal numeric ID, MISA prefers it for PUT
        if (updateData.misa_id || originalOrder?.id) {
            payload["id"] = Number(updateData.misa_id || originalOrder.id);
        }

        // Delivery Status
        if (updateData.delivery_status) {
            payload["delivery_status"] = updateData.delivery_status;
        }

        // Driver & Plate (Custom Fields)
        if (updateData.driver) {
            payload["custom_field13"] = updateData.driver;
        }
        if (updateData.plate) {
            payload["custom_field14"] = updateData.plate;
        }

        // Shipping Address
        if (updateData.shipping_address) {
            payload["shipping_address"] = updateData.shipping_address;
        }

        // Products & Order Totals
        if (mappedProducts.length > 0) {
            payload["sale_order_product_mappings"] = mappedProducts;

            // Order-level totals (calculated from products)
            // Use original order amount as fallback if calculated total is 0
            const finalAmount = orderGrandTotal > 0 ? orderGrandTotal : (originalOrder?.sale_order_amount || orderTotalAmount);

            payload["sale_order_amount"] = finalAmount;
            payload["total_summary"] = orderTotalAmount || originalOrder?.total_summary || finalAmount;
            payload["discount_summary"] = orderTotalDiscount;
            payload["tax_summary"] = orderTotalTax || originalOrder?.tax_summary || 0;
            payload["to_currency_summary"] = (orderTotalAmount - orderTotalDiscount) || finalAmount;

            // OC (Original Currency) summaries
            payload["total_summary_oc"] = orderTotalAmount || finalAmount;
            payload["discount_summary_oc"] = orderTotalDiscount;
            payload["tax_summary_oc"] = orderTotalTax || 0;
            payload["to_currency_summary_oc"] = (orderTotalAmount - orderTotalDiscount) || finalAmount;
            payload["sale_order_amount_oc"] = finalAmount;
        } else {
            // No products, but still must provide sale_order_amount
            payload["sale_order_amount"] = originalOrder?.sale_order_amount || 0;
        }

        console.log('📝 MISA Payload:', JSON.stringify(payload, null, 2));

        // 5. Send PUT Request
        const response = await fetchWithTimeout(MISA_ORDERS_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cachedToken}`,
                'Clientid': process.env.MISA_CLIENT_ID
            },
            body: JSON.stringify([payload])
        }, 12000); // Slightly longer for updates (12s)

        if (response.status === 401) {
            console.warn('⚠️ MISA Token Expired (401). Resetting...');
            cachedToken = null;
            return { success: false, message: 'Token hết hạn, vui lòng thử lại', code: 'UNAUTHORIZED' };
        }

        const json = await response.json();
        console.log(`DEBUG: MISA PUT Response for ${orderId}:`, JSON.stringify(json));
        const success = json.Success || json.success;

        if (success) {
            console.log(`✅ MISA Updated Successfully: ${orderId}`);
            return { success: true, message: 'Cập nhật MISA thành công' };
        } else {
            const errorDetail = json.Data || json.Message || JSON.stringify(json);
            console.error(`❌ MISA Update Failed:`, errorDetail);
            // Check for specific rejection that might be 401 wrapped in 200
            if (String(errorDetail).includes('Unauthorized') || String(errorDetail).includes('expired')) {
                cachedToken = null;
            }
            return { success: false, message: `MISA từ chối: ${errorDetail}`, code: 'REJECTED' };
        }

    } catch (e) {
        console.error('❌ MISA Update Exception:', e.message);
        return { success: false, message: `Lỗi kết nối MISA: ${e.message}` };
    }
};
