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

// Dedup: Track orders we've already sent Telegram notifications for
// Prevents spam when addOrder fails silently and sync re-detects as 'new'
const notifiedNewOrders = new Map(); // orderNo -> timestamp

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

// Fetch all products from MISA and sync to DB (batch upsert for performance)
export const syncMisaProducts = async () => {
    console.log('🔄 Starting MISA Product Sync...');
    if (!await ensureToken()) {
        console.error('❌ MISA Product Sync: No token available (login failed)');
        return { success: false, error: 'MISA login failed', synced: 0 };
    }

    let page = 0;
    let hasMore = true;
    const allProducts = []; // Collect all products first

    try {
        const pageSize = 100;

        // Phase 1: Fetch ALL products from MISA
        while (hasMore) {
            const url = `${MISA_PRODUCTS_URL}?pageSize=${pageSize}&page=${page}`;
            console.log(`📡 Fetching MISA Products page ${page}...`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cachedToken}`,
                    'Clientid': process.env.MISA_CLIENT_ID
                }
            });

            const json = await response.json();
            const success = json.success;
            const data = json.data || [];

            console.log(`📦 MISA Products page ${page}: ${data?.length || 0} items`);

            if (success && Array.isArray(data) && data.length > 0) {
                for (const p of data) {
                    allProducts.push({
                        id: p.product_code,
                        code: p.product_code,
                        name: p.product_name,
                        unit: p.usage_unit || '',
                        price: Number(p.unit_price || 0),
                        saleprice: Number(p.unit_price || 0),
                        category: p.product_category || 'MISA CRM',
                        description: p.description || p.sale_description || ''
                    });
                }

                if (data.length >= pageSize) {
                    page++;
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`📦 Total products fetched from MISA: ${allProducts.length}`);

        if (allProducts.length === 0) {
            return { success: true, synced: 0, saved: 0, failed: 0, errors: [] };
        }

        // Phase 2: Batch upsert to Supabase (reuse existing client — avoid connection leak)
        const { supabase } = await import('../db/supabase.js');
        if (!supabase) {
            console.error('❌ Supabase client not available for product sync');
            return { success: false, error: 'Supabase not initialized', synced: allProducts.length };
        }

        // Supabase upsert supports batch — process in chunks of 500 to avoid payload limits
        const CHUNK_SIZE = 500;
        let saveSuccess = 0;
        let saveFailed = 0;
        const errors = [];

        for (let i = 0; i < allProducts.length; i += CHUNK_SIZE) {
            const chunk = allProducts.slice(i, i + CHUNK_SIZE);
            console.log(`💾 Upserting chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.length} products...`);

            const { data, error } = await supabase
                .from('materials')
                .upsert(chunk, { onConflict: 'id' });

            if (error) {
                console.error(`❌ Batch upsert error:`, error.message);
                saveFailed += chunk.length;
                errors.push({ chunk: Math.floor(i / CHUNK_SIZE), error: error.message });
            } else {
                saveSuccess += chunk.length;
            }
        }

        console.log(`✅ MISA Product Sync: ${allProducts.length} fetched, ${saveSuccess} saved, ${saveFailed} failed`);
        return { success: true, synced: allProducts.length, saved: saveSuccess, failed: saveFailed, errors };
    } catch (e) {
        console.error('❌ MISA Product Sync Error:', e.message);
        return { success: false, error: e.message, synced: allProducts.length };
    }
};

// Token management: track when token was obtained
let tokenObtainedAt = 0;
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // Force re-login every 4 hours

async function ensureToken() {
    // Force re-login if token is older than TTL
    if (cachedToken && (Date.now() - tokenObtainedAt > TOKEN_TTL_MS)) {
        console.log('🔑 Token expired (>4h), re-authenticating...');
        cachedToken = null;
    }
    if (!cachedToken) {
        await loginMisa();
        if (cachedToken) tokenObtainedAt = Date.now();
    }
    return !!cachedToken;
}

export async function getMisaOrders(retryCount = 0, fullSync = true) {
    if (!await ensureToken()) return [];

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cachedToken}`,
        'Clientid': process.env.MISA_CLIENT_ID
    };

    const orderMap = new Map();
    const PAGE_SIZE = 1000;

    // PRIORITY 1: Fetch newest orders (no Page param = realtime data)
    try {
        console.log(`📡 [REALTIME] Fetching newest orders...`);
        const url = `${MISA_ORDERS_URL}?PageSize=${PAGE_SIZE}`;
        const response = await fetch(url, { method: 'GET', headers });

        // Handle 401: token expired on MISA side
        if (response.status === 401 && retryCount < 1) {
            console.warn('🔑 MISA returned 401, re-authenticating...');
            cachedToken = null;
            return getMisaOrders(retryCount + 1, fullSync);
        }

        if (response.ok) {
            const json = await response.json();
            const data = json.Data || json.data || [];
            data.forEach(order => orderMap.set(order.sale_order_no, order));
            console.log(`   ✅ Got ${data.length} newest orders`);
        } else {
            console.error(`❌ MISA API error: ${response.status} ${response.statusText}`);
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
                const url = `${MISA_ORDERS_URL}?PageSize=${PAGE_SIZE}&Page=${page}`;
                const response = await fetch(url, { method: 'GET', headers });

                if (!response.ok) break;

                const json = await response.json();
                const data = json.Data || json.data || [];
                if (data.length === 0) break;

                const before = orderMap.size;
                data.forEach(order => orderMap.set(order.sale_order_no, order));
                console.log(`   + ${data.length} orders, ${orderMap.size - before} new`);

                if (data.length < PAGE_SIZE) break; // Fixed: was < 100, should be < PAGE_SIZE
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
    if (!await ensureToken()) return null;

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

// Track sync start time for stale lock detection
let syncStartTime = 0;
const SYNC_TIMEOUT_MS = 60_000;      // 60s max for a single sync cycle
const STALE_LOCK_MS = 5 * 60_000;    // 5 min = definitely stuck

export const syncMisaOrders = async () => {
    // STALE LOCK RECOVERY: If sync has been "running" for > 5 min, force reset
    if (isSyncing && syncStartTime > 0 && (Date.now() - syncStartTime > STALE_LOCK_MS)) {
        console.error(`🔓 Force-resetting stale sync lock (stuck for ${Math.round((Date.now() - syncStartTime) / 1000)}s)`);
        isSyncing = false;
    }

    if (isSyncing) {
        console.log('⚠️ Sync already in progress. Skipping...');
        return;
    }

    isSyncing = true;
    syncStartTime = Date.now();
    console.log('🔄 Starting MISA Sync...');

    try {
        // TIMEOUT: Prevent performSync from hanging forever
        await Promise.race([
            performSync(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Sync timeout (60s)')), SYNC_TIMEOUT_MS)
            )
        ]);
    } catch (e) {
        console.error('❌ MISA Sync Fatal Error:', e.message);
    } finally {
        isSyncing = false;
        syncStartTime = 0;
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
    // Include deleted orders so we can compare against MISA for sync
    let dbOrders = [];
    try {
        dbOrders = await db.getOrders(true); // true = includeDeleted
    } catch (dbErr) {
        console.error('❌ CRITICAL: Cannot fetch DB orders for sync:', dbErr.message);
        console.error('🚫 ABORTING SYNC to prevent data corruption');
        return;
    }

    // SAFEGUARD: If DB returns 0 orders but MISA has many, something is wrong
    // Skip sync to prevent treating all existing orders as "new"
    if (dbOrders.length === 0 && misaOrders.length > 5) {
        console.error(`🚫 SAFEGUARD: DB returned 0 orders but MISA has ${misaOrders.length}. Skipping sync to prevent data corruption.`);
        return;
    }

    const existingIds = new Set(dbOrders.map(o => o.soDon || o.id));

    let newCount = 0;
    const newOrdersInBatch = []; // Flood guard: track new orders for summary notification

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
            console.log('   description:', item.description || item.Description || '(EMPTY)');
            console.log('   owner_name:', item.owner_name || item.OwnerName || item.ownerName || '(EMPTY)');
            console.log('   mobile/phone:', item.mobile || item.phone || item.receiver_mobile || item.contact_mobile || '(EMPTY)');
        }

        let shouldFetchDetail = false;

        // Calculate Status from MISA Item (used in both new/existing paths)
        const newStatus = mapMisaStatus(item);

        if (!existingIds.has(saleOrderNo)) {
            // New Order
            shouldFetchDetail = true;
            newCount++;
        } else {
            // Existing Order: Check if it has products. If not, update it.
            const existingOrder = dbOrders.find(o => o.id === saleOrderNo || o.soDon === saleOrderNo);

            if (existingOrder) {
                // 1. Missing Data Check
                const hasProducts = existingOrder.products && existingOrder.products.length > 0;
                const hasZeroQty = hasProducts && existingOrder.products.some(p => p.qty === 0);
                const hasMisaId = !!existingOrder.misa_id;

                // 2. Check if products are missing price data (force update to get prices)
                const hasMissingPrice = hasProducts && existingOrder.products.some(p =>
                    (p.price === undefined || p.price === null || p.price === 0) &&
                    (p.total === undefined || p.total === null || p.total === 0)
                );

                // 3. Status Change Check (Optimize: Only update if different and local is 'Mới')
                const statusChanged = existingOrder.status !== newStatus && existingOrder.status === 'Mới';

                // 4. Check if owner_name (creator_name) is missing - need to populate from MISA
                const hasOwnerName = !!existingOrder.creator_name || !!existingOrder.owner_name;
                const misaHasOwnerName = !!(item.owner_name || item.OwnerName);

                // 5. Check if description (misa_note) has changed - continuous sync
                const localDescription = existingOrder.misa_note || existingOrder.description || '';
                const misaDescription = item.description || item.Description || '';
                const descriptionChanged = misaDescription && misaDescription !== localDescription;

                // 6. Check if date has changed on MISA (e.g. delivery date correction)
                const misaDate = (item.sale_order_date || '').split('T')[0];
                const localDate = (existingOrder.ngay || existingOrder.sale_order_date || '').split('T')[0];
                const dateChanged = misaDate && localDate && misaDate !== localDate;

                // 7. Check if products spec/note/qty/name changed on MISA
                let specNoteChanged = false;
                let qtyChanged = false;
                let productNameChanged = false;
                const misaProducts = item.sale_order_product_mappings || [];
                if (hasProducts && misaProducts.length > 0) {
                    for (const localP of existingOrder.products) {
                        const misaP = misaProducts.find(mp => mp.product_code === localP.code);
                        if (misaP) {
                            const misaSpec = misaP.custom_field7 || '';
                            const misaNote = misaP.description_product || '';
                            if ((localP.spec || '') !== misaSpec || (localP.note || '') !== misaNote) {
                                specNoteChanged = true;
                            }
                            // Detect product name change from MISA (e.g. Sales corrected product name)
                            const misaName = misaP.product_name || misaP.description || '';
                            const localName = localP.name || '';
                            if (misaName && localName && misaName !== localName) {
                                productNameChanged = true;
                                console.log(`📝 Product name changed for ${saleOrderNo}: "${localName}" → "${misaName}"`);
                            }
                            // Detect qty change from MISA (e.g. Sales corrected quantity)
                            const misaQty = Number(misaP.amount || 0);
                            const localQty = Number(localP.qty || 0);
                            if (misaQty > 0 && localQty > 0 && Math.abs(misaQty - localQty) > 0.01) {
                                qtyChanged = true;
                                console.log(`📦 Qty changed for ${saleOrderNo}: ${localP.code} ${localQty} → ${misaQty}`);
                            }
                        }
                    }
                    // Also detect if MISA has different number of products
                    if (misaProducts.length !== existingOrder.products.length) {
                        qtyChanged = true;
                        console.log(`📦 Product count changed for ${saleOrderNo}: ${existingOrder.products.length} → ${misaProducts.length}`);
                    }
                }
                // ALSO detect if MISA has MORE products than local (even if hasProducts is false)
                if (misaProducts.length > 0 && (!hasProducts || misaProducts.length !== (existingOrder.products || []).length)) {
                    if (!qtyChanged) {
                        qtyChanged = true;
                        console.log(`📦 Product count mismatch for ${saleOrderNo}: local=${(existingOrder.products || []).length} vs MISA=${misaProducts.length}`);
                    }
                }
                const hasMissingSpec = hasProducts && existingOrder.products.some(p => !p.spec);

                // 8. Check if address changed on MISA (continuous sync)
                const misaAddress = item.shipping_address || '';
                const localAddress = existingOrder.diaChi || existingOrder.shipping_address || '';
                const addressChanged = misaAddress && misaAddress !== localAddress;

                // 9. Check if phone changed on MISA (continuous sync)
                const misaPhone = item.mobile || item.receiver_mobile || item.contact_mobile || item.phone || '';
                const localPhone = existingOrder.phone || existingOrder.mobile || existingOrder.receiver_mobile || '';
                const phoneChanged = misaPhone && misaPhone !== localPhone;

                // 10. Check if contact_name changed on MISA (continuous sync)
                const misaContact = item.contact_name || item.ContactName || '';
                const localContact = existingOrder.contact_name || '';
                const contactChanged = misaContact && misaContact !== localContact;

                // 11. Check if account_name (customer) changed
                const misaCustomer = item.account_name || '';
                const localCustomer = existingOrder.khach || existingOrder.account_name || '';
                const customerChanged = misaCustomer && misaCustomer !== localCustomer;

                if (!hasProducts || hasZeroQty || statusChanged || !hasMisaId || hasMissingPrice || (!hasOwnerName && misaHasOwnerName) || descriptionChanged || dateChanged || hasMissingSpec || specNoteChanged || qtyChanged || productNameChanged || addressChanged || phoneChanged || contactChanged || customerChanged) {
                    if (hasMissingPrice) console.log(`💰 Updating ${saleOrderNo} (Missing price data)...`);
                    if (!hasOwnerName && misaHasOwnerName) console.log(`👤 Updating ${saleOrderNo} (Missing owner_name)...`);
                    if (descriptionChanged) console.log(`📝 Updating ${saleOrderNo} (Description changed on MISA)`);
                    if (dateChanged) console.log(`📅 Updating ${saleOrderNo} (Date changed: ${localDate} → ${misaDate})`);
                    if (specNoteChanged) console.log(`📋 Updating ${saleOrderNo} (Product spec/note changed on MISA)`);
                    if (qtyChanged) console.log(`📦 Updating ${saleOrderNo} (Product qty changed on MISA)`);
                    if (productNameChanged) console.log(`🏷️ Updating ${saleOrderNo} (Product name changed on MISA)`);
                    if (addressChanged) console.log(`📍 Updating ${saleOrderNo} (Address changed on MISA)`);
                    if (phoneChanged) console.log(`📞 Updating ${saleOrderNo} (Phone changed on MISA)`);
                    if (contactChanged) console.log(`👤 Updating ${saleOrderNo} (Contact changed on MISA)`);
                    if (customerChanged) console.log(`🏢 Updating ${saleOrderNo} (Customer changed on MISA)`);
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
                name: p.product_name || p.description || p.product_code,
                note: p.description_product || '',  // Mô tả từ MISA
                spec: p.custom_field7 || '',  // Quy cách từ MISA
                qty: Number(p.amount || 0),
                unit: p.unit || '',
                price: Number(p.price || 0),
                total: Number(p.total || p.to_currency || 0)
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
                    note: p.description_product || '',  // Mô tả từ MISA
                    spec: p.custom_field7 || '',  // Quy cách từ MISA
                    qty: Number(p.amount || 0),
                    unit: p.unit || '',
                    price: Number(p.price || 0),
                    total: Number(p.total || p.to_currency || 0)
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
            // Explicitly map description & owner_name (MISA may return camelCase or snake_case)
            description: item.description || item.Description || '',
            owner_name: item.owner_name || item.OwnerName || item.ownerName || '',
            // Explicitly map phone/mobile (MISA sends 'mobile', DB expects 'phone')
            phone: item.mobile || item.receiver_mobile || item.contact_mobile || item.phone || '',
        };

        if (existingIds.has(saleOrderNo)) {
            // Preserve Local Fields (Driver, Status, Note, Merged Trip, etc.)
            const oldOrder = dbOrders.find(o => o.soDon === saleOrderNo);
            if (oldOrder) {
                // Only preserve driver/dispatch fields for orders already dispatched
                // AND where MISA hasn't reset the order back to 'Mới' (cancelled & recreated)
                const isDispatched = oldOrder.status !== 'Mới' && newStatus !== 'Mới';
                if (isDispatched) {
                    // Preserve driver/plate/assistant from local DB (MISA doesn't own these)
                    if (oldOrder.taiXe) mappedOrder.taiXe = oldOrder.taiXe;
                    if (oldOrder.bienSo) mappedOrder.bienSo = oldOrder.bienSo;

                    // Preserve assistant, delivery time
                    if (oldOrder.assistant_name || oldOrder.phuXe) mappedOrder.assistant_name = oldOrder.assistant_name || oldOrder.phuXe;
                    if (oldOrder.delivery_time || oldOrder.thoiGianGiao) mappedOrder.delivery_time = oldOrder.delivery_time || oldOrder.thoiGianGiao;
                }

                // Always preserve notes & merged order (regardless of status)
                if (oldOrder.note) mappedOrder.note = oldOrder.note;
                if (oldOrder.merged_order_no) mappedOrder.merged_order_no = oldOrder.merged_order_no;
                if (oldOrder.delivery_note) mappedOrder.delivery_note = oldOrder.delivery_note;

                // CRITICAL: Remove raw MISA custom_field13/14 from mappedOrder 
                // to prevent them from overriding the preserved taiXe/bienSo values.
                // PROTECT LOCAL DATA: Never let MISA downgrade status or overwrite local operational fields
                const LOCAL_PROTECTED_FIELDS = ['status', 'delivery_status', 'custom_field13', 'custom_field14',
                    'assistant_name', 'delivery_time', 'merged_order_no', 'telegram_message_id',
                    'sale_confirmed', 'sale_confirmed_at', 'sale_confirmed_by',
                    'admin_approved', 'admin_approved_at', 'admin_approved_by',
                    'delivery_note', 'local_items', 'is_pinned'];

                if (oldOrder.status !== 'Mới') {
                    // Order is in-progress/completed locally — protect ALL local fields
                    for (const field of LOCAL_PROTECTED_FIELDS) {
                        delete mappedOrder[field];
                    }
                    console.log(`🛡️ Protected local fields for ${saleOrderNo} (status: ${oldOrder.status})`);
                } else {
                    // Order is still 'Mới' — only protect driver/plate from stale MISA data
                    delete mappedOrder.custom_field13;
                    delete mappedOrder.custom_field14;
                }

                // PRESERVE local product quantities for completed/dispatched orders
                // After driver completion, local qty reflects ACTUAL delivery — never overwrite with MISA original qty
                const completedStatuses = ['Đã thực hiện', 'Hoàn thành', 'PENDING_APPROVAL'];
                if (completedStatuses.includes(oldOrder.status)) {
                    // Order is completed — ALWAYS keep local products (actual delivery)
                    mappedOrder.sale_order_product_mappings = oldOrder.products;
                    console.log(`🔒 Keeping local products for ${saleOrderNo} (order completed, preserving actual delivery qty)`);
                } else if (oldOrder.status !== 'Mới' && oldOrder.products && oldOrder.products.length > 0) {
                    const misaProds = item.sale_order_product_mappings || [];
                    let misaProductsChanged = false;
                    if (misaProds.length !== oldOrder.products.length) {
                        misaProductsChanged = true;
                    } else {
                        for (const localP of oldOrder.products) {
                            const misaP = misaProds.find(mp => mp.product_code === localP.code);
                            if (misaP) {
                                // Check qty change
                                const misaQty = Number(misaP.amount || 0);
                                const localQty = Number(localP.qty || 0);
                                if (misaQty > 0 && Math.abs(misaQty - localQty) > 0.01) {
                                    misaProductsChanged = true;
                                    break;
                                }
                                // Check name change
                                const misaName = misaP.product_name || misaP.description || '';
                                const localName = localP.name || '';
                                if (misaName && localName && misaName !== localName) {
                                    misaProductsChanged = true;
                                    break;
                                }
                                // Check spec/note change
                                if ((misaP.custom_field7 || '') !== (localP.spec || '') ||
                                    (misaP.description_product || '') !== (localP.note || '')) {
                                    misaProductsChanged = true;
                                    break;
                                }
                                // Check price change
                                const misaPrice = Number(misaP.price || 0);
                                const localPrice = Number(localP.price || 0);
                                if (misaPrice > 0 && Math.abs(misaPrice - localPrice) > 0.01) {
                                    misaProductsChanged = true;
                                    break;
                                }
                            } else {
                                // Product code not found in MISA → products changed
                                misaProductsChanged = true;
                                break;
                            }
                        }
                    }
                    if (!misaProductsChanged) {
                        // MISA products same as local → keep local (preserves local edits)
                        mappedOrder.sale_order_product_mappings = oldOrder.products;
                        console.log(`🔒 Keeping local products for ${saleOrderNo} (no MISA change detected)`);
                    } else {
                        // MISA products changed → use MISA data (only for non-completed orders)
                        console.log(`📦 MISA products changed for ${saleOrderNo} — using MISA data (${misaProds.length} items, local had ${oldOrder.products.length})`);
                    }
                }


                // Detect ALL field changes from MISA → send consolidated Telegram notification
                const changes = [];
                const oldDate = oldOrder.ngay || oldOrder.sale_order_date;
                const newDate = item.sale_order_date;
                if (oldDate && newDate && oldDate.split('T')[0] !== newDate.split('T')[0]) {
                    const fmtOld = new Date(oldDate).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                    const fmtNew = new Date(newDate).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                    changes.push(`📅 Ngày giao: ${fmtOld} → ${fmtNew}`);
                }

                const oldAddr = oldOrder.diaChi || oldOrder.shipping_address || '';
                const newAddr = item.shipping_address || '';
                if (newAddr && newAddr !== oldAddr) {
                    changes.push(`📍 Địa chỉ: ${oldAddr || '(trống)'} → ${newAddr}`);
                }

                const oldPhone = oldOrder.phone || oldOrder.mobile || '';
                const newPhone = item.mobile || item.receiver_mobile || item.phone || '';
                if (newPhone && newPhone !== oldPhone) {
                    changes.push(`📞 SĐT: ${oldPhone || '(trống)'} → ${newPhone}`);
                }

                const oldContact = oldOrder.contact_name || '';
                const newContact = item.contact_name || '';
                if (newContact && newContact !== oldContact) {
                    changes.push(`👤 Liên hệ: ${oldContact || '(trống)'} → ${newContact}`);
                }

                const oldCustomer = oldOrder.khach || oldOrder.account_name || '';
                const newCustomer = item.account_name || '';
                if (newCustomer && newCustomer !== oldCustomer) {
                    changes.push(`🏢 KH: ${oldCustomer} → ${newCustomer}`);
                }

                const oldDesc = oldOrder.misa_note || oldOrder.description || '';
                const newDesc = item.description || item.Description || '';
                if (newDesc && newDesc !== oldDesc) {
                    changes.push(`📝 Ghi chú: ${newDesc}`);
                }

                // Product changes
                const misaProdsForCheck = item.sale_order_product_mappings || [];
                if (misaProdsForCheck.length > 0 && oldOrder.products) {
                    for (const mp of misaProdsForCheck) {
                        const lp = oldOrder.products.find(p => p.code === mp.product_code);
                        if (lp) {
                            // Check name change
                            const mName = mp.product_name || mp.description || '';
                            const lName = lp.name || '';
                            if (mName && lName && mName !== lName) {
                                changes.push(`🏷️ SP: "${lName}" → "${mName}"`);
                            }
                            // Check qty change
                            const mQty = Number(mp.amount || 0);
                            const lQty = Number(lp.qty || 0);
                            if (mQty > 0 && Math.abs(mQty - lQty) > 0.01) {
                                changes.push(`📦 ${lp.name || lp.code}: ${lQty.toLocaleString('vi-VN')} → ${mQty.toLocaleString('vi-VN')} ${lp.unit || 'Kg'}`);
                            }
                        } else {
                            changes.push(`📦 + ${mp.product_name || mp.product_code}: ${Number(mp.amount || 0).toLocaleString('vi-VN')} ${mp.unit || 'Kg'}`);
                        }
                    }
                }

                if (changes.length > 0) {
                    // Only send Telegram notification for orders NOT yet dispatched/completed
                    // (Completed orders have qty diffs from actual delivery — no need to notify)
                    const localStatus = oldOrder.status || '';
                    const shouldNotify = ['Mới', 'Chưa thực hiện'].includes(localStatus);

                    if (shouldNotify) {
                        let changeMsg = `🔄 <b>CẬP NHẬT ĐƠN HÀNG TỪ MISA</b>\n`;
                        changeMsg += `📦 Mã: <b>#${saleOrderNo}</b>\n`;
                        changeMsg += `👤 KH: <b>${item.account_name || oldOrder.khach || 'N/A'}</b>\n`;
                        changeMsg += `<blockquote>${changes.join('\n')}</blockquote>`;
                        console.log(`📢 Sending change notification for ${saleOrderNo}: ${changes.length} changes`);
                        sendTelegramMessage(changeMsg, 'NOTIFY', oldOrder.telegram_message_id || null)
                            .then(() => console.log(`✅ Change notification sent for ${saleOrderNo}`))
                            .catch(err => console.error(`❌ Change notification FAILED for ${saleOrderNo}:`, err.message));
                    } else {
                        console.log(`🔇 Skipping change notification for ${saleOrderNo} (status: ${localStatus})`);
                    }
                }
            }
            await db.updateOrder(saleOrderNo, mappedOrder);
        } else {
            // NEW ORDER: Clear driver/plate from MISA to prevent stale data
            // (When sales copies an old order in MISA, custom_field13/14 carry over)
            delete mappedOrder.custom_field13;
            delete mappedOrder.custom_field14;

            // DEDUP: Skip if already notified in this process lifecycle
            if (notifiedNewOrders.has(saleOrderNo)) {
                console.log(`⏭️ Skipping ${saleOrderNo} — already notified`);
                newCount++;
                continue;
            }

            // Mark as notified BEFORE addOrder + Telegram to prevent any race
            notifiedNewOrders.set(saleOrderNo, Date.now());
            existingIds.add(saleOrderNo); // prevent in-batch duplicates

            mappedOrder.createdAt = new Date().toISOString();
            const addResult = await db.addOrder(mappedOrder);

            // DB-LEVEL DEDUP: If upsert returned a record that already has a telegram_message_id,
            // it was already notified in a previous server lifecycle — skip notification
            if (addResult && addResult.telegram_message_id) {
                console.log(`⏭️ Skipping notification for ${saleOrderNo} — already has telegram_message_id`);
                newCount++;
                continue;
            }

            // TIME-BASED GUARD: Skip notification for orders created > 2 hours ago on MISA
            // (Prevents re-notifying old orders after server restart)
            if (item.created_date) {
                const orderCreatedMs = new Date(item.created_date).getTime();
                const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
                if (orderCreatedMs < twoHoursAgo) {
                    console.log(`⏭️ Skipping notification for ${saleOrderNo} — created ${item.created_date} (older than 2h)`);
                    newCount++;
                    continue;
                }
            }

            // Auto-clean dedup map: remove entries older than 24 hours
            for (const [key, ts] of notifiedNewOrders) {
                if (Date.now() - ts > 24 * 60 * 60 * 1000) notifiedNewOrders.delete(key);
            }

            // FLOOD GUARD: If too many new orders in one batch, collect for summary instead
            const FLOOD_THRESHOLD = 5;
            newOrdersInBatch.push({ saleOrderNo, account_name: item.account_name, shipping_address: mappedOrder.shipping_address });

            if (newOrdersInBatch.length > FLOOD_THRESHOLD) {
                // Too many new orders — skip individual notification, will send summary later
                console.log(`⚠️ Flood guard: skipping individual notification for ${saleOrderNo} (${newOrdersInBatch.length} new orders in batch)`);
            } else {
                // Normal: send individual Telegram notification
                const productsList = (mappedOrder.sale_order_product_mappings || [])
                    .map(p => `- ${p.name}: ${Number(p.qty).toLocaleString('en-US')} ${p.unit}`)
                    .join('\n');

                let formattedDate = 'N/A';
                if (item.sale_order_date) {
                    try {
                        formattedDate = new Date(item.sale_order_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                    } catch (e) {
                        formattedDate = item.sale_order_date.split('T')[0];
                    }
                }

                let msg = `🟩 <b>XUẤT MISA</b>\n`;
                msg += `📦 <b>#${saleOrderNo}</b>\n`;
                msg += `📅 ${formattedDate}\n`;
                msg += `👤 <b>${item.account_name || 'N/A'}</b>\n`;

                if (productsList) {
                    msg += `📦 ${(mappedOrder.sale_order_product_mappings || []).map(p => `${p.name} — ${Number(p.qty).toLocaleString('vi-VN')} ${p.unit}`).join(', ')}\n`;
                }

                msg += `📍 ${mappedOrder.shipping_address || 'N/A'}\n`;
                if (mappedOrder.description) msg += `📝 ${mappedOrder.description}\n`;

                const tgMsgId = await sendTelegramMessage(msg, 'NOTIFY');

                if (tgMsgId) {
                    try {
                        await db.updateOrder(saleOrderNo, { telegram_message_id: tgMsgId });
                    } catch (e) { /* ignore */ }
                }
            }

            // Create in-app notification for ADMIN
            try {
                const { createNotification } = await import('../routes/notifications.js');
                await createNotification(
                    'ADMIN',
                    'misa_new_order',
                    '📦 Đơn hàng mới từ MISA',
                    `Đơn #${saleOrderNo} - ${item.account_name || 'Khách hàng'}`,
                    saleOrderNo,
                    saleOrderNo
                );
            } catch (notifyErr) {
                console.error('In-app notification error:', notifyErr.message);
            }
        }

        console.log(`✅ Synced/Updated Order: ${saleOrderNo}`);
    }

    // ============================================
    // CLEANUP: Delete orders removed from MISA
    // ============================================
    // After sync, check DB orders that weren't in MISA results.
    // Verify each via MISA /code endpoint before deleting to avoid
    // false positives from MISA API pagination limits.
    try {
        const misaSyncedNos = new Set(misaOrders.map(o => o.sale_order_no || o.SaleOrderNo).filter(Boolean));

        // Find DB orders from MISA (have misa_id) that are NOT completed/cancelled
        // and were NOT in this sync batch
        const candidatesForDeletion = dbOrders.filter(o => {
            const orderNo = o.soDon || o.id;
            const hasMisaOrigin = !!o.misa_id;
            const isActive = !['Đã thực hiện', 'completed', 'COMPLETED', 'Hoàn thành', 'Đã hủy bỏ'].includes(o.status);
            const notInMisa = !misaSyncedNos.has(orderNo);
            return hasMisaOrigin && isActive && notInMisa;
        });

        if (candidatesForDeletion.length > 0) {
            console.log(`🔍 Checking ${candidatesForDeletion.length} DB orders not found in MISA sync...`);

            for (const candidate of candidatesForDeletion) {
                const orderNo = candidate.soDon || candidate.id;
                try {
                    // Verify with MISA API - does this order still exist?
                    const misaCheck = await getMisaOrderDetail(orderNo, false);

                    if (!misaCheck) {
                        // MISA confirms: order doesn't exist → delete from DB
                        console.log(`🗑️ Order ${orderNo} deleted from MISA → removing from DB`);
                        await db.deleteOrder(orderNo);

                        // Notify via Telegram
                        const customerName = candidate.khach || candidate.account_name || 'N/A';
                        let delMsg = `🗑️ <b>ĐƠN HÀNG ĐÃ XÓA TRÊN MISA</b>\n`;
                        delMsg += `📦 Mã: <b>#${orderNo}</b>\n`;
                        delMsg += `👤 KH: ${customerName}\n`;
                        delMsg += `⚠️ Đơn đã bị xóa khỏi CRM và database`;
                        await sendTelegramMessage(delMsg, 'NOTIFY', candidate.telegram_message_id || null);
                    } else {
                        console.log(`✅ Order ${orderNo} still exists in MISA (not in sync page)`);
                    }

                    // Rate limit: 200ms between API calls
                    await new Promise(r => setTimeout(r, 200));
                } catch (checkErr) {
                    console.error(`⚠️ Error checking ${orderNo}:`, checkErr.message);
                }
            }
        }
    } catch (cleanupErr) {
        console.error('⚠️ Cleanup check error:', cleanupErr.message);
    }

    // FLOOD GUARD: Send summary if too many new orders were skipped
    if (newOrdersInBatch.length > 5) {
        try {
            let summaryMsg = `⚠️ <b>ĐỒNG BỘ HÀNG LOẠT MISA</b>\n`;
            summaryMsg += `📦 ${newOrdersInBatch.length} đơn mới được đồng bộ\n`;
            summaryMsg += `(Chỉ ${5} đơn đầu được thông báo riêng)\n\n`;
            // List the ones that were skipped (after first 5)
            const skipped = newOrdersInBatch.slice(5, 20); // Show max 15 skipped
            skipped.forEach(o => {
                summaryMsg += `• #${o.saleOrderNo} — ${o.account_name || 'N/A'}\n`;
            });
            if (newOrdersInBatch.length > 20) {
                summaryMsg += `... và ${newOrdersInBatch.length - 20} đơn khác`;
            }
            await sendTelegramMessage(summaryMsg, 'NOTIFY');
        } catch (e) {
            console.error('Flood summary notification error:', e.message);
        }
    }

    console.log(`✨ Sync Complete. New orders synced: ${newCount}`);
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
    "Cái": "Cái", "cái": "Cái", "cai": "Cái",
    "lit": "Lít", "lít": "Lít", "Lít": "Lít",
    "Can": "Can", "can": "Can",
    "Phuy": "Phuy", "phuy": "Phuy",
    "Tank": "Tank", "tank": "Tank",
    "Tấn": "Tấn", "tấn": "Tấn", "tan": "Tấn",
    "Bộ": "Bộ", "bộ": "Bộ"
};

export const updateMisaOrder = async (orderId, updateData) => {
    if (!orderId) return;
    if (!await ensureToken()) return { success: false, message: 'MISA login failed' };

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
