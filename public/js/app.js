// ===============================================
// LỘC THIÊN ERP - MAIN APP
// ===============================================

// === STATE ===
// === STATE ===
let state = {
    user: null,
    orders: { pending: [], assigned: [], history: [], imports: [], exports: [] },
    drivers: [],
    currentOrderSection: 'xuat', // 'xuat' = MISA orders, 'nhap' = import tickets
    currentOrderTab: 'pending',
    currentWarehouse: 'LT1',
    deliveryCart: [],
    currentDeliveryOrder: null,
    currentReportTab: 'stock',
    orderProducts: [],
    selectedImages: []
};

// ... (skipping unchanged parts)

// === ORDERS ===
async function loadOrders() {
    const container = $('#order-list');
    container.innerHTML = '<div class="loading-spinner mx-auto mt-5"></div>';

    try {
        // Load MISA orders (XUẤT)
        const res = await api.getOrders();
        state.orders.pending = res.pending || [];
        state.orders.assigned = res.assigned || [];
        state.orders.history = res.completed || [];
        state.drivers = res.drivers || [];

        // Load Import tickets (NHẬP)
        await loadImportTickets();

        // Update counts
        updateOrderCounts();

        renderOrderList();

    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

async function loadImportTickets() {
    try {
        const res = await fetch('/api/imports');
        const data = await res.json();
        const imports = data.data || [];

        // Categorize imports by status
        state.orders.imports_pending = imports.filter(t => t.status === 'pending');
        state.orders.imports_assigned = imports.filter(t => t.status === 'assigned' || t.status === 'in_transit');
        state.orders.imports_completed = imports.filter(t => t.status === 'completed');
        state.orders.imports = imports.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
    } catch (e) {
        console.error('Load imports error:', e);
    }
}

function updateOrderCounts() {
    // XUẤT counts (MISA orders)
    const totalXuat = state.orders.pending.length + state.orders.assigned.length;
    if ($('#countXuat')) $('#countXuat').textContent = totalXuat;
    if ($('#countPending')) $('#countPending').textContent = state.orders.pending.length;
    if ($('#countAssigned')) $('#countAssigned').textContent = state.orders.assigned.length;
    if ($('#countHistory')) $('#countHistory').textContent = state.orders.history.length;

    // NHẬP counts (Import tickets)
    const totalNhap = (state.orders.imports_pending?.length || 0) + (state.orders.imports_assigned?.length || 0);
    if ($('#countNhap')) $('#countNhap').textContent = totalNhap;
}

function switchOrderSection(section) {
    state.currentOrderSection = section;

    // Update section buttons
    const btnXuat = $('#section-xuat');
    const btnNhap = $('#section-nhap');

    if (section === 'xuat') {
        btnXuat.className = 'btn flex-fill btn-primary position-relative';
        btnNhap.className = 'btn flex-fill btn-outline-success position-relative';
        state.currentOrderTab = 'pending';
        renderXuatTabs();
    } else {
        btnXuat.className = 'btn flex-fill btn-outline-primary position-relative';
        btnNhap.className = 'btn flex-fill btn-success position-relative';
        state.currentOrderTab = 'imports_pending';
        renderNhapTabs();
    }

    renderOrderList();
}

function renderXuatTabs() {
    const container = $('#order-tabs-container');
    container.innerHTML = `
        <button class="btn btn-sm flex-fill btn-warning" id="tab-pending" onclick="switchOrderTab('pending')">
            Chờ gán <span class="badge bg-dark" id="countPending">${state.orders.pending.length}</span>
        </button>
        <button class="btn btn-sm flex-fill btn-outline-primary" id="tab-assigned" onclick="switchOrderTab('assigned')">
            Đang giao <span class="badge bg-primary" id="countAssigned">${state.orders.assigned.length}</span>
        </button>
        <button class="btn btn-sm flex-fill btn-outline-secondary" id="tab-history" onclick="switchOrderTab('history')">
            Hoàn thành <span class="badge bg-secondary" id="countHistory">${state.orders.history.length}</span>
        </button>
    `;
}

function renderNhapTabs() {
    const container = $('#order-tabs-container');
    container.innerHTML = `
        <button class="btn btn-sm flex-fill btn-warning" id="tab-imports_pending" onclick="switchOrderTab('imports_pending')">
            Chờ gán <span class="badge bg-dark" id="countImportsPending">${state.orders.imports_pending?.length || 0}</span>
        </button>
        <button class="btn btn-sm flex-fill btn-outline-primary" id="tab-imports_assigned" onclick="switchOrderTab('imports_assigned')">
            Đang nhận <span class="badge bg-primary" id="countImportsAssigned">${state.orders.imports_assigned?.length || 0}</span>
        </button>
        <button class="btn btn-sm flex-fill btn-outline-secondary" id="tab-imports_completed" onclick="switchOrderTab('imports_completed')">
            Hoàn thành <span class="badge bg-secondary" id="countImportsCompleted">${state.orders.imports_completed?.length || 0}</span>
        </button>
    `;
}


// === DOM HELPERS ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const show = (id) => {
    const el = typeof id === 'string' ? $(`#${id}`) : id;
    if (el) el.classList.remove('hidden');
};

const hide = (id) => {
    const el = typeof id === 'string' ? $(`#${id}`) : id;
    if (el) el.classList.add('hidden');
};

const showLoading = (text = 'Đang xử lý...') => {
    $('#load-txt').textContent = text;
    show('loading');
};

const hideLoading = () => hide('loading');

// === VIEW MANAGEMENT ===
const views = ['view-login', 'view-home', 'view-orders', 'view-create-order', 'view-hr', 'view-materials', 'view-warehouse', 'view-reports', 'view-driver-orders', 'view-imports'];

function showView(viewId) {
    views.forEach(v => hide(v));
    show(viewId);

    // Load data for specific views
    if (viewId === 'view-orders') loadOrders();
    if (viewId === 'view-hr') loadEmployees();
    if (viewId === 'view-materials') loadMaterials();
    if (viewId === 'view-warehouse') loadWarehouse();
    if (viewId === 'view-reports') loadReports();
    if (viewId === 'view-create-order') initCreateOrder();
    if (viewId === 'view-imports') loadImports();
}

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    const session = localStorage.getItem('LT_SESSION');
    if (session) {
        try {
            state = { ...state, ...JSON.parse(session) };
            // FIX: Ensure structure exists if restoring from old session
            if (!state.orders) state.orders = { pending: [], assigned: [], history: [] };
            if (!state.orders.history) state.orders.history = [];

            if (state.user) {
                initApp();
                return;
            }
        } catch (e) { }
    }
    showView('view-login');
});

// === AUTH ===
async function handleLogin() {
    const username = $('#inp-user').value.trim();
    const password = $('#inp-pass').value.trim();

    if (!username || !password) {
        alert('Vui lòng nhập đủ thông tin!');
        return;
    }

    showLoading('Đang đăng nhập...');

    try {
        const res = await api.login(username, password);
        hideLoading();

        if (res.error) {
            alert(res.msg);
            return;
        }

        state.user = res.user;
        state.staff = res.staffList || [];
        state.trucks = res.truckList || [];
        state.customers = res.customerList || [];
        state.suppliers = res.supplierList || [];
        state.drivers = res.drivers || [];

        localStorage.setItem('LT_SESSION', JSON.stringify(state));
        initApp();

    } catch (e) {
        hideLoading();
        alert('Lỗi kết nối: ' + e.message);
    }
}

function doLogout() {
    localStorage.removeItem('LT_SESSION');
    location.reload();
}

function initApp() {
    $('#txt-user-name').textContent = state.user.name;
    $('#txt-user-role').textContent = state.user.role;

    hide('area-admin');
    hide('area-driver');
    hide('dashboard-stats');

    if (['ADMIN', 'TESTER', 'MANAGER'].includes(state.user.role)) {
        show('area-admin');
        show('area-driver');
        show('dashboard-stats');
        loadDashboard();
    } else if (state.user.role === 'DRIVER') {
        show('area-driver');
    }

    showView('view-home');
}

async function loadDashboard() {
    try {
        const res = await api.getDashboard();
        if (!res.error && res.data) {
            $('#stat-pending').textContent = res.data.pendingOrders || 0;
            $('#stat-stock').textContent = Math.round((res.data.totalStock || 0) / 1000);
        }
    } catch (e) { }
}




function switchOrderTab(tab) {
    state.currentOrderTab = tab;

    // Update button active states
    const container = $('#order-tabs-container');
    const buttons = container.querySelectorAll('button');

    buttons.forEach(btn => {
        const isActive = btn.id === `tab-${tab}`;
        // Reset to outline style, then make active one solid
        if (btn.id.includes('pending') || btn.id.includes('imports_pending')) {
            btn.className = isActive ? 'btn btn-sm flex-fill btn-warning' : 'btn btn-sm flex-fill btn-outline-warning';
        } else if (btn.id.includes('assigned') || btn.id.includes('imports_assigned')) {
            btn.className = isActive ? 'btn btn-sm flex-fill btn-primary' : 'btn btn-sm flex-fill btn-outline-primary';
        } else {
            btn.className = isActive ? 'btn btn-sm flex-fill btn-secondary' : 'btn btn-sm flex-fill btn-outline-secondary';
        }
    });

    renderOrderList();
}

function searchOrders(keyword) {
    state.searchTerm = keyword.toLowerCase().trim();
    renderOrderList();
}

// Helper to format date dd/mm/yyyy
function formatDateVN(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('en-GB');
    } catch (e) {
        return dateStr;
    }
}

function filterOrdersByDate() {
    // Parse dd/mm/yyyy manually since inputs are now text
    const parseVN = (str) => {
        if (!str) return null;
        const [d, m, y] = str.split('/');
        return new Date(`${y}-${m}-${d}`);
    };

    const dFrom = $('#filter-date-from').value;
    const dTo = $('#filter-date-to').value;

    state.dateFrom = parseVN(dFrom);
    state.dateTo = parseVN(dTo);

    // Reset time to start/end of day
    if (state.dateFrom) state.dateFrom.setHours(0, 0, 0, 0);
    if (state.dateTo) state.dateTo.setHours(23, 59, 59, 999);

    renderOrderList();
}

function clearDateFilter() {
    // Clear Flatpickr if instance exists (optional, or just clear input)
    const fpFrom = document.querySelector('#filter-date-from')._flatpickr;
    const fpTo = document.querySelector('#filter-date-to')._flatpickr;
    if (fpFrom) fpFrom.clear();
    if (fpTo) fpTo.clear();

    state.dateFrom = null;
    state.dateTo = null;
    renderOrderList();
}

// Initialize Flatpickr
function initDatePickers() {
    flatpickr(".date-picker", {
        dateFormat: "d/m/Y",
        locale: "vn",
        allowInput: true,
        onChange: function (selectedDates, dateStr, instance) {
            filterOrdersByDate();
        }
    });
}

// Call init after DOM load (or immediately if script is deferred)
document.addEventListener('DOMContentLoaded', initDatePickers);

function renderOrderList() {
    let list = state.orders[state.currentOrderTab];

    // 1. Filter by search term
    if (state.searchTerm && list) {
        list = list.filter(o =>
            (o.soDon && o.soDon.toLowerCase().includes(state.searchTerm)) ||
            (o.khach && o.khach.toLowerCase().includes(state.searchTerm)) ||
            (o.diaChi && o.diaChi.toLowerCase().includes(state.searchTerm)) ||
            (formatDateVN(o.ngay).includes(state.searchTerm)) // Search by DD/MM/YYYY
        );
    }

    // 2. Filter by Date Range (Using CRM 'ngay' field)
    if ((state.dateFrom || state.dateTo) && list) {
        list = list.filter(o => {
            const dateStr = o.ngay || o.createdAt; // Fallback to createdAt if ngay missing
            if (!dateStr) return false;

            const orderDate = new Date(dateStr);
            // Normalize orderDate to midnight for fair comparison if it includes time
            orderDate.setHours(0, 0, 0, 0);

            if (state.dateFrom && orderDate < state.dateFrom) return false;
            if (state.dateTo && orderDate > state.dateTo) return false;
            return true;
        });
    }

    // 3. Sort by Date (Newest First), then by Order Number (Descending)
    if (list && Array.isArray(list)) {
        list.sort((a, b) => {
            // Primary: Sort by date descending
            const dA = a.ngay ? new Date(a.ngay) : new Date(0);
            const dB = b.ngay ? new Date(b.ngay) : new Date(0);
            const dateDiff = dB - dA;

            if (dateDiff !== 0) return dateDiff;

            // Secondary: Sort by order number descending (extract numeric part)
            const numA = parseInt((a.soDon || '').replace(/\D/g, '') || '0');
            const numB = parseInt((b.soDon || '').replace(/\D/g, '') || '0');
            return numB - numA;
        });
    }

    console.log(`RENDER [${state.currentOrderTab}]:`, list ? list.length : 'NULL');
    const container = $('#order-list');

    // Handle special tabs (import tickets in NHẬP section)
    if (state.currentOrderTab.startsWith('imports_')) {
        const importList = state.orders[state.currentOrderTab] || [];
        renderImportTickets(container, importList);
        return;
    }

    if (!list || !list.length) {
        container.innerHTML = '<div class="empty-state"><i class="bi bi-box-seam"></i><div>Không tìm thấy đơn hàng</div></div>';
        return;
    }

    // const driverOptions = ... (Moved into loop)

    container.innerHTML = list.map(order => {
        let statusBadge = '';
        let statusClass = 'bg-secondary';
        if (state.currentOrderTab === 'pending') {
            statusBadge = 'Chờ gán';
            statusClass = 'bg-warning text-dark';
        }
        if (state.currentOrderTab === 'assigned') {
            statusBadge = 'Đang giao';
            statusClass = 'bg-primary';
        }
        if (state.currentOrderTab === 'history') {
            statusBadge = order.status || 'Hoàn thành';
            statusClass = (order.status === 'Đã thực hiện' || order.status === 'Đã giao hàng') ? 'bg-success' : 'bg-secondary';
        }

        // Minimal card - just essential info
        const productCount = Array.isArray(order.products) ? order.products.length : 0;
        const driverInfo = order.taiXe ? `<span class="badge bg-info text-dark"><i class="bi bi-truck"></i> ${order.taiXe}</span>` : '';

        return `
      <div class="order-card p-2 mb-2 border rounded shadow-sm bg-white" onclick="openOrderDetail('${order.id}')">
        <div class="d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-2">
                <span class="badge bg-light text-dark border small">#${order.soDon}</span>
                <span class="badge ${statusClass} small">${statusBadge}</span>
                ${driverInfo}
            </div>
            <span class="small text-muted">${formatDateVN(order.ngay)}</span>
        </div>
        <div class="mt-1">
            <span class="fw-bold text-primary small">${order.khach}</span>
            <span class="text-muted small ms-2">(${productCount} SP)</span>
        </div>
      </div>
    `;
    }).join('');
}

function openOrderDetail(id) {
    // Find order in all tabs including history
    const order = state.orders.pending.find(o => o.id === id)
        || state.orders.assigned.find(o => o.id === id)
        || state.orders.history.find(o => o.id === id);
    if (!order) return;

    // Store current order ID for modal actions
    window.currentModalOrderId = id;

    // Determine order state
    const isPending = state.orders.pending.some(o => o.id === id);
    const isAssigned = state.orders.assigned.some(o => o.id === id);
    const isHistory = state.orders.history.some(o => o.id === id);

    // Populate Header
    document.getElementById('modalOrderTitle').textContent = `#${order.soDon} - ${order.khach}`;

    // Populate Fields
    document.getElementById('modalCustomerName').textContent = order.khach;
    document.getElementById('modalAddress').textContent = order.diaChi || 'Không có địa chỉ';

    // Driver Info
    document.getElementById('modalDriver').textContent = order.taiXe || 'Chưa gán';
    document.getElementById('modalPlate').textContent = order.bienSo || '---';
    document.getElementById('modalNote').textContent = order.note || '';

    // Products
    const list = document.getElementById('modalProductList');
    list.innerHTML = (order.products || []).map(p => `
        <tr>
            <td><span class="badge bg-secondary">${p.code || '-'}</span></td>
            <td>${p.name}</td>
            <td class="text-end fw-bold">${p.qty}</td>
            <td>${p.unit}</td>
        </tr>
    `).join('');

    // Driver Assignment Section - Show for pending/assigned orders
    const assignSection = document.getElementById('modalAssignSection');
    if (isPending || isAssigned) {
        assignSection.classList.remove('d-none');

        // Populate driver dropdown
        const select = document.getElementById('modal_drv_select');
        let foundDriver = false;
        const drvOptionsHTML = state.drivers.map(d => {
            const val = `${d.name}|${d.plate}`;
            const isSelected = (order.taiXe === d.name);
            if (isSelected) foundDriver = true;
            return `<option value="${val}" ${isSelected ? 'selected' : ''}>${d.name} - ${d.plate}</option>`;
        }).join('');

        const isExternal = !foundDriver && order.taiXe;
        select.innerHTML = `
            <option value="">-- Chọn tài xế --</option>
            ${drvOptionsHTML}
            <option value="EXTERNAL" ${isExternal ? 'selected' : ''}>Xe Ngoài (Nhập tay)</option>
        `;

        // Set external driver values if applicable
        if (isExternal) {
            document.getElementById('modal_ext_drv').classList.remove('d-none');
            document.getElementById('modal_ext_name').value = order.taiXe || '';
            document.getElementById('modal_ext_plate').value = order.bienSo || '';
        } else {
            document.getElementById('modal_ext_drv').classList.add('d-none');
        }

        document.getElementById('modal_note').value = order.note || '';

        // Initialize multi-driver assignments
        initDriverAssignments(order);
    } else {
        assignSection.classList.add('d-none');
    }

    // Footer Actions
    const footer = document.getElementById('modalFooter');
    let actionBtns = '';
    const role = (state.user.role || '').toUpperCase();

    if (isHistory) {
        actionBtns = `
            <button class="btn btn-outline-primary btn-sm" onclick="openDeliveryModal('${order.id}')">
                <i class="bi bi-pencil-square me-1"></i>Xem lại / Sửa
            </button>
        `;
    } else if (role === 'ADMIN' || role === 'TESTER' || role === 'MANAGER') {
        actionBtns = `
            <button class="btn btn-success btn-sm" onclick="openDeliveryModal('${order.id}')">
                <i class="bi bi-check-circle me-1"></i>Hoàn thành
            </button>
        `;
    }

    footer.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Đóng</button>
        ${actionBtns}
    `;

    const modal = new bootstrap.Modal(document.getElementById('orderDetailModal'));
    modal.show();

    // Load chat for this order
    loadOrderChat(order.id);
    startChatRefresh();

    // Stop refresh when modal closes
    document.getElementById('orderDetailModal').addEventListener('hidden.bs.modal', stopChatRefresh, { once: true });
}

function toggleModalExternalDriver() {
    const val = document.getElementById('modal_drv_select').value;
    const extArea = document.getElementById('modal_ext_drv');
    if (val === 'EXTERNAL') {
        extArea.classList.remove('d-none');
    } else {
        extArea.classList.add('d-none');
    }
}

async function assignOrderFromModal(id) {
    const sel = document.getElementById('modal_drv_select');
    let name, plate;

    if (sel.value === 'EXTERNAL') {
        name = document.getElementById('modal_ext_name').value.trim();
        plate = document.getElementById('modal_ext_plate').value.trim();
        if (!name || !plate) {
            alert('Vui lòng nhập Tên và Biển số xe ngoài!');
            return;
        }
    } else if (sel.value) {
        [name, plate] = sel.value.split('|');
    } else {
        alert('Vui lòng chọn tài xế!');
        return;
    }

    const note = document.getElementById('modal_note').value.trim();

    showLoading();

    try {
        const res = await api.assignOrder(id, name, plate || '', note);
        hideLoading();
        alert(res.msg);

        // Close modal and refresh
        const modalEl = document.getElementById('orderDetailModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        loadOrders();
    } catch (e) {
        hideLoading();
        alert(e.message);
    }
}

// ===============================================
// MULTI-DRIVER ASSIGNMENT
// ===============================================

let driverAssignments = [];
let currentOrderTotalQty = 0;

function initDriverAssignments(order) {
    driverAssignments = [];
    currentOrderTotalQty = (order.products || []).reduce((sum, p) => sum + Number(p.qty || 0), 0);

    // If order already has a driver, add as initial assignment
    if (order.taiXe) {
        driverAssignments.push({
            driver_name: order.taiXe,
            plate: order.bienSo || '',
            qty: currentOrderTotalQty,
            type: 'internal',
            note: order.note || ''
        });
    }

    renderDriverAssignments();
    updateQtySummary();
}

function renderDriverAssignments() {
    const container = document.getElementById('driverAssignmentsList');
    if (!container) return;

    if (!driverAssignments.length) {
        container.innerHTML = '<div class="text-muted small text-center py-2">Chưa có tài xế nào</div>';
        return;
    }

    container.innerHTML = driverAssignments.map((a, idx) => `
        <div class="d-flex justify-content-between align-items-center bg-white p-2 rounded border mb-1">
            <div>
                <span class="badge ${a.type === 'external' ? 'bg-secondary' : 'bg-primary'} me-1">${a.type === 'external' ? 'Ngoài' : 'Nội bộ'}</span>
                <span class="fw-bold">${a.driver_name}</span>
                <span class="text-muted small">(${a.plate})</span>
            </div>
            <div class="d-flex align-items-center gap-2">
                <span class="badge bg-success">${a.qty} kg</span>
                <button class="btn btn-sm text-danger p-0" onclick="removeDriverAssignment(${idx})">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function updateQtySummary() {
    const totalAssigned = driverAssignments.reduce((sum, a) => sum + Number(a.qty || 0), 0);
    const remaining = currentOrderTotalQty - totalAssigned;

    document.getElementById('totalCrmQty').textContent = currentOrderTotalQty + ' kg';
    document.getElementById('totalAssignedQty').textContent = totalAssigned + ' kg';
    document.getElementById('remainingQty').textContent = remaining + ' kg';
    document.getElementById('remainingQty').className = remaining === 0 ? 'fw-bold text-success' : 'fw-bold text-danger';
}

function addDriverAssignment() {
    const sel = document.getElementById('modal_drv_select');
    const qtyInput = document.getElementById('modal_drv_qty');
    const qty = Number(qtyInput.value);

    if (!qty || qty <= 0) {
        alert('Nhập số lượng hợp lệ!');
        return;
    }

    let name, plate, type = 'internal';

    if (sel.value === 'EXTERNAL') {
        name = document.getElementById('modal_ext_name').value.trim();
        plate = document.getElementById('modal_ext_plate').value.trim();
        type = 'external';
        if (!name || !plate) {
            alert('Vui lòng nhập Tên và Biển số xe ngoài!');
            return;
        }
    } else if (sel.value) {
        [name, plate] = sel.value.split('|');
    } else {
        alert('Vui lòng chọn tài xế!');
        return;
    }

    const note = document.getElementById('modal_note').value.trim();

    driverAssignments.push({
        driver_name: name,
        plate: plate || '',
        qty: qty,
        type: type,
        note: note
    });

    // Reset form
    sel.value = '';
    qtyInput.value = '';
    document.getElementById('modal_note').value = '';
    document.getElementById('modal_ext_drv').classList.add('d-none');

    renderDriverAssignments();
    updateQtySummary();
}

function removeDriverAssignment(idx) {
    driverAssignments.splice(idx, 1);
    renderDriverAssignments();
    updateQtySummary();
}

async function submitAllDriverAssignments() {
    if (!driverAssignments.length) {
        alert('Chưa có tài xế nào!');
        return;
    }

    const totalAssigned = driverAssignments.reduce((sum, a) => sum + Number(a.qty), 0);
    if (Math.abs(totalAssigned - currentOrderTotalQty) > 0.5) {
        if (!confirm(`Tổng số lượng phân (${totalAssigned} kg) khác tổng CRM (${currentOrderTotalQty} kg). Tiếp tục?`)) {
            return;
        }
    }

    const orderId = window.currentModalOrderId;
    if (!orderId) return;

    showLoading();

    try {
        // Save assignments to database
        const res = await fetch(`/api/orders/${orderId}/assign-multi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignments: driverAssignments })
        });

        const data = await res.json();
        hideLoading();

        if (data.error) {
            alert('Lỗi: ' + data.msg);
        } else {
            alert(data.msg || 'Đã phân công thành công!');

            const modalEl = document.getElementById('orderDetailModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            loadOrders();
        }

    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}

async function adminCompleteOrder(id) {
    if (!confirm('ADMIN: Mở form hoàn thành cho đơn này?')) return;
    openDeliveryModal(id);
}

function toggleExternalDriver(id) {
    const val = document.getElementById(`drv_${id}`).value;
    const extArea = document.getElementById(`ext_drv_${id}`);
    if (val === 'EXTERNAL') {
        extArea.classList.remove('d-none');
    } else {
        extArea.classList.add('d-none');
    }
}

async function assignOrder(id) {
    const sel = document.getElementById(`drv_${id}`);
    let name, plate;

    if (sel.value === 'EXTERNAL') {
        name = document.getElementById(`ext_name_${id}`).value.trim();
        plate = document.getElementById(`ext_plate_${id}`).value.trim();
        if (!name || !plate) {
            alert('Vui lòng nhập Tên và Biển số xe ngoài!');
            return;
        }
    } else if (sel.value) {
        [name, plate] = sel.value.split('|');
    } else {
        alert('Vui lòng chọn tài xế!');
        return;
    }

    const note = document.getElementById(`note_${id}`).value.trim();

    showLoading();

    try {
        const res = await api.assignOrder(id, name, plate || '', note);
        hideLoading();
        alert(res.msg);
        loadOrders();
    } catch (e) {
        hideLoading();
        alert(e.message);
    }
}

// === CREATE ORDER ===
function initCreateOrder() {
    $('#order-date').value = new Date().toISOString().split('T')[0];
    $('#order-customer').value = '';
    $('#order-address').value = '';
    state.orderProducts = [];
    renderOrderProducts();
}

function addOrderProduct() {
    const name = $('#prod-name').value.trim();
    const qty = parseFloat($('#prod-qty').value);

    if (!name || !qty) {
        alert('Nhập đủ thông tin sản phẩm!');
        return;
    }

    state.orderProducts.push({ name, qty, unit: 'Kg' });
    renderOrderProducts();
    $('#prod-name').value = '';
    $('#prod-qty').value = '';
}

function renderOrderProducts() {
    const container = $('#order-products');
    container.innerHTML = state.orderProducts.map((p, i) =>
        `<div class="d-flex justify-content-between align-items-center p-2 bg-light rounded mb-2">
      <span>${p.name}: ${p.qty} ${p.unit}</span>
      <button class="btn btn-sm btn-outline-danger" onclick="removeOrderProduct(${i})">✕</button>
    </div>`
    ).join('');
}

function removeOrderProduct(index) {
    state.orderProducts.splice(index, 1);
    renderOrderProducts();
}

async function submitOrder() {
    if (!state.orderProducts.length) {
        alert('Thêm ít nhất 1 sản phẩm!');
        return;
    }

    showLoading();

    try {
        const res = await api.createOrder({
            date: $('#order-date').value,
            customer: $('#order-customer').value,
            address: $('#order-address').value,
            products: state.orderProducts
        });

        hideLoading();
        alert(res.msg);
        if (!res.error) showView('view-home');

    } catch (e) {
        hideLoading();
        alert(e.message);
    }
}

// === HR ===
async function loadEmployees() {
    const container = $('#hr-list');
    container.innerHTML = '<div class="loading-spinner mx-auto mt-5"></div>';

    try {
        const res = await api.getEmployees();
        if (res.error) throw new Error(res.msg);

        if (!res.data.length) {
            container.innerHTML = '<div class="empty-state"><i class="bi bi-people"></i><div>Chưa có nhân viên</div></div>';
            return;
        }

        container.innerHTML = res.data.map(emp => `
      <div class="list-item">
        <div>
          <h6 class="fw-bold mb-1">${emp.fullName}</h6>
          <div class="small text-muted">${emp.role} ${emp.plate ? '• ' + emp.plate : ''}</div>
        </div>
        <span class="badge ${emp.status === 'ACTIVE' ? 'bg-success' : 'bg-secondary'}">${emp.status}</span>
      </div>
    `).join('');

    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

function toggleAddEmployee() {
    $('#form-add-employee').classList.toggle('hidden');
}

async function addEmployee() {
    const data = {
        fullName: $('#emp-name').value,
        phone: $('#emp-phone').value,
        role: $('#emp-role').value,
        baseSalary: $('#emp-salary').value
    };

    if (!data.fullName || !data.phone) {
        alert('Nhập đủ họ tên và SĐT!');
        return;
    }

    showLoading();

    try {
        const res = await api.addEmployee(data);
        hideLoading();
        alert(res.msg);
        if (!res.error) {
            hide('form-add-employee');
            loadEmployees();
        }
    } catch (e) {
        hideLoading();
        alert(e.message);
    }
}

// === MATERIALS ===
let allMaterials = [];

async function loadMaterials() {
    const container = $('#materials-list');
    container.innerHTML = '<div class="loading-spinner mx-auto mt-5"></div>';

    try {
        const res = await api.getMaterials();
        if (res.error) throw new Error(res.msg);

        allMaterials = res.data || [];
        renderMaterials(allMaterials);

    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

function searchMaterials() {
    const query = $('#mat-search').value.toLowerCase();
    const filtered = allMaterials.filter(m =>
        m.name.toLowerCase().includes(query) ||
        m.code.toLowerCase().includes(query) ||
        (m.casNumber && m.casNumber.includes(query))
    );
    renderMaterials(filtered);
}

function renderMaterials(list) {
    const container = $('#materials-list');

    if (!list.length) {
        container.innerHTML = '<div class="empty-state"><i class="bi bi-box-seam"></i><div>Không tìm thấy vật tư</div></div>';
        return;
    }

    container.innerHTML = list.map(mat => `
    <div class="list-item">
      <div>
        <h6 class="fw-bold mb-1" style="color:#8b5cf6">${mat.name}</h6>
        <div class="small text-muted">${mat.code} ${mat.casNumber ? '• CAS: ' + mat.casNumber : ''}</div>
      </div>
      <div class="text-end">
        <span class="badge bg-light text-dark border">${mat.category}</span>
        <div class="small text-success fw-bold">${mat.salePrice ? mat.salePrice.toLocaleString() + ' đ' : ''}</div>
      </div>
    </div>
  `).join('');
}

function toggleAddMaterial() {
    $('#form-add-material').classList.toggle('hidden');
}

async function addMaterial() {
    const data = {
        name: $('#mat-name').value,
        casNumber: $('#mat-cas').value,
        category: $('#mat-category').value,
        salePrice: $('#mat-price').value
    };

    if (!data.name) {
        alert('Nhập tên vật tư!');
        return;
    }

    showLoading();

    try {
        const res = await api.addMaterial(data);
        hideLoading();
        alert(res.msg);
        if (!res.error) {
            hide('form-add-material');
            loadMaterials();
        }
    } catch (e) {
        hideLoading();
        alert(e.message);
    }
}

// === WAREHOUSE ===
async function loadWarehouse() {
    const container = $('#warehouse-list');
    container.innerHTML = '<div class="loading-spinner mx-auto mt-5"></div>';

    try {
        const [inventoryRes, alertsRes] = await Promise.all([
            api.getInventory(state.currentWarehouse),
            api.getAlerts()
        ]);

        // Render alerts
        if (!alertsRes.error && alertsRes.data && alertsRes.data.length > 0) {
            $('#wh-alerts').innerHTML = `
        <div class="alert alert-warning py-2">
          <strong><i class="bi bi-exclamation-triangle"></i> Cảnh báo:</strong>
          <ul class="mb-0 mt-1">
            ${alertsRes.data.slice(0, 3).map(a => `<li>${a.name}: ${a.qty} Kg</li>`).join('')}
          </ul>
        </div>
      `;
        } else {
            $('#wh-alerts').innerHTML = '';
        }

        // Render inventory
        if (inventoryRes.error) throw new Error(inventoryRes.msg);

        if (!inventoryRes.data.length) {
            container.innerHTML = '<div class="empty-state"><i class="bi bi-building"></i><div>Không có dữ liệu</div></div>';
            return;
        }

        container.innerHTML = inventoryRes.data.map(item => {
            let borderClass = item.status === 'OUT_OF_STOCK' ? 'out' : (item.status === 'LOW' ? 'low' : '');
            let qtyClass = item.qty < 0 ? 'text-danger' : (item.qty < 100 ? 'text-warning' : 'text-success');

            return `
        <div class="inventory-item ${borderClass}">
          <div>
            <h6 class="fw-bold mb-0">${item.name}</h6>
            <div class="small text-muted">${item.warehouse || state.currentWarehouse}</div>
          </div>
          <div class="text-end">
            <div class="fs-5 fw-bold ${qtyClass}">${item.qty.toLocaleString()}</div>
            <div class="small text-muted">Kg</div>
          </div>
        </div>
      `;
        }).join('');

    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

function switchWarehouse(wh) {
    state.currentWarehouse = wh;
    $$('.tab-container .tab-btn').forEach(btn => btn.classList.remove('active'));
    $(`#wh-tab-${wh.toLowerCase() || 'all'}`).classList.add('active');
    loadWarehouse();
}

// === REPORTS ===
async function loadReports() {
    const container = $('#report-content');
    container.innerHTML = '<div class="loading-spinner mx-auto mt-5"></div>';

    try {
        const res = await api.getReportInventory();
        if (res.error) throw new Error(res.msg);

        if (!res.data.length) {
            container.innerHTML = '<div class="empty-state"><i class="bi bi-bar-chart-line"></i><div>Không có dữ liệu</div></div>';
            return;
        }

        container.innerHTML = `
      <div class="card-custom">
        <table class="table table-striped mb-0">
          <thead>
            <tr><th>Tên</th><th class="text-end">Tồn (Kg)</th></tr>
          </thead>
          <tbody>
            ${res.data.map(item => {
            const color = item.qty < 0 ? 'text-danger' : (item.qty < 100 ? 'text-warning' : 'text-success');
            return `<tr><td>${item.name}</td><td class="text-end fw-bold ${color}">${item.qty.toLocaleString()}</td></tr>`;
        }).join('')}
          </tbody>
        </table>
      </div>
    `;

    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

function switchReportTab(tab) {
    state.currentReportTab = tab;
    $$('.tab-container .tab-btn').forEach(btn => btn.classList.remove('active'));
    $(`#rpt-tab-${tab}`).classList.add('active');
    loadReports();
}

// === DRIVER ORDERS ===
async function loadMyOrders() {
    showView('view-driver-orders');
    const container = $('#my-orders-list');
    container.innerHTML = '<div class="loading-spinner mx-auto mt-5"></div>';

    try {
        const res = await api.getMyOrders(state.user.name, state.user.role);
        if (res.error) throw new Error(res.msg);

        // FIX: Save to state so openDeliveryModal can find it
        state.myOrders = res.data || [];

        if (!state.myOrders.length) {
            container.innerHTML = '<div class="empty-state"><i class="bi bi-truck"></i><div>Không có đơn hàng</div></div>';
            return;
        }

        container.innerHTML = state.myOrders.map(order => {
            const btnAction = order.statusCode === 'DANG_GIAO'
                ? `<button class="btn btn-success w-100" onclick="handleCompleteOrder('${order.id}')">HOÀN THÀNH</button>`
                : `<button class="btn btn-primary w-100" onclick="startOrder('${order.id}')">NHẬN ĐƠN</button>`;

            return `
        <div class="order-card">
          <div class="d-flex justify-content-between mb-2">
            <span class="badge bg-light text-dark border">#${order.soDon}</span>
            <span class="small text-secondary">${order.ngay}</span>
          </div>
          <h6 class="fw-bold text-primary mb-1">${order.khach}</h6>
          <div class="text-muted small mb-3"><i class="bi bi-geo-alt me-1"></i>${order.diaChi}</div>
          ${btnAction}
        </div>
      `;
        }).join('');

    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

async function startOrder(id) {
    if (!confirm('Xác nhận nhận đơn này?')) return;

    showLoading();

    try {
        const res = await api.startOrder(id);
        hideLoading();
        alert(res.msg);
        loadMyOrders();
    } catch (e) {
        hideLoading();
        alert(e.message);
    }
}

function handleCompleteOrder(id) {
    if (!confirm('Xác nhận hoàn thành đơn này?')) return;
    openDeliveryModal(id);
}

// === DELIVERY MODAL LOGIC ===

// === DELIVERY MODAL LOGIC ===

function openDeliveryModal(orderId) {
    // Search in all lists (including history)
    const order = state.orders.pending.find(o => o.id === orderId) ||
        state.orders.assigned.find(o => o.id === orderId) ||
        state.orders.history.find(o => o.id === orderId) ||
        (state.myOrders || []).find(o => o.id === orderId);

    if (!order) return console.error("Order not found", orderId);

    state.currentDeliveryOrder = order;

    // Initialize Cart from Order Products
    // Store 'planQty' for reference and 'qty' for editing
    state.deliveryCart = (order.products || []).map(p => ({
        product: p.name,
        code: p.code,
        planQty: p.qty, // Read-only
        qty: p.qty,     // Editable (auto-fill with plan for convenience)
        unit: p.unit,
        density: p.density || 1,
        isShell: false,
        note: ''
    }));

    renderDeliveryCart();

    const isCompleted = order.status === 'Đã thực hiện' || order.status === 'Đã giao hàng';
    $('#del-modal-title').textContent = isCompleted
        ? 'CHỈNH SỬA ĐƠN HÀNG (ĐÃ GIAO)'
        : (order.type === 'IMPORT' ? 'XÁC NHẬN NHẬP KHO' : 'XÁC NHẬN GIAO HÀNG');

    // Update Button Text
    $('#btn-submit-delivery').innerHTML = isCompleted
        ? '<i class="bi bi-save me-1"></i> CẬP NHẬT'
        : '<i class="bi bi-check-lg me-1"></i> HOÀN THÀNH';

    // Reset inputs
    $('#inp-del-img').value = '';
    $('#img-preview-area').innerHTML = '';
    state.selectedImages = []; // Reset images
    $('#inp-del-note').value = order.note || ''; // Pre-fill note if exists

    $('#modal-delivery').classList.remove('hidden');
}

function closeDeliveryModal() {
    $('#modal-delivery').classList.add('hidden');
    state.currentDeliveryOrder = null;
    state.deliveryCart = [];
    state.selectedImages = [];
}

function renderDeliveryCart() {
    const list = $('#delivery-cart-list');

    if (!state.deliveryCart.length) {
        list.innerHTML = '<div class="text-center text-muted small py-3">Giỏ hàng trống</div>';
        return;
    }

    list.innerHTML = state.deliveryCart.map((item, idx) => {
        // Only show delete button for extra items (isShell), not for main CRM products
        const deleteBtn = item.isShell
            ? `<button class="btn btn-sm text-danger py-0 px-2" onclick="removeCartItem(${idx})"><i class="bi bi-x-lg"></i></button>`
            : `<span class="badge bg-success small"><i class="bi bi-lock"></i> CRM</span>`;

        const itemClass = item.isShell ? 'border-warning' : 'border-primary';

        return `
        <div class="bg-white p-2 mb-2 rounded border ${itemClass} shadow-sm">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="fw-bold text-primary text-truncate" style="max-width: 85%;">${item.product}</div>
                ${deleteBtn}
            </div>
            
            <div class="row g-2 align-items-center">
                <!-- Planned (Static) -->
                <div class="col-3">
                    <div class="small text-muted mb-0">YC</div>
                    <span class="badge bg-light text-dark border px-2 py-2 w-100">${item.planQty || 0} ${item.unit}</span>
                </div>

                <!-- Actual (Editable) -->
                <div class="col-4">
                    <div class="small text-muted mb-0">Thực tế</div>
                    <input type="number" class="form-control text-center fw-bold text-primary px-1" 
                        value="${item.qty}" 
                        onchange="updateCartQty(${idx}, this.value)">
                </div>

                <!-- Note -->
                <div class="col-5">
                    <div class="small text-muted mb-0">Ghi chú</div>
                    <input type="text" class="form-control small px-2" placeholder="..." 
                        value="${item.note || ''}" 
                        onchange="updateCartNote(${idx}, this.value)">
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function updateCartQty(idx, val) {
    if (state.deliveryCart[idx]) state.deliveryCart[idx].qty = Number(val);
}

function updateCartNote(idx, val) {
    if (state.deliveryCart[idx]) state.deliveryCart[idx].note = val;
}

function removeCartItem(idx) {
    const item = state.deliveryCart[idx];

    // Prevent deletion of CRM products (main items)
    if (!item || !item.isShell) {
        alert('Không thể xóa hàng chính từ CRM!');
        return;
    }

    if (confirm('Xóa hàng phụ này?')) {
        state.deliveryCart.splice(idx, 1);
        renderDeliveryCart();
    }
}

function addExtraItem() {
    const name = $('#extra-prod-name').value;
    const qty = Number($('#extra-prod-qty').value);

    if (!name || !qty) return alert('Vui lòng chọn hàng và nhập số lượng!');

    state.deliveryCart.push({
        product: name,
        code: '',
        planQty: 0, // Extra items have 0 planned
        qty: qty,
        unit: 'Cái', // Default for shells
        density: 1,
        isShell: true,
        note: 'Bổ sung'
    });

    $('#extra-prod-name').value = '';
    $('#extra-prod-qty').value = '';
    renderDeliveryCart();
}

// === IMAGE HANDLING ===
async function handleImageSelect(input) {
    const files = Array.from(input.files);
    if (files.length > 10) return alert('Tối đa 10 ảnh!');

    $('#img-preview-area').innerHTML = ''; // Clear preview
    state.selectedImages = []; // Clear old state

    for (const file of files) {
        // Compress image before saving
        const compressed = await compressImage(file);
        state.selectedImages.push(compressed);

        // Add Preview (Clickable)
        const img = document.createElement('img');
        img.src = compressed;
        img.className = 'rounded border shadow-sm cursor-pointer';
        img.style = 'height:70px; width:auto; flex-shrink:0; cursor:pointer;';
        img.title = 'Xem ảnh lớn';
        img.onclick = () => {
            const viewer = document.getElementById('modal-image-viewer');
            const viewImg = document.getElementById('viewer-img');
            viewImg.src = compressed;
            viewer.classList.remove('hidden');
        };
        $('#img-preview-area').appendChild(img);
    }
}

// Compress image to reduce file size
async function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Scale down if needed
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (maxHeight / height) * width;
                    height = maxHeight;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to compressed JPEG
                const compressed = canvas.toDataURL('image/jpeg', quality);
                resolve(compressed);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

async function submitDelivery() {
    if (!state.deliveryCart.length) return alert('Giỏ hàng trống!');

    // Validation: Require Images
    if (!state.selectedImages || !state.selectedImages.length) {
        if (!confirm('Cảnh báo: Chưa có ảnh chứng minh. Tiếp tục?')) return;
    }

    const warehouseGroup = document.getElementsByName('del-wh');
    let warehouse = 'LT1';
    for (const r of warehouseGroup) if (r.checked) warehouse = r.value;

    const note = $('#inp-del-note').value;
    const order = state.currentDeliveryOrder;

    let driverName = order.taiXe;
    let plate = order.bienSo;
    if (!driverName && state.user.role === 'ADMIN') {
        driverName = 'ADMIN_OVERRIDE';
    }

    const payload = {
        type: order.type || 'EXPORT',
        warehouse: warehouse,
        partner: order.khach,
        driver_name: driverName || state.user.name,
        plate: plate || '',
        note: note,
        sender: state.user.name,
        cart: state.deliveryCart.map(i => ({
            product: { name: i.product, code: i.code },
            weight_kg: i.qty, // Actual Qty
            unit: i.unit,
            density: i.density,
            isShell: i.isShell,
            note: i.note
        })),
        images: state.selectedImages || [] // Send Array
    };

    showLoading();
    try {
        const res = await api.completeOrder(order.id, payload);
        hideLoading();
        if (res.error) {
            alert('Lỗi: ' + res.msg);
        } else {
            alert(res.msg);
            closeDeliveryModal();
            // Refresh views
            if ($('#view-driver-orders').classList.contains('hidden')) {
                loadOrders();
            } else {
                loadMyOrders();
            }
            try {
                const modalEl = document.getElementById('orderDetailModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            } catch (e) { }
        }
    } catch (e) {
        hideLoading();
        alert('Lỗi kết nối: ' + e.message);
    }
}

// ===============================================
// ORDER CHAT FUNCTIONS
// ===============================================

let currentChatOrderId = null;
let chatRefreshInterval = null;
let pendingChatImage = null; // Store pending image for sending

async function loadOrderChat(orderId) {
    currentChatOrderId = orderId;
    const container = document.getElementById('chatMessages');
    if (!container) return;

    container.innerHTML = '<div class="text-center text-muted p-3"><i class="bi bi-chat-dots"></i> Đang tải...</div>';

    try {
        const res = await fetch(`/api/chat/${orderId}/messages`);
        const data = await res.json();

        if (data.error) {
            container.innerHTML = '<div class="text-danger small p-2">Lỗi tải tin nhắn</div>';
            return;
        }

        if (!data.messages || data.messages.length === 0) {
            container.innerHTML = '<div class="text-center text-muted p-3"><i class="bi bi-chat-dots"></i> Chưa có tin nhắn</div>';
            return;
        }

        container.innerHTML = data.messages.map(msg => {
            const isMe = msg.sender_name === state.user?.name;
            const time = new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const roleColor = msg.sender_role === 'DRIVER' ? 'bg-success' : 'bg-primary';

            // Image display (if present)
            const imageHtml = msg.image
                ? `<img src="${msg.image}" class="rounded mt-1" style="max-width:150px; cursor:pointer" onclick="showChatImage('${msg.image.replace(/'/g, "\\'")}')">`
                : '';

            return `
                <div class="chat-msg ${isMe ? 'chat-me' : 'chat-other'} mb-2">
                    <div class="chat-sender small">
                        <span class="badge ${roleColor} badge-sm">${msg.sender_role}</span>
                        <span class="text-muted">${msg.sender_name}</span>
                    </div>
                    <div class="chat-bubble ${isMe ? 'bg-primary text-white' : 'bg-light'}">
                        ${msg.message || ''}
                        ${imageHtml}
                    </div>
                    <div class="chat-time text-muted small">${time}</div>
                </div>
            `;
        }).join('');

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

    } catch (e) {
        container.innerHTML = '<div class="text-danger small p-2">Lỗi kết nối</div>';
    }
}

async function sendChatMessage() {
    if (!currentChatOrderId) return;

    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    const image = pendingChatImage;

    if (!message && !image) return;

    input.disabled = true;

    try {
        const res = await fetch(`/api/chat/${currentChatOrderId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender_name: state.user?.name || 'Unknown',
                sender_role: state.user?.role || 'ADMIN',
                message: message,
                image: image
            })
        });

        const data = await res.json();
        input.disabled = false;

        if (!data.error) {
            input.value = '';
            clearChatImage();
            loadOrderChat(currentChatOrderId);
        } else {
            alert('Lỗi gửi tin: ' + data.message);
        }

    } catch (e) {
        input.disabled = false;
        alert('Lỗi kết nối');
    }
}

function previewChatImage(input) {
    if (!input.files || !input.files[0]) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        // Compress before sending
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxSize = 800;
            let width = img.width;
            let height = img.height;

            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height = (maxSize / width) * height;
                    width = maxSize;
                } else {
                    width = (maxSize / height) * width;
                    height = maxSize;
                }
            }

            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

            pendingChatImage = canvas.toDataURL('image/jpeg', 0.7);

            document.getElementById('chatImageThumb').src = pendingChatImage;
            document.getElementById('chatImagePreview').classList.remove('d-none');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
}

function clearChatImage() {
    pendingChatImage = null;
    document.getElementById('chatImageInput').value = '';
    document.getElementById('chatImagePreview').classList.add('d-none');
}

function showChatImage(src) {
    const viewer = document.getElementById('modal-image-viewer');
    const viewImg = document.getElementById('viewer-img');
    viewImg.src = src;
    viewer.classList.remove('hidden');
}

function startChatRefresh() {
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(() => {
        if (currentChatOrderId) {
            loadOrderChat(currentChatOrderId);
        }
    }, 10000); // Refresh every 10 seconds
}

function stopChatRefresh() {
    if (chatRefreshInterval) {
        clearInterval(chatRefreshInterval);
        chatRefreshInterval = null;
    }
    currentChatOrderId = null;
    clearChatImage();
}

// ===============================================
// IMPORT TICKETS FUNCTIONS
// ===============================================

let importProducts = [];

async function loadImports() {
    const container = $('#imports-list');
    container.innerHTML = '<div class="loading-spinner mx-auto mt-5"></div>';

    try {
        const res = await fetch('/api/imports');
        const data = await res.json();

        if (data.error) {
            container.innerHTML = `<div class="alert alert-danger">${data.msg}</div>`;
            return;
        }

        if (!data.data || !data.data.length) {
            container.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><div>Chưa có phiếu nhập</div></div>';
            return;
        }

        container.innerHTML = data.data.map(imp => {
            const statusBadge = {
                'pending': '<span class="badge bg-warning text-dark">Chờ điều phối</span>',
                'assigned': '<span class="badge bg-primary">Đã gán TX</span>',
                'completed': '<span class="badge bg-success">Hoàn thành</span>',
                'cancelled': '<span class="badge bg-secondary">Đã hủy</span>'
            }[imp.status] || '';

            const products = Array.isArray(imp.products) ? imp.products : [];
            const summary = products.length > 0 ? `${products[0].name} ${products.length > 1 ? `(+${products.length - 1})` : ''}` : '';

            return `
                <div class="card-custom mb-2">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-light text-dark border">#${imp.ticket_no}</span>
                        ${statusBadge}
                    </div>
                    <h6 class="fw-bold text-success mb-1">${imp.supplier_name}</h6>
                    <div class="small text-muted mb-2">${summary} | ${imp.total_qty || 0} kg</div>
                    ${imp.assigned_driver ? `<div class="small"><i class="bi bi-truck"></i> ${imp.assigned_driver}</div>` : ''}
                </div>
            `;
        }).join('');

    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

function toggleCreateImport() {
    $('#form-create-import').classList.toggle('hidden');
    importProducts = [];
    renderImportProducts();
}

function addImportProduct() {
    const name = $('#imp-prod-name').value.trim();
    const qty = Number($('#imp-prod-qty').value);

    if (!name || !qty) return alert('Nhập tên và số lượng!');

    importProducts.push({ name, qty, unit: 'kg' });
    $('#imp-prod-name').value = '';
    $('#imp-prod-qty').value = '';
    renderImportProducts();
}

function renderImportProducts() {
    const container = $('#imp-products-list');
    container.innerHTML = importProducts.map((p, i) => `
        <div class="d-flex justify-content-between align-items-center bg-white p-2 rounded border mb-1">
            <span>${p.name}: ${p.qty} ${p.unit}</span>
            <button class="btn btn-sm text-danger" onclick="removeImportProduct(${i})"><i class="bi bi-x"></i></button>
        </div>
    `).join('');
}

function removeImportProduct(idx) {
    importProducts.splice(idx, 1);
    renderImportProducts();
}

async function submitImport() {
    const supplier = $('#imp-supplier').value.trim();
    if (!supplier) return alert('Nhập tên nhà cung cấp!');
    if (!importProducts.length) return alert('Thêm ít nhất 1 sản phẩm!');

    showLoading();

    try {
        const res = await fetch('/api/imports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                supplier_name: supplier,
                supplier_address: $('#imp-address').value,
                products: importProducts,
                expected_date: $('#imp-date').value || null,
                warehouse: $('#imp-warehouse').value,
                note: $('#imp-note').value,
                created_by: state.user?.name || 'Admin'
            })
        });

        const data = await res.json();
        hideLoading();

        if (data.error) {
            alert('Lỗi: ' + data.msg);
        } else {
            alert(data.msg);
            toggleCreateImport();
            $('#imp-supplier').value = '';
            $('#imp-address').value = '';
            $('#imp-date').value = '';
            $('#imp-note').value = '';
            loadImports();
        }

    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}

// ===============================================
// RENDER IMPORT/EXPORT TICKETS IN DISPATCH VIEW
// ===============================================

function renderImportTickets(container, list) {
    if (!list || !list.length) {
        container.innerHTML = '<div class="empty-state"><i class="bi bi-box-arrow-in-down"></i><div>Chưa có phiếu nhập</div></div>';
        return;
    }

    container.innerHTML = list.map(t => {
        const statusBadge = {
            'pending': '<span class="badge bg-warning text-dark">Chờ gán</span>',
            'assigned': '<span class="badge bg-primary">Đang nhận</span>',
            'completed': '<span class="badge bg-success">Hoàn thành</span>',
            'cancelled': '<span class="badge bg-secondary">Đã hủy</span>'
        }[t.status] || '';

        const products = Array.isArray(t.products) ? t.products : [];
        const productSummary = products.slice(0, 2).map(p => p.name).join(', ') + (products.length > 2 ? ` (+${products.length - 2})` : '');
        const date = t.expected_date ? new Date(t.expected_date).toLocaleDateString('vi-VN') : '';

        return `
            <div class="card-custom mb-2 border-start border-success border-4" style="cursor:pointer" onclick="openImportDetail('${t.id}')">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <span class="badge bg-success me-1">📥 NHẬP</span>
                        <span class="text-muted small">#${t.ticket_no}</span>
                    </div>
                    ${statusBadge}
                </div>
                <h6 class="fw-bold mb-1 text-success">${t.supplier_name}</h6>
                <div class="small text-muted mb-1">${productSummary}</div>
                <div class="d-flex justify-content-between align-items-center">
                    <span class="badge bg-light text-dark">${t.total_qty || 0} kg</span>
                    <span class="small text-muted">${date}</span>
                </div>
                ${t.assigned_driver ? `<div class="mt-1 small text-primary"><i class="bi bi-truck"></i> ${t.assigned_driver} ${t.assigned_plate ? '(' + t.assigned_plate + ')' : ''}</div>` : '<div class="mt-1 small text-warning"><i class="bi bi-person-plus"></i> Click để gán tài xế</div>'}
            </div>
        `;
    }).join('');
}

function renderExportTickets(container, list) {
    if (!list || !list.length) {
        container.innerHTML = '<div class="empty-state"><i class="bi bi-box-arrow-up"></i><div>Chưa có phiếu xuất</div></div>';
        return;
    }

    container.innerHTML = list.map(t => {
        const date = t.created_at ? new Date(t.created_at).toLocaleDateString('vi-VN') : '';
        const time = t.created_at ? new Date(t.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
        const products = Array.isArray(t.products) ? t.products : [];
        const productSummary = products.slice(0, 2).map(p => `${p.name}: ${p.qty}kg`).join(', ') + (products.length > 2 ? ` (+${products.length - 2})` : '');

        return `
            <div class="card-custom mb-2 border-start border-primary border-4">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <span class="badge bg-primary me-1">📤 XUẤT</span>
                        <span class="text-muted small">#${t.ticket_no}</span>
                    </div>
                    <span class="badge bg-success">Hoàn thành</span>
                </div>
                <h6 class="fw-bold mb-1">${t.customer_name || 'N/A'}</h6>
                <div class="small text-muted mb-1">${productSummary}</div>
                <div class="d-flex justify-content-between align-items-center">
                    <span class="badge bg-light text-dark">${t.total_qty || 0} kg</span>
                    <span class="small text-muted">${date} ${time}</span>
                </div>
                <div class="mt-1 small"><i class="bi bi-truck"></i> ${t.driver_name || ''} ${t.plate ? `(${t.plate})` : ''}</div>
            </div>
        `;
    }).join('');
}

// ===============================================
// IMPORT TICKET DETAIL & DRIVER ASSIGNMENT
// ===============================================

let currentImportTicket = null;

function openImportDetail(ticketId) {
    // Find ticket from state
    const allImports = [
        ...(state.orders.imports_pending || []),
        ...(state.orders.imports_assigned || []),
        ...(state.orders.imports_completed || [])
    ];

    const ticket = allImports.find(t => t.id == ticketId);
    if (!ticket) {
        alert('Không tìm thấy phiếu nhập!');
        return;
    }

    currentImportTicket = ticket;

    // Build driver options
    const driverOptions = state.drivers.map(d =>
        `<option value="${d.name}" data-plate="${d.plate}">${d.name} (${d.plate})</option>`
    ).join('');

    // Build products list
    const products = Array.isArray(ticket.products) ? ticket.products : [];
    const productsList = products.map(p =>
        `<div class="d-flex justify-content-between py-1 border-bottom">
            <span>${p.name}</span>
            <span class="fw-bold">${p.qty} kg</span>
        </div>`
    ).join('');

    const date = ticket.expected_date ? new Date(ticket.expected_date).toLocaleDateString('vi-VN') : 'Chưa xác định';

    // Show in modal
    const modalBody = $('#orderModal .modal-body');
    const modalTitle = $('#orderModal .modal-title');

    // Status badge
    const statusBadge = {
        'pending': '<span class="badge bg-warning text-dark">Chờ gán</span>',
        'assigned': '<span class="badge bg-primary">Đang nhận</span>',
        'in_transit': '<span class="badge bg-info">Đang vận chuyển</span>',
        'completed': '<span class="badge bg-success">Hoàn thành</span>'
    }[ticket.status] || '';

    modalTitle.innerHTML = `<span class="badge bg-success me-2">📥 NHẬP</span> ${ticket.ticket_no} ${statusBadge}`;

    // Build action buttons based on status
    let actionButtons = '';

    if (ticket.status === 'pending') {
        // Pending: Show driver assignment
        actionButtons = `
            <hr>
            <div class="mb-3">
                <label class="fw-bold mb-2"><i class="bi bi-truck"></i> Gán tài xế:</label>
                <select class="form-select mb-2" id="import-driver-select">
                    <option value="">-- Chọn tài xế --</option>
                    ${driverOptions}
                </select>
                <button class="btn btn-success w-100" onclick="assignImportDriver()">
                    <i class="bi bi-check-lg"></i> XÁC NHẬN GÁN TÀI XẾ
                </button>
            </div>
        `;
    } else if (ticket.status === 'assigned') {
        // Assigned: Show start and complete buttons
        actionButtons = `
            <div class="alert alert-info mb-2">
                <i class="bi bi-truck"></i> Tài xế: <b>${ticket.assigned_driver || 'N/A'}</b> 
                ${ticket.assigned_plate ? `(${ticket.assigned_plate})` : ''}
            </div>
            <div class="d-grid gap-2">
                <button class="btn btn-primary" onclick="startImportDelivery()">
                    <i class="bi bi-play-fill"></i> BẮT ĐẦU VẬN CHUYỂN
                </button>
                <button class="btn btn-success" onclick="completeImportTicket()">
                    <i class="bi bi-check-circle"></i> HOÀN THÀNH NHẬP KHO
                </button>
            </div>
        `;
    } else if (ticket.status === 'in_transit') {
        // In transit: Show complete button
        actionButtons = `
            <div class="alert alert-info mb-2">
                <i class="bi bi-truck"></i> Tài xế: <b>${ticket.assigned_driver || 'N/A'}</b> đang vận chuyển
            </div>
            <button class="btn btn-success w-100" onclick="completeImportTicket()">
                <i class="bi bi-check-circle"></i> HOÀN THÀNH NHẬP KHO
            </button>
        `;
    } else {
        // Completed: View only
        actionButtons = `
            <div class="alert alert-success">
                <i class="bi bi-check-circle"></i> Đã hoàn thành bởi: <b>${ticket.assigned_driver || 'N/A'}</b>
                ${ticket.completed_at ? `<br><small>Lúc: ${new Date(ticket.completed_at).toLocaleString('vi-VN')}</small>` : ''}
            </div>
        `;
    }

    modalBody.innerHTML = `
        <div class="mb-3">
            <div class="fw-bold text-success fs-5">${ticket.supplier_name}</div>
            ${ticket.supplier_address ? `<div class="text-muted small"><i class="bi bi-geo-alt"></i> ${ticket.supplier_address}</div>` : ''}
        </div>
        
        <div class="mb-3">
            <label class="text-muted small">Sản phẩm nhập:</label>
            <div class="bg-light p-2 rounded">${productsList}</div>
            <div class="text-end fw-bold mt-1">Tổng: ${ticket.total_qty || 0} kg</div>
        </div>
        
        <div class="mb-3">
            <div class="small text-muted"><i class="bi bi-calendar"></i> Ngày dự kiến: <b>${date}</b></div>
            ${ticket.note ? `<div class="small text-muted"><i class="bi bi-sticky"></i> Ghi chú: ${ticket.note}</div>` : ''}
        </div>

        <!-- Chat Button -->
        <div class="mb-3">
            <button class="btn btn-outline-primary w-100" onclick="openImportChat('${ticket.id}')">
                <i class="bi bi-chat-dots"></i> CHAT / GHI CHÚ
            </button>
        </div>
        
        ${actionButtons}
    `;

    // Hide driver assignment section (it's inline now)
    const driverSection = $('#modal-driver-section');
    if (driverSection) driverSection.classList.add('d-none');

    // Show modal
    const modal = new bootstrap.Modal($('#orderModal'));
    modal.show();
}

async function assignImportDriver() {
    const select = $('#import-driver-select');
    const driverName = select.value;
    const plate = select.selectedOptions[0]?.dataset.plate || '';

    if (!driverName) {
        alert('Vui lòng chọn tài xế!');
        return;
    }

    if (!currentImportTicket) {
        alert('Lỗi: Không tìm thấy phiếu!');
        return;
    }

    showLoading('Đang gán tài xế...');

    try {
        const res = await fetch(`/api/imports/${currentImportTicket.id}/assign`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driver_name: driverName, plate })
        });

        const data = await res.json();
        hideLoading();

        if (data.error) {
            alert('Lỗi: ' + data.msg);
            return;
        }

        // Close modal and reload
        bootstrap.Modal.getInstance($('#orderModal')).hide();
        alert('✅ Đã gán tài xế thành công!');
        loadOrders();

    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}

// Open chat for import ticket
function openImportChat(ticketId) {
    // Close order modal first
    const orderModal = bootstrap.Modal.getInstance($('#orderModal'));
    if (orderModal) orderModal.hide();

    // Set import context and open chat
    state.currentChatContext = { type: 'import', id: ticketId };
    state.currentOrder = currentImportTicket;

    const chatModal = $('#modal-chat');
    if (chatModal) {
        $('#chat-modal-title').textContent = `Chat - Phiếu nhập #${currentImportTicket?.ticket_no || ticketId}`;
        chatModal.classList.remove('hidden');
        loadImportChatMessages(ticketId);
    }
}

async function loadImportChatMessages(ticketId) {
    const container = $('#chat-messages');
    container.innerHTML = '<div class="text-center text-muted py-3">Đang tải...</div>';

    try {
        const res = await fetch(`/api/orders/${ticketId}/messages?type=import`);
        const data = await res.json();

        if (data.error) {
            container.innerHTML = '<div class="text-danger small">Lỗi tải tin nhắn</div>';
            return;
        }

        const messages = data.messages || [];
        if (!messages.length) {
            container.innerHTML = '<div class="text-center text-muted py-3">Chưa có tin nhắn</div>';
            return;
        }

        container.innerHTML = messages.map(m => {
            const isDriver = m.sender_role === 'DRIVER';
            const time = new Date(m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="d-flex ${isDriver ? 'justify-content-start' : 'justify-content-end'} mb-2">
                    <div class="chat-bubble ${isDriver ? 'bg-light' : 'bg-primary text-white'} px-3 py-2 rounded-3" style="max-width:80%">
                        <div class="small ${isDriver ? 'text-muted' : 'opacity-75'}">${m.sender_name}</div>
                        ${m.message ? `<div>${m.message}</div>` : ''}
                        ${m.image ? `<img src="${m.image}" class="img-fluid rounded mt-1" style="max-height:150px">` : ''}
                        <div class="small ${isDriver ? 'text-muted' : 'opacity-50'} text-end">${time}</div>
                    </div>
                </div>
            `;
        }).join('');

        container.scrollTop = container.scrollHeight;
    } catch (e) {
        container.innerHTML = '<div class="text-danger small">Lỗi: ' + e.message + '</div>';
    }
}

// Start import delivery (in transit)
async function startImportDelivery() {
    if (!currentImportTicket) return;

    showLoading('Đang cập nhật...');

    try {
        const res = await fetch(`/api/imports/${currentImportTicket.id}/start`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await res.json();
        hideLoading();

        if (data.error) {
            alert('Lỗi: ' + data.msg);
            return;
        }

        bootstrap.Modal.getInstance($('#orderModal')).hide();
        alert('✅ Đã bắt đầu vận chuyển!');
        loadOrders();

    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}

// Complete import ticket
async function completeImportTicket() {
    if (!currentImportTicket) return;

    if (!confirm('Xác nhận hoàn thành nhập kho?')) return;

    showLoading('Đang hoàn thành...');

    try {
        const res = await fetch(`/api/imports/${currentImportTicket.id}/complete`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                actual_products: currentImportTicket.products,
                note: 'Hoàn thành từ webapp'
            })
        });

        const data = await res.json();
        hideLoading();

        if (data.error) {
            alert('Lỗi: ' + data.msg);
            return;
        }

        bootstrap.Modal.getInstance($('#orderModal')).hide();
        alert('✅ Đã hoàn thành nhập kho!');
        loadOrders();

    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}
