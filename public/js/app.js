// ===============================================
// LỘC THIÊN ERP - MAIN APP
// ===============================================

// === STATE ===
// === STATE ===
let state = {
    user: null,
    orders: { pending: [], assigned: [], history: [] }, // Added history
    drivers: [],
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
        const res = await api.getOrders();
        state.orders.pending = res.pending || [];
        state.orders.assigned = res.assigned || [];
        state.orders.history = res.completed || []; // Load History

        console.log('DEBUG: History Items:', state.orders.history.length);
        if (state.orders.history.length === 0) {
            console.warn('History is empty but server said 6 exists?');
        } else {
            // alert(`Debug: Received ${state.orders.history.length} history items.`);
        }

        state.drivers = res.drivers || [];

        $('#countPending').textContent = state.orders.pending.length;
        renderOrderList();

    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
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
const views = ['view-login', 'view-home', 'view-orders', 'view-create-order', 'view-hr', 'view-materials', 'view-warehouse', 'view-reports', 'view-driver-orders'];

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

// === ORDERS ===
async function loadOrders() {
    const container = $('#order-list');
    container.innerHTML = '<div class="loading-spinner mx-auto mt-5"></div>';

    try {
        const res = await api.getOrders();
        state.orders.pending = res.pending || [];
        state.orders.assigned = res.assigned || [];
        state.orders.history = res.completed || [];
        state.drivers = res.drivers || [];

        $('#countPending').textContent = state.orders.pending.length;
        if ($('#countHistory')) {
            $('#countHistory').textContent = state.orders.history ? state.orders.history.length : 0;
        }
        renderOrderList();

    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}


function switchOrderTab(tab) {
    state.currentOrderTab = tab;
    $$('.tab-container .tab-btn').forEach(btn => btn.classList.remove('active'));
    $(`#tab-${tab}`).classList.add('active');
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

    if (!list || !list.length) {
        container.innerHTML = '<div class="empty-state"><i class="bi bi-box-seam"></i><div>Không tìm thấy đơn hàng</div></div>';
        return;
    }

    // const driverOptions = ... (Moved into loop)

    container.innerHTML = list.map(order => {
        let statusBadge = '';
        if (state.currentOrderTab === 'pending') statusBadge = '<span class="badge bg-warning text-dark">Chờ gán</span>';
        if (state.currentOrderTab === 'assigned') statusBadge = '<span class="badge bg-primary">Đang giao</span>';
        if (state.currentOrderTab === 'history') {
            const isDelivered = order.status === 'Đã thực hiện' || order.status === 'Đã giao hàng';
            statusBadge = `<span class="badge ${isDelivered ? 'bg-success' : 'bg-secondary'}">${order.status}</span>`;
        }

        // Summary Logic
        const productCount = Array.isArray(order.products) ? order.products.length : 0;
        const firstProduct = productCount > 0 ? order.products[0].name : '...';
        const summary = productCount > 1 ? `${firstProduct} (+${productCount - 1} SP khác)` : firstProduct;

        // Action Buttons logic
        let actionArea = '';
        if (state.currentOrderTab === 'history') {
            // Admin Correction / View
            actionArea = `
                <button class="btn btn-outline-primary btn-sm w-100" onclick="openDeliveryModal('${order.id}')">
                    <i class="bi bi-pencil-square me-1"></i> Sửa / Xem lại
                </button>
             `;
        } else {
            // Generate Driver Options PER ORDER to handle selection
            let foundDriver = false;
            const drvOptionsHTML = state.drivers.map(d => {
                const val = `${d.name}|${d.plate}`;
                // Check exact name match
                const isSelected = (order.taiXe === d.name);
                if (isSelected) foundDriver = true;
                return `<option value="${val}" ${isSelected ? 'selected' : ''}>${d.name} - ${d.plate}</option>`;
            }).join('');

            // If has driver but not in list, assume External
            const isExternal = !foundDriver && order.taiXe;

            actionArea = `
            <div class="assign-area border-top pt-2">
                <div class="mb-2">
                    <select class="form-select form-select-sm" id="drv_${order.id}" onchange="toggleExternalDriver('${order.id}')">
                        <option value="">-- Chọn tài xế --</option>
                        ${drvOptionsHTML}
                        <option value="EXTERNAL" ${isExternal ? 'selected' : ''}>Xe Ngoài (Nhập tay)</option>
                    </select>
                </div>
                
                <div id="ext_drv_${order.id}" class="${isExternal ? '' : 'd-none'} mb-2 p-2 bg-light rounded">
                    <input type="text" class="form-control form-control-sm mb-1" id="ext_name_${order.id}" placeholder="Tên tài xế ngoài" value="${order.taiXe || ''}">
                    <input type="text" class="form-control form-control-sm" id="ext_plate_${order.id}" placeholder="Biển số xe" value="${order.bienSo || ''}">
                </div>

                <div class="mb-2">
                     <input type="text" class="form-control form-control-sm" id="note_${order.id}" placeholder="Ghi chú điều phối" value="${order.note || ''}">
                </div>

                <button class="btn btn-primary w-100 btn-sm" onclick="assignOrder('${order.id}')">GÁN ĐƠN</button>
            </div>`;
        }

        return `
      <div class="order-card p-3 mb-3 border rounded shadow-sm bg-white">
        <div class="d-flex justify-content-between mb-2">
            <div>
                <span class="badge bg-light text-dark border">#${order.soDon}</span>
                ${statusBadge}
            </div>
            <span class="small text-secondary">${formatDateVN(order.ngay)}</span>
        </div>
        <h6 class="fw-bold text-primary mb-1 cursor-pointer" onclick="openOrderDetail('${order.id}')">${order.khach}</h6>
        <div class="text-muted small mb-2"><i class="bi bi-geo-alt me-1"></i>${order.diaChi}</div>
        
        <!-- Quick Summary & Detail Button -->
        <div class="d-flex justify-content-between align-items-center bg-light p-2 rounded mb-3 border">
            <span class="small fw-bold text-truncate" style="max-width: 200px;">${summary}</span>
            <button class="btn btn-sm btn-outline-primary" onclick="openOrderDetail('${order.id}')">
                Chi tiết
            </button>
        </div>
        
        ${actionArea}
      </div>
    `;
    }).join('');
}

function openOrderDetail(id) {
    const order = state.orders.pending.find(o => o.id === id) || state.orders.assigned.find(o => o.id === id);
    if (!order) return;

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
            <td><span class="badge bg-secondary">${p.code}</span></td>
            <td>${p.name}</td>
            <td class="text-end fw-bold">${p.qty}</td>
            <td>${p.unit}</td>
        </tr>
    `).join('');

    // Admin Footer Logic
    const footer = document.getElementById('modalFooter');
    let adminBtn = '';

    // Check if Admin
    const role = (state.user.role || '').toUpperCase();
    if (role === 'ADMIN') {
        // Allow completing if assigned
        adminBtn = `
            <button class="btn btn-success btn-sm ms-2" onclick="adminCompleteOrder('${order.id}')">
                <i class="bi bi-check-circle me-1"></i>Hoàn thành (Admin)
            </button>
        `;
    }

    // Reset footer content (Close btn + Admin btn)
    footer.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Đóng</button>
        ${adminBtn}
    `;

    const modal = new bootstrap.Modal(document.getElementById('orderDetailModal'));
    modal.show();
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

    // Header if list is not empty (Optional, but helps "Minimalism" by removing repeated labels)
    // For Mobile, we stick to card view but cleaner.

    list.innerHTML = state.deliveryCart.map((item, idx) => `
        <div class="bg-white p-2 mb-2 rounded border shadow-sm">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="fw-bold text-primary text-truncate" style="max-width: 85%;">${item.product}</div>
                <button class="btn btn-sm text-danger py-0 px-2" onclick="removeCartItem(${idx})"><i class="bi bi-x-lg"></i></button>
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
    `).join('');
}

function updateCartQty(idx, val) {
    if (state.deliveryCart[idx]) state.deliveryCart[idx].qty = Number(val);
}

function updateCartNote(idx, val) {
    if (state.deliveryCart[idx]) state.deliveryCart[idx].note = val;
}

function removeCartItem(idx) {
    if (confirm('Xóa dòng này?')) {
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
        const base64 = await toBase64(file);
        state.selectedImages.push(base64);

        // Add Preview (Clickable)
        const img = document.createElement('img');
        img.src = base64;
        img.className = 'rounded border shadow-sm cursor-pointer';
        img.style = 'height:70px; width:auto; flex-shrink:0; cursor:pointer;';
        img.title = 'Xem ảnh lớn';
        img.onclick = () => {
            const viewer = document.getElementById('modal-image-viewer');
            const viewImg = document.getElementById('viewer-img');
            viewImg.src = base64;
            viewer.classList.remove('hidden');
        };
        $('#img-preview-area').appendChild(img);
    }
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
