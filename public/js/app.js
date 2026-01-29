// ===============================================
// LỘC THIÊN ERP - MAIN APP V3
// Rewritten for new UI Design
// ===============================================

// === STATE ===
let state = {
    user: null,
    orders: { pending: [], assigned: [], completed: [], imports: [] },
    imports: { pending: [], assigned: [], completed: [] },
    drivers: [],
    currentSection: 'dashboard',
    currentDispatchTab: 'pending',
    currentOrderType: 'export',
    orderProducts: [],
    historyPage: 1,
    historyPerPage: 10
};


// === DOM HELPERS (use globals from core.js) ===
// Note: $ and $$ are defined in core.js and exported to window
// Use window.$ and window.$$ directly in this file

function show(id) {
    const el = typeof id === 'string' ? (id.startsWith('#') ? window.$(id) : window.$(`#${id}`)) : id;
    if (el) el.classList.remove('hidden');
}

function hide(id) {
    const el = typeof id === 'string' ? (id.startsWith('#') ? window.$(id) : window.$(`#${id}`)) : id;
    if (el) el.classList.add('hidden');
}

function showLoading(text = 'Đang xử lý...') {
    const loadTxt = window.$('#load-txt');
    if (loadTxt) loadTxt.textContent = text;
    show('loading');
}

function hideLoading() {
    hide('loading');
}

// === SECTION NAVIGATION ===
function showSection(sectionId) {
    // Close mobile menu when navigating
    if (window.closeMobileMenu) window.closeMobileMenu();

    // Hide all sections
    window.$$('[id^="section-"]').forEach(el => el.classList.add('hidden'));

    // Show target section
    const target = window.$(`#section-${sectionId}`);
    if (target) target.classList.remove('hidden');

    // Update nav active state
    window.$$('.sidebar-nav .nav-link').forEach(btn => btn.classList.remove('active'));
    const activeBtn = window.$(`.nav-link[onclick="showSection('${sectionId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update header title
    const titles = {
        'dashboard': 'Tổng quan',
        'dispatch': 'Quản lý đơn hàng',
        'create-order': 'Quản lý đơn hàng',
        'my-orders': 'Quản lý đơn hàng',
        'order-history': 'Lịch sử đơn hàng',
        'hr': 'Nhân sự',
        'materials': 'Vật tư',
        'warehouse': 'Kho hàng'
    };
    const headerTitle = window.$('#header-title');
    if (headerTitle) headerTitle.textContent = titles[sectionId] || 'Tổng quan';

    state.currentSection = sectionId;

    // Load section data
    switch (sectionId) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'dispatch':
            loadOrders();
            break;
        case 'create-order':
            initCreateOrder();
            break;
        case 'my-orders':
            loadMyOrders();
            break;
        case 'order-history':
            loadOrderHistory();
            break;
    }
}

function toggleSubmenu(btn) {
    btn.classList.toggle('expanded');
    const submenu = btn.nextElementSibling;
    if (submenu) {
        submenu.style.display = submenu.style.display === 'none' ? 'block' : 'none';
    }
}

// === AUTH ===
async function handleLogin() {
    const username = window.$('#inp-user').value.trim();
    const password = window.$('#inp-pass').value.trim();

    if (!username || !password) {
        alert('Vui lòng nhập đủ thông tin!');
        return;
    }

    showLoading('Đang đăng nhập...');

    try {
        const res = await api.login(username, password);
        hideLoading();

        if (!res || res.error || res.errorMessage) {
            alert('Lỗi: ' + (res?.errorMessage || res?.msg || 'Không thể đăng nhập'));
            return;
        }

        state.user = res.data || res;
        localStorage.setItem('LT_SESSION', JSON.stringify(state));

        initApp();
    } catch (e) {
        hideLoading();
        console.error('Login error:', e);
        alert('Lỗi kết nối máy chủ');
    }
}

function doLogout() {
    localStorage.removeItem('LT_SESSION');
    state.user = null;
    hide('view-app');
    show('view-login');
}

function initApp() {
    hide('view-login');
    show('view-app');

    // UI Updates
    if (state.user) {
        const avatar = window.$('.user-avatar');
        if (avatar) avatar.textContent = state.user.fullName ? state.user.fullName.charAt(0).toUpperCase() : 'U';

        const menuName = window.$('#menu-user-name');
        const menuRole = window.$('#menu-user-role');
        if (menuName) menuName.textContent = state.user.fullName;
        if (menuRole) menuRole.textContent = state.user.role;
    }

    // Show dashboard
    showSection('dashboard');
}

// === SYNC MISA ===
async function forceSyncMisa() {
    const btn = window.$('#btn-force-sync');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-arrow-repeat spinning"></i> Đang đồng bộ...';
    }

    showLoading('Đang đồng bộ với MISA CRM...');

    try {
        const res = await fetch('/api/sync', { method: 'POST' });
        const json = await res.json();

        hideLoading();

        if (json.success) {
            // Delay to allow server to process
            setTimeout(async () => {
                await loadDashboard();
                await loadOrders();
                alert('✅ Đã đồng bộ thành công! Dữ liệu đã cập nhật.');
            }, 2000);
        } else {
            alert('❌ Lỗi đồng bộ: ' + (json.error || json.message || 'Không xác định'));
        }
    } catch (e) {
        hideLoading();
        alert('❌ Lỗi kết nối: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Đồng bộ MISA';
        }
    }
}

// === DASHBOARD ===
async function loadDashboard() {
    try {
        // Get orders data
        const res = await api.getOrders();
        const allOrders = [...(res.pending || []), ...(res.assigned || []), ...(res.completed || [])];

        // Get period filter
        const periodSelect = window.$('#dashboard-period');
        const period = periodSelect?.value || 'month';

        // Filter orders by period
        const now = new Date();
        const filteredOrders = allOrders.filter(order => {
            const orderDate = new Date(order.ngay || order.sale_order_date || order.created_at);
            if (isNaN(orderDate.getTime())) return false;

            switch (period) {
                case 'today':
                    return orderDate.toDateString() === now.toDateString();
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return orderDate >= weekAgo;
                case 'month':
                    return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
                case 'year':
                    return orderDate.getFullYear() === now.getFullYear();
                default:
                    return true;
            }
        });

        // Calculate stats
        const orderCount = filteredOrders.length;
        const orderValue = filteredOrders.reduce((sum, o) => sum + (parseFloat(o.amount || o.sale_order_amount) || 0), 0);
        const pendingCount = (res.pending || []).length;
        const completedCount = (res.completed || []).length;
        const completedRate = orderCount > 0 ? Math.round((completedCount / orderCount) * 100) : 0;

        // Update stat cards
        const elOrderCount = window.$('#stat-order-count');
        const elOrderValue = window.$('#stat-order-value');
        const elPendingCount = window.$('#stat-pending-count');
        const elCompletedCount = window.$('#stat-completed-count');
        const elCompletedRate = window.$('#stat-completed-rate');
        const elUpdateTime = window.$('#dashboard-update-time');

        if (elOrderCount) elOrderCount.textContent = orderCount.toLocaleString('vi-VN');
        if (elOrderValue) elOrderValue.textContent = formatCurrencyBillion(orderValue);
        if (elPendingCount) elPendingCount.textContent = pendingCount;
        if (elCompletedCount) elCompletedCount.textContent = completedCount;
        if (elCompletedRate) elCompletedRate.textContent = `${completedRate}% tỷ lệ hoàn thành`;
        if (elUpdateTime) elUpdateTime.textContent = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

        // Load charts
        loadOrdersTimeChart(filteredOrders, period);
        loadValueTimeChart(filteredOrders, period);

        // Load analytics
        loadTopProducts(filteredOrders);
        loadTopCustomers(filteredOrders);
        loadTopDrivers(res.completed || []);

    } catch (e) {
        console.error('Dashboard error:', e);
    }
}

function loadOrdersTimeChart(orders, period) {
    const ctx = window.$('#ordersTimeChart');
    if (!ctx) return;

    if (window.ordersTimeChartInstance) {
        window.ordersTimeChartInstance.destroy();
    }

    // Group orders by date
    const grouped = {};
    orders.forEach(order => {
        const date = (order.ngay || order.sale_order_date || '').split('T')[0];
        if (date) {
            grouped[date] = (grouped[date] || 0) + 1;
        }
    });

    const labels = Object.keys(grouped).sort().slice(-14);
    const data = labels.map(d => grouped[d] || 0);

    window.ordersTimeChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(d => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
            datasets: [{
                label: 'Số đơn',
                data: data,
                borderColor: '#4dabf7',
                backgroundColor: 'rgba(77, 171, 247, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#4dabf7'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function loadValueTimeChart(orders, period) {
    const ctx = window.$('#valueTimeChart');
    if (!ctx) return;

    if (window.valueTimeChartInstance) {
        window.valueTimeChartInstance.destroy();
    }

    // Group orders by date
    const grouped = {};
    orders.forEach(order => {
        const date = (order.ngay || order.sale_order_date || '').split('T')[0];
        const value = parseFloat(order.amount || order.sale_order_amount) || 0;
        if (date) {
            grouped[date] = (grouped[date] || 0) + value;
        }
    });

    const labels = Object.keys(grouped).sort().slice(-14);
    const data = labels.map(d => grouped[d] || 0);

    window.valueTimeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(d => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
            datasets: [{
                label: 'Giá trị',
                data: data,
                backgroundColor: 'rgba(81, 207, 102, 0.7)',
                borderColor: '#51cf66',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (v) => (v / 1000000).toFixed(0) + 'M' }
                }
            }
        }
    });
}

function loadTopProducts(orders) {
    const container = window.$('#top-products-list');
    if (!container) return;

    // Count product occurrences
    const productCounts = {};
    orders.forEach(order => {
        const products = order.products || order.cart || [];
        products.forEach(p => {
            const name = p.tenVatTu || p.name || p.productName || 'Sản phẩm';
            productCounts[name] = (productCounts[name] || 0) + (parseInt(p.soLuong || p.qty) || 1);
        });
    });

    const sorted = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (sorted.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:40px;"><i class="bi bi-inbox" style="font-size:32px; opacity:0.5;"></i><p style="margin-top:8px;">Không có dữ liệu</p></div>';
        return;
    }

    container.innerHTML = sorted.map(([name, count], i) => `
        <div class="analytics-list-item">
            <span class="analytics-rank" style="background:var(--primary);">${i + 1}</span>
            <div class="analytics-content">
                <div class="analytics-name">${name}</div>
            </div>
            <span class="analytics-value" style="color:var(--text-muted);">${count} đơn vị</span>
        </div>
    `).join('');
}

function loadTopCustomers(orders) {
    const container = window.$('#top-customers-list');
    if (!container) return;

    // Count customer orders and value
    const customerStats = {};
    orders.forEach(order => {
        const name = order.khach || order.account_name || 'Khách hàng';
        if (!customerStats[name]) customerStats[name] = { count: 0, value: 0 };
        customerStats[name].count++;
        customerStats[name].value += parseFloat(order.amount || order.sale_order_amount) || 0;
    });

    const sorted = Object.entries(customerStats).sort((a, b) => b[1].value - a[1].value).slice(0, 5);

    if (sorted.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:40px;"><i class="bi bi-inbox" style="font-size:32px; opacity:0.5;"></i><p style="margin-top:8px;">Không có dữ liệu</p></div>';
        return;
    }

    container.innerHTML = sorted.map(([name, stats], i) => `
        <div class="analytics-list-item">
            <span class="analytics-rank" style="background:#51cf66;">${i + 1}</span>
            <div class="analytics-content">
                <div class="analytics-name">${name}</div>
                <div class="analytics-meta">${stats.count} đơn</div>
            </div>
            <span class="analytics-value" style="color:var(--success);">${formatCurrencyBillion(stats.value)}</span>
        </div>
    `).join('');
}

function loadTopDrivers(completedOrders) {
    const container = window.$('#top-drivers-list');
    if (!container) return;

    // Count driver deliveries
    const driverStats = {};
    completedOrders.forEach(order => {
        const driver = order.taiXe || order.driver || order.custom_field13;
        if (!driver) return;
        if (!driverStats[driver]) driverStats[driver] = { count: 0, value: 0 };
        driverStats[driver].count++;
        driverStats[driver].value += parseFloat(order.amount || order.sale_order_amount) || 0;
    });

    const sorted = Object.entries(driverStats).sort((a, b) => b[1].count - a[1].count).slice(0, 5);

    if (sorted.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:40px;"><i class="bi bi-inbox" style="font-size:32px; opacity:0.5;"></i><p style="margin-top:8px;">Không có dữ liệu</p></div>';
        return;
    }

    container.innerHTML = sorted.map(([name, stats], i) => `
        <div class="analytics-list-item">
            <span class="analytics-rank" style="background:#845ef7;">${i + 1}</span>
            <div class="analytics-content">
                <div class="analytics-name">${name}</div>
                <div class="analytics-meta">${stats.count} chuyến</div>
            </div>
            <span class="analytics-value" style="color:var(--text-muted);">${formatCurrency(stats.value)}</span>
        </div>
    `).join('');
}

// === ORDERS / DISPATCH ===
async function loadOrders() {
    const container = window.$('#dispatch-order-list');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner" style="margin: 40px auto;"></div>';

    try {
        const res = await api.getOrders();
        state.orders.pending = res.pending || [];
        state.orders.assigned = res.assigned || [];
        state.orders.completed = res.completed || [];
        state.drivers = res.drivers || [];

        renderDispatchOrders();
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:var(--danger);">Lỗi tải đơn hàng</p>';
    }
}

function switchDispatchTab(tab) {
    state.currentDispatchTab = tab;

    // Update tab buttons
    window.$$('.tab-btn').forEach(btn => btn.classList.remove('active'));
    window.$(`#tab-${tab}`)?.classList.add('active');

    // Render appropriate list based on order type
    if (state.currentOrderType === 'import') {
        renderImportList();
    } else {
        renderDispatchOrders();
    }
}

// === ORDER TYPE (Export/Import) ===
function switchOrderType(type) {
    state.currentOrderType = type;

    // Update type buttons
    const exportBtn = window.$('#type-export');
    const importBtn = window.$('#type-import');

    if (type === 'import') {
        exportBtn?.classList.remove('btn-primary');
        exportBtn?.classList.add('btn-outline');
        importBtn?.classList.add('btn-primary');
        importBtn?.classList.remove('btn-outline');
        loadImportTickets();
    } else {
        importBtn?.classList.remove('btn-primary');
        importBtn?.classList.add('btn-outline');
        exportBtn?.classList.add('btn-primary');
        exportBtn?.classList.remove('btn-outline');
        // Fix: call correct function name
        loadOrders();
    }
}


async function loadImportTickets() {
    const container = window.$('#dispatch-order-list');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:40px;"><i class="bi bi-arrow-repeat spin"></i> Đang tải phiếu nhập...</div>';

    try {
        const res = await api.getImports();
        const imports = res?.data || [];

        // Group by status
        state.imports = {
            pending: imports.filter(i => i.status === 'pending' || i.status === 'Chưa thực hiện'),
            assigned: imports.filter(i => i.status === 'assigned' || i.status === 'in_transit'),
            completed: imports.filter(i => i.status === 'completed')
        };

        renderImportList();
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:var(--danger);">Lỗi tải phiếu nhập</p>';
    }
}

function renderImportList() {
    const container = window.$('#dispatch-order-list');
    if (!container) return;

    let imports = state.imports?.[state.currentDispatchTab] || [];

    // Apply date filter
    if (currentDateFilter) {
        imports = imports.filter(imp => {
            const impDate = imp.expected_date || imp.created_at || '';
            return impDate.startsWith(currentDateFilter);
        });
    }

    // Apply search filter
    if (currentSearchKeyword) {
        imports = imports.filter(imp => {
            const searchFields = [
                imp.ticket_no,
                imp.supplier_name,
                imp.supplier_address,
                imp.driver_name,
                imp.plate
            ].filter(Boolean).join(' ').toLowerCase();
            return searchFields.includes(currentSearchKeyword);
        });
    }

    if (imports.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px; color:var(--text-muted);">
                <i class="bi bi-inbox" style="font-size:48px; opacity:0.5;"></i>
                <p style="margin-top:16px;">${currentSearchKeyword || currentDateFilter ? 'Không tìm thấy phiếu nhập phù hợp' : 'Không có phiếu nhập nào'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = imports.map(imp => `
        <div class="order-card">
            <div class="order-card-header">
                <div>
                    <div class="order-id">#${imp.ticket_no || imp.id}</div>
                    <div class="order-customer">${imp.supplier_name || 'NCC'}</div>
                </div>
                <span class="badge badge-${getStatusBadge(imp.status)}">${getStatusText(imp.status)}</span>
            </div>
            <div class="order-meta">
                <div class="order-meta-item">
                    <i class="bi bi-calendar3"></i>
                    ${formatDate(imp.expected_date || imp.created_at)}
                </div>
                <div class="order-meta-item">
                    <i class="bi bi-geo-alt"></i>
                    ${imp.supplier_address || 'Chưa có địa chỉ'}
                </div>
                ${imp.driver_name ? `
                <div class="order-meta-item">
                    <i class="bi bi-truck"></i>
                    ${imp.driver_name}${imp.plate ? ' - ' + imp.plate : ''}
                </div>
                ` : ''}
            </div>
            <div class="order-card-footer">
                <button class="btn btn-outline btn-sm" onclick="viewImportDetail('${imp.id}')">
                    <i class="bi bi-eye"></i> Chi tiết
                </button>
                ${state.currentDispatchTab === 'pending' ? `
                    <button class="btn btn-info btn-sm" onclick="assignImportDriver('${imp.id}')">
                        <i class="bi bi-person-plus"></i> Gán tài xế
                    </button>
                ` : ''}
                ${state.currentDispatchTab === 'assigned' && state.user?.role === 'ADMIN' ? `
                    <button class="btn btn-success btn-sm" onclick="adminCompleteImport('${imp.id}')">
                        <i class="bi bi-check-circle"></i> Hoàn thành
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Store filters for dispatch
let currentSearchKeyword = '';
let currentDateFilter = '';

function searchOrders(keyword) {
    currentSearchKeyword = (keyword || '').toLowerCase().trim();
    renderDispatchOrders();
}

function filterByDate(date) {
    currentDateFilter = date || '';
    renderDispatchOrders();
}

function clearDateFilter() {
    currentDateFilter = '';
    const dateInput = window.$('#order-date-filter');
    if (dateInput) dateInput.value = '';
    renderDispatchOrders();
}

function renderDispatchOrders() {
    const container = window.$('#dispatch-order-list');
    if (!container) return;

    let orders = state.orders[state.currentDispatchTab] || [];

    // Apply date filter if set
    if (currentDateFilter) {
        orders = orders.filter(order => {
            const orderDate = order.ngay || order.sale_order_date || '';
            // Compare date strings (YYYY-MM-DD format)
            return orderDate.startsWith(currentDateFilter);
        });
    }

    // Apply search filter if keyword exists
    if (currentSearchKeyword) {
        orders = orders.filter(order => {
            const searchFields = [
                order.soDon,
                order.sale_order_no,
                order.id,

                order.khach,
                order.account_name,
                order.diaChi,
                order.shipping_address,
                order.taiXe,
                order.driver,
                order.bienSo,
                order.plate
            ].filter(Boolean).join(' ').toLowerCase();

            return searchFields.includes(currentSearchKeyword);
        });
    }

    if (orders.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px; color:var(--text-muted);">
                <i class="bi bi-inbox" style="font-size:48px; opacity:0.5;"></i>
                <p style="margin-top:16px;">${currentSearchKeyword ? 'Không tìm thấy đơn hàng phù hợp' : 'Không có đơn hàng nào'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="order-card">
            <div class="order-card-header">
                <div>
                    <div class="order-id">#${order.soDon || order.sale_order_no || order.id}</div>
                    <div class="order-customer">${order.khach || order.account_name || 'Khách hàng'}</div>
                </div>
                <span class="badge badge-${getStatusBadge(order.status)}">${getStatusText(order.status)}</span>
            </div>
            <div class="order-meta">
                <div class="order-meta-item">
                    <i class="bi bi-calendar3"></i>
                    ${formatDate(order.ngay || order.sale_order_date)}
                </div>
                <div class="order-meta-item">
                    <i class="bi bi-geo-alt"></i>
                    ${order.diaChi || order.shipping_address || 'Chưa có địa chỉ'}
                </div>
                ${order.taiXe ? `
                <div class="order-meta-item">
                    <i class="bi bi-truck"></i>
                    ${order.taiXe}${order.bienSo ? ' - ' + order.bienSo : ''}
                </div>
                ` : ''}
            </div>
            <div class="order-total">${formatCurrency(order.amount || order.sale_order_amount || 0)}</div>
            <div class="order-card-footer">
                <button class="btn btn-outline btn-sm" onclick="viewOrderDetail('${order.id}')">
                    <i class="bi bi-eye"></i> Chi tiết
                </button>
                ${state.currentDispatchTab === 'pending' ? `
                    <button class="btn btn-info btn-sm" onclick="assignDriver('${order.id}')">
                        <i class="bi bi-person-plus"></i> Gán tài xế
                    </button>
                ` : ''}
                ${state.currentDispatchTab === 'assigned' && state.user?.role === 'ADMIN' ? `
                    <button class="btn btn-success btn-sm" onclick="adminCompleteOrder('${order.id}')">
                        <i class="bi bi-check-circle"></i> Hoàn thành
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}


// === CREATE ORDER ===

async function initCreateOrder() {
    // Set default date
    const dateInput = window.$('#order-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Load suggestions
    loadSupplierSuggestions();
    loadProductSuggestions();

    state.orderProducts = [];
    renderOrderProducts();
}

async function loadSupplierSuggestions() {
    try {
        console.log('🔍 Fetching supplier suggestions...');
        const res = await api.getSuppliers();
        const suppliers = res.data || [];

        if (!Array.isArray(suppliers)) {
            console.error('❌ Suppliers is not an array:', suppliers);
            return;
        }

        // Ensure datalist exists in the DOM
        let datalist = window.$('#supplier-list');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'supplier-list';
            document.body.appendChild(datalist);
        }

        const customerInput = window.$('#order-customer');
        if (customerInput) {
            customerInput.setAttribute('list', 'supplier-list');
            customerInput.setAttribute('autocomplete', 'off');
        }

        datalist.innerHTML = suppliers.map(s =>
            `<option value="${s.name}">${s.name}</option>`
        ).join('');

        console.log(`✅ Loaded ${suppliers.length} supplier suggestions into #supplier-list`);
    } catch (e) {
        console.error('❌ Failed to load supplier suggestions:', e);
    }
}

async function loadProductSuggestions() {
    try {
        console.log('🔍 Fetching MISA product suggestions...');
        const res = await api.getMaterials();
        const products = res.data || [];

        if (!Array.isArray(products)) {
            console.error('❌ Products is not an array:', products);
            return;
        }

        // Ensure datalist exists in the DOM
        let datalist = window.$('#product-misa-list');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'product-misa-list';
            document.body.appendChild(datalist);
        }

        const prodInput = window.$('#prod-name');
        if (prodInput) {
            prodInput.setAttribute('list', 'product-misa-list');
            prodInput.setAttribute('autocomplete', 'off');
        }

        datalist.innerHTML = products.map(p =>
            `<option value="${p.name}">${p.code ? p.code + ' - ' : ''}${p.name}</option>`
        ).join('');

        console.log(`✅ Loaded ${products.length} MISA product suggestions`);
    } catch (e) {
        console.error('❌ Failed to load products suggestions:', e);
    }
}

function addOrderProduct() {
    const name = window.$('#prod-name').value.trim();
    const qty = parseInt(window.$('#prod-qty').value) || 0;

    if (!name || qty <= 0) {
        alert('Vui lòng nhập tên và số lượng sản phẩm');
        return;
    }

    state.orderProducts.push({ name, qty });

    // Clear inputs
    window.$('#prod-name').value = '';
    window.$('#prod-qty').value = '';

    renderOrderProducts();
}

function renderOrderProducts() {
    const container = window.$('#order-products-list');
    if (!container) return;

    if (state.orderProducts.length === 0) {
        container.innerHTML = `
            <div class="product-list-empty">
                <i class="bi bi-inbox"></i>
                <h4>Chưa có sản phẩm nào</h4>
                <p>Nhập thông tin sản phẩm bên dưới để thêm vào đơn hàng</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.orderProducts.map((p, i) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--body-bg); border-radius:8px; margin-bottom:8px;">
            <div>
                <strong>${p.name}</strong>
                <span style="color:var(--text-muted); margin-left:8px;">x${p.qty}</span>
            </div>
            <button class="btn btn-sm" style="color:var(--danger);" onclick="removeOrderProduct(${i})">
                <i class="bi bi-trash"></i>
            </button>
        </div>
    `).join('');
}

function removeOrderProduct(index) {
    state.orderProducts.splice(index, 1);
    renderOrderProducts();
}

async function submitOrder() {
    const date = window.$('#order-date').value;
    const customer = window.$('#order-customer').value.trim();
    const address = window.$('#order-address').value.trim();

    if (!customer || state.orderProducts.length === 0) {
        alert('Vui lòng nhập đầy đủ thông tin và thêm ít nhất 1 sản phẩm');
        return;
    }

    showLoading('Đang tạo đơn...');

    try {
        const res = await api.createImport({
            date,
            supplier: customer,
            address,
            products: state.orderProducts
        });

        hideLoading();

        if (res.success || res.data) {
            alert('Tạo đơn nhập thành công!');
            state.orderProducts = [];
            initCreateOrder();
        } else {
            alert('Lỗi: ' + (res.message || 'Không thể tạo đơn'));
        }
    } catch (e) {
        hideLoading();
        alert('Lỗi kết nối');
    }
}

// === MY ORDERS ===
async function loadMyOrders() {
    try {
        const driverName = state.user?.name || state.user?.phone || '';
        const role = state.user?.role || 'driver';
        const res = await api.getMyOrders(driverName, role);
        const orders = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);

        const delivering = orders.filter(o => o.status === 'assigned' || o.status === 'in_transit');
        const completed = orders.filter(o => o.status === 'completed');

        // Update stats with null checks
        const deliveringStat = window.$('#my-orders-delivering');
        const completedStat = window.$('#my-orders-completed');
        if (deliveringStat) deliveringStat.textContent = delivering.length;
        if (completedStat) completedStat.textContent = completed.length;

        // Render lists
        renderMyOrdersList('my-orders-delivering-list', delivering, 'delivering');
        renderMyOrdersList('my-orders-completed-list', completed, 'completed');
    } catch (e) {
        console.error('Load my orders error:', e);
    }
}

function renderMyOrdersList(containerId, orders, type) {
    const container = window.$(`#${containerId}`);
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:20px;">Không có đơn hàng</p>`;
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="order-card">
            <div class="order-card-header">
                <div>
                    <div class="order-id">#${order.orderCode || order.id}</div>
                    <div class="order-customer">${order.customerName || 'Khách hàng'}</div>
                </div>
                <span class="badge badge-${type === 'completed' ? 'completed' : 'processing'}">${type === 'completed' ? 'Hoàn thành' : 'Đang giao'}</span>
            </div>
            <div class="order-meta">
                <div class="order-meta-item">
                    <i class="bi bi-geo-alt"></i>
                    ${order.address || 'Chưa có địa chỉ'}
                </div>
                <div class="order-meta-item">
                    <i class="bi bi-calendar3"></i>
                    ${formatDate(order.orderDate || order.createdAt)}
                </div>
            </div>
            <div class="order-total">${formatCurrency(order.totalAmount || 0)}</div>
            ${type === 'delivering' ? `
                <div class="order-card-footer">
                    <button class="btn btn-success btn-sm" onclick="completeOrder('${order.id}')">
                        <i class="bi bi-check"></i> Hoàn thành
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// === ORDER HISTORY ===
async function loadOrderHistory() {
    const tbody = window.$('#history-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">Đang tải...</td></tr>';

    try {
        console.log('🔍 Loading order history...');
        const res = await api.getOrderHistory();

        // Defensive check: handle both {data:[]} and directly []
        let orders = res.data || res.orders || res.history || (Array.isArray(res) ? res : null);

        if (!orders || !Array.isArray(orders)) {
            console.error('❌ Invalid history data format:', res);
            throw new Error('Định dạng dữ liệu không hợp lệ');
        }

        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted);">Chưa có đơn hàng nào</td></tr>';
            return;
        }

        tbody.innerHTML = orders.map(order => `
            <tr>
                <td><strong>${order.orderCode || order.id || '-'}</strong></td>
                <td>${order.customerName || order.accountName || order.khach || '-'}</td>
                <td>${formatDate(order.orderDate || order.order_date || order.createdAt)}</td>
                <td>${formatCurrency(order.totalAmount || order.total_amount || 0)}</td>
                <td><span class="badge badge-${getStatusBadge(order.status)}">${getStatusText(order.status)}</span></td>
                <td>${order.driverName || order.driver_name || '-'}</td>
                <td>${(order.completedAt || order.completed_at) ? formatDate(order.completedAt || order.completed_at) : '-'}</td>
            </tr>
        `).join('');

        // Update pagination
        const total = res.total || orders.length;
        const totalPages = res.totalPages || Math.ceil(total / state.historyPerPage) || 1;
        const paginationInfo = window.$('#pagination-info');
        if (paginationInfo) {
            paginationInfo.textContent = `Trang ${state.historyPage} / ${totalPages}`;
        }
        console.log(`✅ Rendered ${orders.length} history items`);
    } catch (e) {
        console.error('❌ Order history error:', e);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--danger); padding:20px;">
            Lỗi tải dữ liệu<br><small style="font-weight:normal; color:#666;">${e.message}</small>
        </td></tr>`;
    }
}

function goToPage(direction) {
    if (direction === 'prev' && state.historyPage > 1) {
        state.historyPage--;
    } else if (direction === 'next') {
        state.historyPage++;
    }
    loadOrderHistory();
}

// === HELPERS ===
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN').format(amount) + ' VNĐ';
}

function formatCurrencyBillion(amount) {
    if (!amount || isNaN(amount)) return '0 tỷ VNĐ';
    const billions = amount / 1000000000;
    return billions.toFixed(2) + ' tỷ VNĐ';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function getStatusBadge(status) {
    const map = {
        'pending': 'pending',
        'assigned': 'processing',
        'in_transit': 'processing',
        'completed': 'completed',
        'cancelled': 'cancelled'
    };
    return map[status] || 'pending';
}

function getStatusText(status) {
    const map = {
        'pending': 'Chờ xử lý',
        'assigned': 'Đang giao',
        'in_transit': 'Đang giao',
        'completed': 'Hoàn thành',
        'cancelled': 'Đã hủy'
    };
    return map[status] || status;
}

function viewOrderDetail(orderId) {
    console.log('viewOrderDetail called with:', orderId);
    console.log('state.orders:', state.orders);

    // Find order from state - try multiple matching approaches
    const allOrders = [...(state.orders.pending || []), ...(state.orders.assigned || []), ...(state.orders.completed || [])];
    console.log('allOrders count:', allOrders.length);

    // More robust matching: try id, soDon, sale_order_no
    const order = allOrders.find(o => {
        const oIdStr = String(o.id);
        const searchIdStr = String(orderId);
        return oIdStr === searchIdStr ||
            o.id === orderId ||
            o.id === parseInt(orderId) ||
            o.soDon === orderId ||
            o.sale_order_no === orderId;
    });

    console.log('Found order:', order);

    if (!order) {
        console.error('Order not found! Available IDs:', allOrders.map(o => o.id));
        alert('Không tìm thấy đơn hàng! ID: ' + orderId);
        return;
    }

    // Build products list HTML - handle both formats
    const products = order.products || order.cart || [];
    const productsHtml = products.length > 0
        ? products.map(p => `
            <tr>
                <td>${p.name || p.productName || '-'}</td>
                <td>${p.qty || p.quantity || 0}</td>
                <td>${p.unit || '-'}</td>
                <td>${formatCurrency(p.price || p.amount || 0)}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Không có sản phẩm</td></tr>';

    // Show modal - use correct IDs matching index.html
    const modal = window.$('#modal-order-detail');
    const modalBody = window.$('#modal-order-body');
    const modalTitle = window.$('#modal-order-title');

    if (modalTitle) modalTitle.textContent = `Chi tiết đơn hàng #${order.soDon || order.sale_order_no || order.id}`;

    if (modalBody) {
        modalBody.innerHTML = `
            <div class="order-detail-grid">
                <div class="detail-row">
                    <label>Mã đơn hàng:</label>
                    <span><strong>#${order.soDon || order.sale_order_no || order.id}</strong></span>
                </div>
                <div class="detail-row">
                    <label>Khách hàng:</label>
                    <span>${order.khach || order.account_name || 'Chưa có'}</span>
                </div>
                <div class="detail-row">
                    <label>Ngày đặt:</label>
                    <span>${formatDate(order.ngay || order.sale_order_date)}</span>
                </div>
                <div class="detail-row">
                    <label>Địa chỉ:</label>
                    <span>${order.diaChi || order.shipping_address || 'Chưa có địa chỉ'}</span>
                </div>
                <div class="detail-row">
                    <label>Trạng thái:</label>
                    <span class="badge badge-${getStatusBadge(order.status)}">${getStatusText(order.status)}</span>
                </div>
                <div class="detail-row">
                    <label>Tài xế:</label>
                    <span>${order.taiXe || order.driver || 'Chưa phân công'}</span>
                </div>
                <div class="detail-row">
                    <label>Biển số xe:</label>
                    <span>${order.bienSo || order.plate || 'Chưa có'}</span>
                </div>
                <div class="detail-row">
                    <label>Tổng tiền:</label>
                    <span style="color:var(--primary); font-weight:600;">${formatCurrency(order.amount || order.sale_order_amount || 0)}</span>
                </div>
            </div>
            
            <h4 style="margin: 24px 0 12px; font-size:14px; color:var(--text-secondary);">Danh sách sản phẩm</h4>
            <table class="data-table" style="width:100%;">
                <thead>
                    <tr>
                        <th>Sản phẩm</th>
                        <th>SL</th>
                        <th>Đơn vị</th>
                        <th>Giá</th>
                    </tr>
                </thead>
                <tbody>
                    ${productsHtml}
                </tbody>
            </table>
            
            ${(() => {
                // Safe parse local_items - might be JSON string from DB
                let localItems = order.local_items || [];
                if (typeof localItems === 'string') {
                    try { localItems = JSON.parse(localItems); } catch (e) { localItems = []; }
                }
                if (!Array.isArray(localItems)) localItems = [];

                return localItems.length > 0 ? `
            <!-- MẶT HÀNG PHỤ (Local only - NOT in CRM) -->
            <h4 style="margin: 24px 0 12px; font-size:14px; color:var(--warning);">
                <i class="bi bi-box" style="margin-right:6px;"></i> Mặt hàng phụ (Vỏ)
                <span style="font-weight:normal; font-size:12px; color:var(--text-muted);"> - Chỉ lưu nội bộ</span>
            </h4>
            <table class="data-table" style="width:100%; background:#fefce8; border:1px solid #fef08a;">
                <thead>
                    <tr style="background:#fef08a;">
                        <th style="text-align:left;">Mặt hàng</th>
                        <th style="text-align:right; width:80px;">Số lượng</th>
                    </tr>
                </thead>
                <tbody>
                    ${localItems.map(item => `
                        <tr>
                            <td>📦 ${item.name || item.product || '-'}</td>
                            <td style="text-align:right; font-weight:600;">${item.qty || item.quantity || 0}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : '';
            })()}
            
            ${order.note ? `<div style="margin-top:16px; padding:12px; background:var(--body-bg); border-radius:8px;"><strong>Ghi chú:</strong> ${order.note}</div>` : ''}
            
            <!-- CHAT SECTION -->
            <div style="margin-top:24px; border-top:1px solid var(--border); padding-top:16px;">
                <h4 style="margin: 0 0 12px; font-size:14px; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
                    <span><i class="bi bi-chat-dots" style="margin-right:6px;"></i> Tin nhắn</span>
                    <button class="btn btn-outline btn-sm" onclick="loadOrderChat('${order.soDon || order.sale_order_no || order.id}')" style="font-size:12px;">
                        <i class="bi bi-arrow-clockwise"></i> Refresh
                    </button>
                </h4>
                <div id="chatMessages" style="max-height:200px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:12px; background:var(--body-bg); margin-bottom:12px;">
                    <div style="text-align:center; color:var(--text-muted); padding:20px;"><i class="bi bi-chat-dots"></i> Nhấn Refresh để tải tin nhắn</div>
                </div>
                
                <!-- Chat Input -->
                <div style="display:flex; gap:8px; align-items:flex-end;">
                    <div style="flex:1;">
                        <input type="text" id="chatInput" class="form-control" placeholder="Nhập tin nhắn..." onkeydown="if(event.key==='Enter') sendChatMessage()">
                    </div>
                    <label class="btn btn-outline" style="cursor:pointer; padding:8px 12px;">
                        <i class="bi bi-image"></i>
                        <input type="file" id="chatImageInput" accept="image/*" onchange="previewChatImage(this)" style="display:none;">
                    </label>
                    <button class="btn btn-primary" onclick="sendChatMessage()" style="padding:8px 16px;">
                        <i class="bi bi-send"></i>
                    </button>
                </div>
                
                <!-- Image Preview -->
                <div id="chatImagePreview" class="hidden" style="margin-top:8px; position:relative; display:inline-block;">
                    <img id="chatImageThumb" style="max-width:100px; border-radius:8px; border:2px solid var(--primary);">
                    <button onclick="clearChatImage()" style="position:absolute; top:-8px; right:-8px; background:var(--danger); color:white; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer; font-size:12px;">×</button>
                </div>
            </div>
            
            <!--ACTION BUTTONS-- >
        <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border); display:flex; gap:8px; flex-wrap:wrap;">
            ${order.status === 'Mới' || order.status === 'Chưa thực hiện' ? `
                    <button class="btn btn-primary" onclick="closeOrderModal(); assignDriver('${order.id}')">
                        <i class="bi bi-person-plus"></i> Phân công tài xế
                    </button>
                ` : ''}
            ${(order.status === 'Đang thực hiện' || order.status === 'Chờ giao' || order.status === 'assigned') && state.user?.role === 'ADMIN' ? `
                    <button class="btn btn-success" onclick="adminCompleteOrder('${order.id}')">
                        <i class="bi bi-check-circle"></i> Admin hoàn thành
                    </button>
                ` : ''}
            ${state.user?.role === 'ADMIN' ? `
                    <button class="btn btn-warning" onclick="closeOrderModal(); editOrder('${order.id}')">
                        <i class="bi bi-pencil"></i> Chỉnh sửa
                    </button>
                ` : ''}
            <button class="btn btn-outline" onclick="closeOrderModal()">
                <i class="bi bi-x-lg"></i> Đóng
            </button>
        </div>

    `;

        // Initialize chat auto-refresh
        currentChatOrderId = order.soDon || order.sale_order_no || order.id;
        startChatRefresh();
    }

    if (modal) modal.classList.remove('hidden');
}

function closeOrderModal(event) {
    // If called from overlay click, check if clicked on overlay itself
    if (event && event.target && !event.target.closest('.modal-content')) {
        // Clicked on overlay, close modal
    } else if (event) {
        // Clicked inside modal content, don't close
        return;
    }

    // Stop chat refresh
    stopChatRefresh();

    // Hide modal
    const modal = window.$('#modal-order-detail');
    if (modal) modal.classList.add('hidden');
}


function assignDriver(orderId) {

    console.log('assignDriver called with:', orderId);

    // Find order from pending - robust matching
    const order = (state.orders.pending || []).find(o => {
        const oIdStr = String(o.id);
        const searchIdStr = String(orderId);
        return oIdStr === searchIdStr ||
            o.id === orderId ||
            o.id === parseInt(orderId) ||
            o.soDon === orderId ||
            o.sale_order_no === orderId;
    });

    console.log('Found order for assignment:', order);

    if (!order) {
        console.error('Order not found for assignment!');
        alert('Không tìm thấy đơn hàng!');
        return;
    }

    // Store current order ID for assignment
    state.currentAssignOrderId = orderId;

    // Calculate total qty from products
    const products = order.products || order.chiTiet || order.cart || [];
    const totalQty = products.reduce((sum, p) => sum + (parseFloat(p.qty || p.quantity || 0)), 0);
    state.currentOrderTotalQty = totalQty;

    // Init driver assignments array
    state.driverAssignments = [];

    // Build driver select options with plate data
    const driverOptions = (state.drivers || []).map(d =>
        `< option value = "${d.name}" data - plate="${d.plate || ''}" > ${d.name}${d.plate ? ' - ' + d.plate : ''}</option > `
    ).join('');

    // Show modal
    const modal = window.$('#modal-order-detail');
    const modalBody = window.$('#modal-order-body');
    const modalTitle = window.$('#modal-order-title');

    if (modalTitle) modalTitle.textContent = `Phân công tài xế - Đơn #${order.soDon || order.sale_order_no || order.id} `;

    if (modalBody) {
        modalBody.innerHTML = `
        < div class="order-detail-grid" style = "margin-bottom:16px;" >
                <div class="detail-row">
                    <label>Khách hàng:</label>
                    <span>${order.khach || order.account_name || 'Chưa có'}</span>
                </div>
                <div class="detail-row">
                    <label>Địa chỉ:</label>
                    <span>${order.diaChi || order.shipping_address || 'Chưa có'}</span>
                </div>
                <div class="detail-row">
                    <label>Tổng SL:</label>
                    <span style="color:var(--primary); font-weight:600;">${formatNumber(totalQty)} kg</span>
                </div>
            </div >
            
            < !--Multi - Driver Assignment Section-- >
            <div style="background:var(--body-bg); padding:16px; border-radius:8px; margin-bottom:16px;">
                <h4 style="margin:0 0 12px; font-size:14px;">Phân công tài xế</h4>
                
                <!-- Driver List -->
                <div id="driver-assignments-list" style="margin-bottom:16px;"></div>
                
                <!-- Add Driver Form -->
                <div style="border:1px dashed var(--border); padding:12px; border-radius:8px;">
                    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
                        <div style="flex:1; min-width:150px;">
                            <label class="form-label" style="font-size:12px;">Chọn tài xế</label>
                            <select id="new-driver-select" class="form-control" onchange="onNewDriverChange(this)">
                                <option value="">-- Chọn tài xế --</option>
                                ${driverOptions}
                                <option value="__EXTERNAL__">➕ Tài xế ngoài...</option>
                            </select>
                        </div>
                        <div id="external-driver-fields" class="hidden" style="display:flex; gap:8px; flex:2;">
                            <div style="flex:1;">
                                <label class="form-label" style="font-size:12px;">Tên tài xế ngoài</label>
                                <input type="text" id="external-driver-name" class="form-control" placeholder="Nhập tên...">
                            </div>
                            <div style="flex:1;">
                                <label class="form-label" style="font-size:12px;">Biển số xe</label>
                                <input type="text" id="external-driver-plate" class="form-control" placeholder="Biển số...">
                            </div>
                        </div>
                        <div style="width:100px;">
                            <label class="form-label" style="font-size:12px;">Số lượng (kg)</label>
                            <input type="number" id="new-driver-qty" class="form-control" placeholder="SL" value="">
                        </div>
                        <button class="btn btn-primary" onclick="addDriverAssignmentRow()" style="height:38px;">
                            <i class="bi bi-plus"></i> Thêm
                        </button>
                    </div>
                </div>
                
                <!-- Summary -->
                <div id="qty-summary" style="margin-top:12px; padding:8px; background:var(--card-bg); border-radius:4px; font-size:13px;"></div>
            </div>
            
            <div style="display:flex; gap:12px; margin-top:16px;">
                <button class="btn btn-outline" onclick="closeOrderModal()">Hủy</button>
                <button class="btn btn-success" onclick="submitMultiDriverAssignment()">
                    <i class="bi bi-check-all"></i> Xác nhận phân công
                </button>
            </div>
    `;

        // Render summary
        updateQtySummaryDisplay();
    }

    if (modal) modal.classList.remove('hidden');
}

// Handle driver select change for external driver
function onNewDriverChange(selectEl) {
    const externalFields = window.$('#external-driver-fields');
    if (selectEl.value === '__EXTERNAL__') {
        externalFields?.classList.remove('hidden');
        externalFields.style.display = 'flex';
    } else {
        externalFields?.classList.add('hidden');
        externalFields.style.display = 'none';
        // Auto-fill plate
        const selectedOption = selectEl.options[selectEl.selectedIndex];
        const plate = selectedOption?.getAttribute('data-plate') || '';
        const externalPlate = window.$('#external-driver-plate');
        if (externalPlate) externalPlate.value = plate;
    }
}

// Add driver to assignment list
function addDriverAssignmentRow() {
    const select = window.$('#new-driver-select');
    const qtyInput = window.$('#new-driver-qty');
    const externalName = window.$('#external-driver-name');
    const externalPlate = window.$('#external-driver-plate');

    let driverName = select?.value;
    let plate = '';

    // Handle external driver
    if (driverName === '__EXTERNAL__') {
        driverName = externalName?.value?.trim();
        plate = externalPlate?.value?.trim() || '';
        if (!driverName) {
            alert('Vui lòng nhập tên tài xế ngoài!');
            return;
        }
    } else {
        if (!driverName) {
            alert('Vui lòng chọn tài xế!');
            return;
        }
        const selectedOption = select.options[select.selectedIndex];
        plate = selectedOption?.getAttribute('data-plate') || '';
    }

    const qty = parseFloat(qtyInput?.value) || 0;
    if (qty <= 0) {
        alert('Vui lòng nhập số lượng hợp lệ!');
        return;
    }

    // Add to list
    state.driverAssignments.push({
        driver_name: driverName,
        plate: plate,
        qty: qty,
        is_external: select?.value === '__EXTERNAL__'
    });

    // Reset form
    select.value = '';
    qtyInput.value = '';
    if (externalName) externalName.value = '';
    if (externalPlate) externalPlate.value = '';
    window.$('#external-driver-fields')?.classList.add('hidden');

    renderDriverAssignmentsList();
    updateQtySummaryDisplay();
}

// Remove driver from list
function removeDriverAssignmentRow(idx) {
    state.driverAssignments.splice(idx, 1);
    renderDriverAssignmentsList();
    updateQtySummaryDisplay();
}

// Render driver assignments list
function renderDriverAssignmentsList() {
    const container = window.$('#driver-assignments-list');
    if (!container) return;

    if (!state.driverAssignments.length) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center; margin:16px 0;">Chưa có tài xế được phân công</p>';
        return;
    }

    container.innerHTML = state.driverAssignments.map((a, idx) => `
        < div style = "display:flex; align-items:center; gap:12px; padding:10px; background:var(--card-bg); border-radius:6px; margin-bottom:8px; border-left:3px solid ${a.is_external ? 'var(--warning)' : 'var(--primary)'};" >
            <div style="flex:1;">
                <strong>${a.driver_name}</strong>
                ${a.is_external ? '<span style="font-size:11px; background:var(--warning); color:#000; padding:2px 6px; border-radius:4px; margin-left:6px;">Tài xế ngoài</span>' : ''}
                <br><small style="color:var(--text-muted);">🚗 ${a.plate || 'Chưa có biển số'}</small>
            </div>
            <div style="font-weight:600; color:var(--primary);">${formatNumber(a.qty)} kg</div>
            <button onclick="removeDriverAssignmentRow(${idx})" style="background:var(--danger); color:white; border:none; border-radius:4px; width:28px; height:28px; cursor:pointer;">
                <i class="bi bi-x"></i>
            </button>
        </div >
        `).join('');
}

// Update qty summary
function updateQtySummaryDisplay() {
    const container = window.$('#qty-summary');
    if (!container) return;

    const totalAssigned = state.driverAssignments.reduce((sum, a) => sum + a.qty, 0);
    const totalOrder = state.currentOrderTotalQty || 0;
    const remaining = totalOrder - totalAssigned;

    const color = remaining === 0 ? 'var(--success)' : (remaining < 0 ? 'var(--danger)' : 'var(--warning)');

    container.innerHTML = `
        < div style = "display:flex; justify-content:space-between;" >
            <span>Tổng đơn hàng:</span>
            <strong>${formatNumber(totalOrder)} kg</strong>
        </div >
        <div style="display:flex; justify-content:space-between;">
            <span>Đã phân công:</span>
            <strong>${formatNumber(totalAssigned)} kg</strong>
        </div>
        <div style="display:flex; justify-content:space-between; color:${color};">
            <span>Còn lại:</span>
            <strong>${formatNumber(remaining)} kg</strong>
        </div>
    `;
}

// Submit multi-driver assignment
async function submitMultiDriverAssignment() {
    if (!state.driverAssignments.length) {
        alert('Vui lòng thêm ít nhất 1 tài xế!');
        return;
    }

    const totalAssigned = state.driverAssignments.reduce((sum, a) => sum + a.qty, 0);
    const totalOrder = state.currentOrderTotalQty || 0;

    if (Math.abs(totalAssigned - totalOrder) > 0.5) {
        if (!confirm(`Tổng số lượng phân(${formatNumber(totalAssigned)} kg) khác tổng đơn(${formatNumber(totalOrder)} kg).Tiếp tục ? `)) {
            return;
        }
    }

    showLoading('Đang phân công tài xế...');

    try {
        const orderId = state.currentAssignOrderId;
        const res = await fetch(`/ api / orders / ${orderId}/assign-multi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignments: state.driverAssignments })
        });

        const data = await res.json();
        hideLoading();

        if (!data.error) {
            alert(data.msg || 'Đã phân công thành công!');
            closeOrderModal();
            loadOrders();
        } else {
            alert('Lỗi: ' + (data.msg || 'Không thể phân công'));
        }
    } catch (e) {
        hideLoading();
        alert('Lỗi kết nối: ' + e.message);
    }
}


// Auto-fill plate when selecting driver
function onDriverChange(selectEl) {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const plate = selectedOption?.getAttribute('data-plate') || '';
    const plateInput = window.$('#assign-plate');
    if (plateInput) {
        plateInput.value = plate;
    }
}

async function confirmAssignDriver() {
    const orderId = state.currentAssignOrderId;
    const driverSelect = window.$('#assign-driver-select');
    const plateInput = window.$('#assign-plate');
    const noteInput = window.$('#assign-note');

    const driverName = driverSelect?.value;
    const plate = plateInput?.value?.trim() || '';
    const note = noteInput?.value?.trim() || '';

    if (!driverName) {
        alert('Vui lòng chọn tài xế!');
        return;
    }

    showLoading('Đang gán tài xế...');

    try {
        const res = await api.assignOrder(orderId, driverName, plate, note);
        hideLoading();

        // Fix: API returns { error: false, msg: '...' }, not { success: true }
        if (!res.error) {
            alert(res.msg || 'Đã gán tài xế thành công!');
            closeOrderModal();
            loadOrders();
        } else {
            alert('Lỗi: ' + (res.msg || res.message || 'Không thể gán tài xế'));
        }
    } catch (e) {
        hideLoading();
        console.error('Assign driver error:', e);
        alert('Lỗi kết nối: ' + e.message);
    }
}


function completeOrder(orderId) {
    // Open delivery modal instead of directly completing
    openDeliveryModal(orderId);
}

function toggleUserMenu(event) {
    if (event) event.stopPropagation();
    const menu = window.$('#user-menu');
    if (!menu) return;

    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.classList.add('hidden');
                document.removeEventListener('click', closeMenu);
            }
        };
        document.addEventListener('click', closeMenu);
    } else {
        menu.classList.add('hidden');
    }
}

window.toggleUserMenu = toggleUserMenu;

// === DELIVERY MODAL (HOÀN THÀNH ĐƠN) ===

function openDeliveryModal(orderId) {
    // Search in all lists with robust matching
    const allOrders = [...(state.orders.pending || []), ...(state.orders.assigned || []), ...(state.orders.completed || [])];

    const findOrder = (list) => list.find(o => {
        const oIdStr = String(o.id);
        const searchIdStr = String(orderId);
        return oIdStr === searchIdStr ||
            o.id === orderId ||
            o.id === parseInt(orderId) ||
            o.soDon === orderId ||
            o.sale_order_no === orderId;
    });

    const order = findOrder(allOrders) || findOrder(state.myOrders || []);

    if (!order) {
        console.error('Order not found for delivery modal:', orderId);
        alert('Không tìm thấy đơn hàng!');
        return;
    }

    state.currentDeliveryOrder = order;

    // Initialize Cart from Order Products
    state.deliveryCart = (order.products || []).map(p => ({
        product: p.name || p.productName,
        code: p.code || '',
        planQty: p.qty || p.quantity,
        qty: p.qty || p.quantity,
        unit: p.unit || 'Kg',
        density: p.density || 1,
        isShell: false,
        note: ''
    }));

    state.selectedImages = [];

    // Render modal content - use correct IDs
    const modal = window.$('#modal-order-detail');
    const modalBody = window.$('#modal-order-body');
    const modalTitle = window.$('#modal-order-title');

    const isCompleted = order.status === 'completed';
    if (modalTitle) {
        modalTitle.textContent = isCompleted
            ? 'Chỉnh sửa đơn đã giao'
            : 'Xác nhận giao hàng';
    }

    if (modalBody) {
        modalBody.innerHTML = `
            <div class="order-detail-grid" style="margin-bottom:20px;">
                <div class="detail-row">
                    <label>Mã đơn:</label>
                    <span><strong>#${order.soDon || order.sale_order_no || order.id}</strong></span>
                </div>
                <div class="detail-row">
                    <label>Khách hàng:</label>
                    <span>${order.khach || order.account_name || '-'}</span>
                </div>
            </div>
            
            <h4 style="margin:20px 0 12px; font-size:14px; color:var(--text-secondary);">Sản phẩm giao</h4>
            <div id="delivery-cart-list"></div>
            
            <div class="form-group" style="margin-top:20px;">
                <label class="form-label">Kho xuất</label>
                <div style="display:flex; gap:16px;">
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="radio" name="del-wh" value="LT1" checked> Kho LT1
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="radio" name="del-wh" value="LT2"> Kho LT2
                    </label>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Ảnh giao hàng</label>
                <input type="file" id="inp-del-img" accept="image/*" multiple 
                    onchange="handleImageSelect(this)" class="form-control">
                <div id="img-preview-area" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;"></div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Ghi chú</label>
                <textarea id="inp-del-note" class="form-control" rows="2" placeholder="Ghi chú khi giao...">${order.note || ''}</textarea>
            </div>
            
            <div style="display:flex; gap:12px; margin-top:24px;">
                <button class="btn btn-outline" onclick="closeDeliveryModal()">Hủy</button>
                <button class="btn btn-success" id="btn-submit-delivery" onclick="submitDelivery()">
                    <i class="bi bi-check-lg"></i> ${isCompleted ? 'Cập nhật' : 'Hoàn thành'}
                </button>
            </div>
        `;
    }

    renderDeliveryCart();
    if (modal) modal.classList.remove('hidden');
}

function closeDeliveryModal() {
    hide('modal-order-detail');
    state.currentDeliveryOrder = null;
    state.deliveryCart = [];
    state.selectedImages = [];
}

function renderDeliveryCart() {
    const list = window.$('#delivery-cart-list');
    if (!list) return;

    if (!state.deliveryCart || !state.deliveryCart.length) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Giỏ hàng trống</div>';
        return;
    }

    list.innerHTML = state.deliveryCart.map((item, idx) => `
        <div style="background:var(--body-bg); padding:12px; border-radius:8px; margin-bottom:8px; border-left:3px solid ${item.isShell ? 'var(--warning)' : 'var(--primary)'};">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-weight:600; color:var(--primary);">${item.product}</div>
                ${item.isShell
            ? '<button class="btn btn-sm" style="color:var(--danger); padding:4px;" onclick="removeCartItem(' + idx + ')"><i class="bi bi-x-lg"></i></button>'
            : '<span class="badge badge-completed" style="font-size:10px;"><i class="bi bi-lock"></i> CRM</span>'
        }
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
                <div>
                    <div style="font-size:11px; color:var(--text-muted);">Yêu cầu</div>
                    <div style="font-weight:600;">${item.planQty || 0} ${item.unit}</div>
                </div>
                <div>
                    <div style="font-size:11px; color:var(--text-muted);">Thực tế</div>
                    <input type="number" class="form-control" style="padding:6px 8px; font-size:13px;"
                        value="${item.qty}" onchange="updateCartQty(${idx}, this.value)">
                </div>
                <div>
                    <div style="font-size:11px; color:var(--text-muted);">Ghi chú</div>
                    <input type="text" class="form-control" style="padding:6px 8px; font-size:13px;"
                        placeholder="..." value="${item.note || ''}" onchange="updateCartNote(${idx}, this.value)">
                </div>
            </div>
        </div>
    `).join('');
}

function updateCartQty(idx, val) {
    if (state.deliveryCart && state.deliveryCart[idx]) {
        state.deliveryCart[idx].qty = Number(val);
    }
}

function updateCartNote(idx, val) {
    if (state.deliveryCart && state.deliveryCart[idx]) {
        state.deliveryCart[idx].note = val;
    }
}

function removeCartItem(idx) {
    const item = state.deliveryCart[idx];
    if (!item || !item.isShell) {
        alert('Không thể xóa hàng chính từ CRM!');
        return;
    }
    state.deliveryCart.splice(idx, 1);
    renderDeliveryCart();
}

function handleImageSelect(input) {
    const files = input.files;
    if (!files || !files.length) return;

    const previewArea = window.$('#img-preview-area');
    if (!previewArea) return;

    state.selectedImages = state.selectedImages || [];

    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            state.selectedImages.push(e.target.result);

            const imgWrapper = document.createElement('div');
            imgWrapper.style.cssText = 'position:relative; width:80px; height:80px;';
            imgWrapper.innerHTML = `
                <img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">
                <button type="button" onclick="this.parentElement.remove()" 
                    style="position:absolute; top:-6px; right:-6px; width:20px; height:20px; border-radius:50%; background:var(--danger); color:white; border:none; cursor:pointer; font-size:12px;">×</button>
            `;
            previewArea.appendChild(imgWrapper);
        };
        reader.readAsDataURL(file);
    }
}

async function submitDelivery() {
    if (!state.deliveryCart || !state.deliveryCart.length) {
        alert('Giỏ hàng trống!');
        return;
    }

    if (!state.selectedImages || !state.selectedImages.length) {
        if (!confirm('Cảnh báo: Chưa có ảnh chứng minh. Tiếp tục?')) return;
    }

    const warehouseGroup = document.getElementsByName('del-wh');
    let warehouse = 'LT1';
    for (const r of warehouseGroup) if (r.checked) warehouse = r.value;

    const noteEl = window.$('#inp-del-note');
    const note = noteEl?.value || '';
    const order = state.currentDeliveryOrder;

    if (!order) {
        alert('Không tìm thấy đơn hàng!');
        return;
    }

    const payload = {
        type: order.type || 'EXPORT',
        warehouse: warehouse,
        partner: order.customerName || order.khach,
        driver_name: order.driverName || order.taiXe || state.user?.name,
        plate: order.plate || order.bienSo || '',
        note: note,
        sender: state.user?.name,
        cart: state.deliveryCart.map(i => ({
            product: { name: i.product, code: i.code },
            weight_kg: i.qty,
            unit: i.unit,
            density: i.density,
            isShell: i.isShell,
            note: i.note
        })),
        images: state.selectedImages || []
    };

    showLoading('Đang xử lý...');

    try {
        const res = await api.completeOrder(order.id, payload);
        hideLoading();

        if (res.error) {
            alert('Lỗi: ' + (res.msg || res.message));
        } else {
            alert(res.msg || 'Đã hoàn thành đơn hàng!');
            closeDeliveryModal();
            loadOrders();
        }
    } catch (e) {
        hideLoading();
        console.error('Submit delivery error:', e);
        alert('Lỗi kết nối: ' + e.message);
    }
}

// === START ORDER (DRIVER) ===
async function startOrder(orderId) {
    if (!confirm('Xác nhận nhận đơn này?')) return;

    showLoading('Đang cập nhật...');

    try {
        const res = await api.startOrder(orderId);
        hideLoading();
        alert(res.msg || 'Đã nhận đơn!');
        loadMyOrders();
    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}

// ===============================================
// ORDER CHAT SYSTEM
// ===============================================

let currentChatOrderId = null;
let chatRefreshInterval = null;
let pendingChatImage = null;

async function loadOrderChat(orderId) {
    currentChatOrderId = orderId;
    const container = document.getElementById('chatMessages');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;"><i class="bi bi-chat-dots"></i> Đang tải...</div>';

    try {
        const chatRoomId = String(orderId);
        const res = await fetch(`/api/chat/${encodeURIComponent(chatRoomId)}/messages`);
        const data = await res.json();

        if (data.error) {
            container.innerHTML = '<div style="color:var(--danger); padding:10px;">Lỗi tải tin nhắn</div>';
            return;
        }

        if (!data.messages || data.messages.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;"><i class="bi bi-chat-dots"></i> Chưa có tin nhắn</div>';
            return;
        }

        container.innerHTML = data.messages.map(msg => {
            const isMe = msg.sender_name === state.user?.name;
            const time = new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const roleColor = msg.sender_role === 'DRIVER' ? 'success' : 'primary';

            const imageHtml = msg.image
                ? `<img src="${msg.image}" style="max-width:150px; cursor:pointer; border-radius:8px; margin-top:8px;" onclick="showChatImage('${msg.image.replace(/'/g, "\\'")}')">`
                : '';

            return `
                <div class="chat-msg ${isMe ? 'chat-me' : 'chat-other'}" style="margin-bottom:12px; ${isMe ? 'text-align:right;' : ''}">
                    <div style="font-size:12px; margin-bottom:4px;">
                        <span class="badge badge-${roleColor}" style="font-size:10px;">${msg.sender_role}</span>
                        <span style="color:var(--text-muted);">${msg.sender_name}</span>
                    </div>
                    <div style="display:inline-block; padding:10px 14px; border-radius:12px; max-width:80%; ${isMe ? 'background:var(--primary); color:white;' : 'background:var(--surface); border:1px solid var(--border);'}">
                        ${msg.message || ''}
                        ${imageHtml}
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${time}</div>
                </div>
            `;
        }).join('');

        container.scrollTop = container.scrollHeight;

    } catch (e) {
        container.innerHTML = '<div style="color:var(--danger); padding:10px;">Lỗi kết nối</div>';
    }
}

async function sendChatMessage() {
    if (!currentChatOrderId) return;

    const input = document.getElementById('chatInput');
    const message = input?.value?.trim();
    const image = pendingChatImage;

    if (!message && !image) return;

    if (input) input.disabled = true;

    try {
        const chatRoomId = String(currentChatOrderId);
        const res = await fetch(`/api/chat/${encodeURIComponent(chatRoomId)}/messages`, {
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
        if (input) input.disabled = false;

        if (!data.error) {
            if (input) input.value = '';
            clearChatImage();
            loadOrderChat(currentChatOrderId);
        } else {
            alert('Lỗi gửi tin: ' + data.message);
        }

    } catch (e) {
        if (input) input.disabled = false;
        alert('Lỗi kết nối');
    }
}

function previewChatImage(input) {
    if (!input.files || !input.files[0]) return;

    const reader = new FileReader();
    reader.onload = (e) => {
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

            const thumb = document.getElementById('chatImageThumb');
            const preview = document.getElementById('chatImagePreview');
            if (thumb) thumb.src = pendingChatImage;
            if (preview) preview.classList.remove('hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
}

function clearChatImage() {
    pendingChatImage = null;
    const inputEl = document.getElementById('chatImageInput');
    const previewEl = document.getElementById('chatImagePreview');
    if (inputEl) inputEl.value = '';
    if (previewEl) previewEl.classList.add('hidden');
}

function showChatImage(src) {
    const viewer = document.getElementById('modal-image-viewer');
    const viewImg = document.getElementById('viewer-img');
    if (viewImg) viewImg.src = src;
    if (viewer) viewer.classList.remove('hidden');
}

function closeChatImageViewer() {
    const viewer = document.getElementById('modal-image-viewer');
    if (viewer) viewer.classList.add('hidden');
}

function startChatRefresh() {
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(() => {
        if (currentChatOrderId) {
            loadOrderChat(currentChatOrderId);
        }
    }, 10000);
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
// MULTI-DRIVER ASSIGNMENT
// ===============================================

let driverAssignments = [];
let currentOrderTotalQty = 0;
let currentModalOrderId = null;

function initDriverAssignments(order) {
    driverAssignments = [];
    currentOrderTotalQty = (order.products || order.cart || []).reduce((sum, p) => sum + Number(p.qty || p.quantity || 0), 0);

    if (order.taiXe || order.driver) {
        driverAssignments.push({
            driver_name: order.taiXe || order.driver,
            plate: order.bienSo || order.plate || '',
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
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:12px;">Chưa có tài xế nào</div>';
        return;
    }

    container.innerHTML = driverAssignments.map((a, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface); padding:10px; border-radius:8px; border:1px solid var(--border); margin-bottom:8px;">
            <div>
                <span class="badge badge-${a.type === 'external' ? 'secondary' : 'primary'}" style="font-size:10px; margin-right:6px;">${a.type === 'external' ? 'Ngoài' : 'Nội bộ'}</span>
                <strong>${a.driver_name}</strong>
                <span style="color:var(--text-muted); font-size:12px;">(${a.plate})</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="badge badge-success">${a.qty} kg</span>
                <button class="btn btn-outline btn-sm" onclick="removeDriverAssignment(${idx})" style="padding:4px 8px;">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function updateQtySummary() {
    const totalAssigned = driverAssignments.reduce((sum, a) => sum + Number(a.qty || 0), 0);
    const remaining = currentOrderTotalQty - totalAssigned;

    const totalEl = document.getElementById('totalCrmQty');
    const assignedEl = document.getElementById('totalAssignedQty');
    const remainingEl = document.getElementById('remainingQty');

    if (totalEl) totalEl.textContent = currentOrderTotalQty + ' kg';
    if (assignedEl) assignedEl.textContent = totalAssigned + ' kg';
    if (remainingEl) {
        remainingEl.textContent = remaining + ' kg';
        remainingEl.style.color = remaining === 0 ? 'var(--success)' : 'var(--danger)';
    }
}

function addDriverAssignment() {
    const sel = document.getElementById('modal_drv_select');
    const qtyInput = document.getElementById('modal_drv_qty');
    const qty = Number(qtyInput?.value);

    if (!qty || qty <= 0) {
        alert('Nhập số lượng hợp lệ!');
        return;
    }

    let name, plate, type = 'internal';

    if (sel?.value === 'EXTERNAL') {
        name = document.getElementById('modal_ext_name')?.value?.trim();
        plate = document.getElementById('modal_ext_plate')?.value?.trim();
        type = 'external';
        if (!name || !plate) {
            alert('Vui lòng nhập Tên và Biển số xe ngoài!');
            return;
        }
    } else if (sel?.value) {
        [name, plate] = sel.value.split('|');
    } else {
        alert('Vui lòng chọn tài xế!');
        return;
    }

    const note = document.getElementById('modal_note')?.value?.trim() || '';

    driverAssignments.push({
        driver_name: name,
        plate: plate || '',
        qty: qty,
        type: type,
        note: note
    });

    // Reset form
    if (sel) sel.value = '';
    if (qtyInput) qtyInput.value = '';
    const noteEl = document.getElementById('modal_note');
    if (noteEl) noteEl.value = '';
    const extDiv = document.getElementById('modal_ext_drv');
    if (extDiv) extDiv.classList.add('hidden');

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

    if (!currentModalOrderId) return;

    showLoading('Đang phân công...');

    try {
        const res = await fetch(`/api/orders/${currentModalOrderId}/assign-multi`, {
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
            closeOrderModal();
            loadOrders();
        }

    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}

function toggleExternalDriverInput() {
    const sel = document.getElementById('modal_drv_select');
    const extDiv = document.getElementById('modal_ext_drv');
    if (sel?.value === 'EXTERNAL') {
        extDiv?.classList.remove('hidden');
    } else {
        extDiv?.classList.add('hidden');
    }
}

// ===============================================
// EXTRA ITEM MANAGEMENT (Phụ kiện)
// ===============================================

function addExtraItem() {
    const nameEl = window.$('#extra-prod-name');
    const qtyEl = window.$('#extra-prod-qty');

    const name = nameEl?.value;
    const qty = Number(qtyEl?.value);

    if (!name || !qty) {
        alert('Vui lòng chọn hàng và nhập số lượng!');
        return;
    }

    state.deliveryCart.push({
        product: name,
        code: '',
        planQty: 0,
        qty: qty,
        unit: 'Cái',
        density: 1,
        isShell: true,
        note: 'Bổ sung'
    });

    if (nameEl) nameEl.value = '';
    if (qtyEl) qtyEl.value = '';
    renderDeliveryCart();
}

// ===============================================
// ADMIN COMPLETE ORDER
// ===============================================

async function adminCompleteOrder(orderId) {
    // Find order from assigned
    const order = (state.orders.assigned || []).find(o =>
        o.id == orderId || o.soDon == orderId || o.sale_order_no == orderId
    );

    if (!order) {
        alert('Không tìm thấy đơn hàng!');
        return;
    }

    if (!confirm(`ADMIN: Xác nhận hoàn thành đơn #${order.soDon || order.sale_order_no || order.id}?`)) {
        return;
    }

    showLoading('Đang hoàn thành đơn...');
    try {
        const res = await api.completeOrder(orderId, {
            products: order.products || order.chiTiet || [],
            delivery_note: 'Admin hoàn thành',
            admin_completed: true
        });
        hideLoading();

        if (res.error) {
            alert('Lỗi: ' + (res.msg || 'Không thể hoàn thành đơn'));
            return;
        }

        alert(res.msg || 'Đã hoàn thành đơn hàng!');
        loadOrders();
    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}

// ===============================================
// EDIT ORDER
// ===============================================

function editOrder(orderId) {
    // Find order from any state
    const allOrders = [
        ...(state.orders.pending || []),
        ...(state.orders.assigned || []),
        ...(state.orders.completed || [])
    ];
    const order = allOrders.find(o =>
        o.id == orderId || o.soDon == orderId || o.sale_order_no == orderId
    );

    if (!order) {
        alert('Không tìm thấy đơn hàng!');
        return;
    }

    // Store current order for editing
    state.currentEditOrderId = orderId;

    const products = order.products || order.chiTiet || [];
    const productsHtml = products.length > 0
        ? products.map((p, idx) => `
            <tr>
                <td>${p.name || p.product || '-'}</td>
                <td>
                    <input type="number" class="form-control form-control-sm edit-product-qty" 
                           data-idx="${idx}" value="${p.qty || p.quantity || 0}" style="width:80px;">
                </td>
                <td>${p.unit || '-'}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="3">Không có sản phẩm</td></tr>';

    const modal = window.$('#modal-order-detail');
    const modalBody = window.$('#modal-order-body');
    const modalTitle = window.$('#modal-order-title');

    if (modalTitle) modalTitle.textContent = `Chỉnh sửa đơn #${order.soDon || order.sale_order_no || order.id}`;

    if (modalBody) {
        modalBody.innerHTML = `
            <div class="order-detail-grid" style="margin-bottom:24px;">
                <div class="detail-row">
                    <label>Khách hàng:</label>
                    <input type="text" id="edit-customer" class="form-control" value="${order.khach || order.account_name || ''}">
                </div>
                <div class="detail-row">
                    <label>Địa chỉ:</label>
                    <input type="text" id="edit-address" class="form-control" value="${order.diaChi || order.shipping_address || ''}">
                </div>
                <div class="detail-row">
                    <label>Ghi chú:</label>
                    <textarea id="edit-note" class="form-control" rows="2">${order.note || order.description || ''}</textarea>
                </div>
            </div>
            
            <h4 style="margin: 16px 0 12px; font-size:14px; color:var(--text-secondary);">Danh sách sản phẩm</h4>
            <table class="data-table" style="width:100%;">
                <thead>
                    <tr>
                        <th>Sản phẩm</th>
                        <th>Số lượng</th>
                        <th>Đơn vị</th>
                    </tr>
                </thead>
                <tbody id="edit-products-body">
                    ${productsHtml}
                </tbody>
            </table>
            
            <!-- MẶT HÀNG PHỤ (VỎ) - Local only, NOT synced to MISA -->
            <h4 style="margin: 24px 0 12px; font-size:14px; color:var(--warning);">
                <i class="bi bi-box"></i> Mặt hàng phụ (Vỏ) 
                <small style="font-weight:normal; color:var(--text-muted);">- Chỉ lưu local</small>
            </h4>
            
            <!-- Quick buttons for common containers -->
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                <button type="button" class="btn btn-sm" style="background:#fef3c7; border:1px solid #fcd34d; color:#92400e;" 
                    onclick="addLocalItemEdit('Vỏ can 30L')">🧴 Vỏ can 30L</button>
                <button type="button" class="btn btn-sm" style="background:#fef3c7; border:1px solid #fcd34d; color:#92400e;" 
                    onclick="addLocalItemEdit('Vỏ phuy')">🛢️ Vỏ phuy</button>
                <button type="button" class="btn btn-sm" style="background:#fef3c7; border:1px solid #fcd34d; color:#92400e;" 
                    onclick="addLocalItemEdit('Vỏ tank')">🏭 Vỏ tank</button>
                <button type="button" class="btn btn-sm" style="background:#fef3c7; border:1px solid #fcd34d; color:#92400e;" 
                    onclick="addLocalItemEdit('Vỏ can 20L')">🧴 Vỏ can 20L</button>
            </div>
            
            <!-- Manual input with suggestions -->
            <div style="display:flex; gap:8px; margin-bottom:12px;">
                <input type="text" id="edit-local-item-name" class="form-control" placeholder="Hoặc nhập tên mặt hàng..." list="edit-crm-products-list" style="flex:1;">
                <input type="number" id="edit-local-item-qty" class="form-control" value="1" min="1" style="width:80px;">
                <button type="button" class="btn btn-primary btn-sm" onclick="addLocalItemEditManual()">
                    <i class="bi bi-plus"></i> Thêm
                </button>
            </div>
            <datalist id="edit-crm-products-list">
                ${(window.cachedMaterials || []).map(m => '<option value="' + (m.name || m.material_name) + '">').join('')}
            </datalist>
            
            <!-- Local items table -->
            <div id="edit-local-items-table">
                ${renderLocalItemsTableEdit(order.local_items || [], orderId)}
            </div>
            
            <div style="display:flex; gap:12px; margin-top:24px;">
                <button class="btn btn-outline" onclick="closeOrderModal()">Hủy</button>
                <button class="btn btn-primary" onclick="saveEditOrder()">
                    <i class="bi bi-check"></i> Lưu thay đổi
                </button>
            </div>
        `;
    }

    if (modal) modal.classList.remove('hidden');
}

async function saveEditOrder() {
    const orderId = state.currentEditOrderId;
    const customer = window.$('#edit-customer')?.value || '';
    const address = window.$('#edit-address')?.value || '';
    const note = window.$('#edit-note')?.value || '';

    // Collect product quantities
    const qtyInputs = window.$$('.edit-product-qty');
    const productUpdates = [];
    qtyInputs.forEach(input => {
        productUpdates.push({
            idx: parseInt(input.dataset.idx),
            qty: parseFloat(input.value) || 0
        });
    });

    showLoading('Đang lưu...');
    try {
        const res = await fetch(`/api/orders/${orderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer,
                address,
                note,
                productUpdates,
                local_items: editLocalItems  // Save local items (NOT synced to MISA)
            })
        });
        const data = await res.json();
        hideLoading();

        if (data.error) {
            alert('Lỗi: ' + data.msg);
            return;
        }

        alert(data.msg || 'Đã lưu thay đổi!');
        closeOrderModal();
        loadOrders();
    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}

// ===============================================
// LOCAL ITEMS HELPERS FOR EDIT ORDER
// ===============================================

// Temporary storage for local items during edit
let editLocalItems = [];

function renderLocalItemsTableEdit(localItems, orderId) {
    editLocalItems = localItems || [];

    if (!editLocalItems || editLocalItems.length === 0) {
        return `<div style="text-align:center; color:var(--text-muted); padding:16px; background:var(--body-bg); border-radius:8px;">
            <i class="bi bi-box" style="font-size:20px; opacity:0.5;"></i>
            <div style="margin-top:8px;">Chưa có mặt hàng phụ</div>
        </div>`;
    }

    return `
        <table class="data-table" style="width:100%; font-size:13px;">
            <thead>
                <tr style="background:#fef3c7;">
                    <th style="text-align:left;">Mặt hàng</th>
                    <th style="text-align:right; width:80px;">SL</th>
                    <th style="width:50px;"></th>
                </tr>
            </thead>
            <tbody>
                ${editLocalItems.map((item, idx) => `
                    <tr>
                        <td>
                            <span style="background:#fef3c7; color:#92400e; padding:2px 6px; border-radius:4px; font-size:12px;">📦</span>
                            ${item.name}
                        </td>
                        <td style="text-align:right; font-weight:600;">${item.qty}</td>
                        <td style="text-align:center;">
                            <button type="button" onclick="removeLocalItemEdit(${idx})" 
                                style="background:none; border:none; color:var(--danger); cursor:pointer;" title="Xóa">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <div style="margin-top:8px; text-align:right;">
            <small style="color:var(--text-muted);">⚠️ Mặt hàng này chỉ lưu local, không đẩy về CRM</small>
        </div>
    `;
}

function addLocalItemEdit(itemName) {
    // Show inline quantity input instead of ugly browser prompt
    const existingModal = document.getElementById('qty-input-modal');
    if (existingModal) existingModal.remove();

    const modalHTML = `
        <div id="qty-input-modal" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center;">
            <div style="background:white; border-radius:12px; padding:24px; min-width:320px; box-shadow:0 10px 40px rgba(0,0,0,0.3);">
                <h4 style="margin:0 0 16px; color:var(--primary); display:flex; align-items:center; gap:8px;">
                    <span style="background:#fef3c7; padding:8px; border-radius:8px; font-size:20px;">📦</span>
                    ${itemName}
                </h4>
                <div style="margin-bottom:16px;">
                    <label style="display:block; margin-bottom:8px; font-weight:600; color:#374151; font-size:14px;">Số lượng</label>
                    <input type="number" id="qty-input-value" value="1" min="1" 
                        style="width:100%; padding:12px 16px; border:2px solid #e5e7eb; border-radius:8px; font-size:18px; font-weight:600; text-align:center;"
                        autofocus>
                </div>
                <div style="display:flex; gap:12px;">
                    <button onclick="document.getElementById('qty-input-modal').remove()" 
                        style="flex:1; padding:12px; border:1px solid #d1d5db; background:white; border-radius:8px; cursor:pointer; font-weight:500;">
                        Hủy
                    </button>
                    <button onclick="confirmAddLocalItem('${itemName}')" 
                        style="flex:1; padding:12px; border:none; background:linear-gradient(135deg, #667eea, #764ba2); color:white; border-radius:8px; cursor:pointer; font-weight:600;">
                        <i class="bi bi-check-lg"></i> Thêm
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Focus and select input
    setTimeout(() => {
        const input = document.getElementById('qty-input-value');
        if (input) {
            input.focus();
            input.select();
            // Handle Enter key
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') confirmAddLocalItem(itemName);
                if (e.key === 'Escape') document.getElementById('qty-input-modal')?.remove();
            });
        }
    }, 100);
}

function confirmAddLocalItem(itemName) {
    const input = document.getElementById('qty-input-value');
    const quantity = parseInt(input?.value) || 0;

    // Close modal
    document.getElementById('qty-input-modal')?.remove();

    if (quantity <= 0) {
        alert('Số lượng không hợp lệ!');
        return;
    }

    // Check if item exists
    const existing = editLocalItems.find(i => i.name === itemName);
    if (existing) {
        existing.qty += quantity;
    } else {
        editLocalItems.push({ name: itemName, qty: quantity });
    }

    // Re-render table
    const container = document.getElementById('edit-local-items-table');
    if (container) {
        container.innerHTML = renderLocalItemsTableEdit(editLocalItems, state.currentEditOrderId);
    }
}

function addLocalItemEditManual() {
    const nameInput = document.getElementById('edit-local-item-name');
    const qtyInput = document.getElementById('edit-local-item-qty');

    const itemName = nameInput?.value?.trim();
    const quantity = parseInt(qtyInput?.value) || 1;

    if (!itemName) {
        alert('Vui lòng nhập tên mặt hàng!');
        return;
    }

    if (quantity <= 0) {
        alert('Số lượng không hợp lệ!');
        return;
    }

    // Check if item exists
    const existing = editLocalItems.find(i => i.name === itemName);
    if (existing) {
        existing.qty += quantity;
    } else {
        editLocalItems.push({ name: itemName, qty: quantity });
    }

    // Re-render table
    const container = document.getElementById('edit-local-items-table');
    if (container) {
        container.innerHTML = renderLocalItemsTableEdit(editLocalItems, state.currentEditOrderId);
    }

    // Clear inputs
    if (nameInput) nameInput.value = '';
    if (qtyInput) qtyInput.value = '1';
}

function removeLocalItemEdit(idx) {
    if (!confirm('Xóa mặt hàng này?')) return;

    editLocalItems.splice(idx, 1);

    // Re-render table
    const container = document.getElementById('edit-local-items-table');
    if (container) {
        container.innerHTML = renderLocalItemsTableEdit(editLocalItems, state.currentEditOrderId);
    }
}

// ===============================================
// IMPORT TICKET ACTIONS
// ===============================================

function viewImportDetail(importId) {
    // Find import from state
    const allImports = [...(state.imports?.pending || []), ...(state.imports?.assigned || []), ...(state.imports?.completed || [])];
    const imp = allImports.find(i => i.id == importId);

    if (!imp) {
        alert('Không tìm thấy phiếu nhập!');
        return;
    }

    const products = imp.products || [];
    const productsHtml = products.length > 0
        ? products.map(p => `
            <tr>
                <td>${p.name || p.product || '-'}</td>
                <td>${p.qty || p.quantity || 0}</td>
                <td>${p.unit || '-'}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Không có sản phẩm</td></tr>';

    const modal = window.$('#modal-order-detail');
    const modalBody = window.$('#modal-order-body');
    const modalTitle = window.$('#modal-order-title');

    if (modalTitle) modalTitle.textContent = `Chi tiết phiếu nhập #${imp.ticket_no || imp.id}`;

    if (modalBody) {
        modalBody.innerHTML = `
            <div class="order-detail-grid">
                <div class="detail-row">
                    <label>Mã phiếu:</label>
                    <span><strong>#${imp.ticket_no || imp.id}</strong></span>
                </div>
                <div class="detail-row">
                    <label>Nhà cung cấp:</label>
                    <span>${imp.supplier_name || 'Chưa có'}</span>
                </div>
                <div class="detail-row">
                    <label>Ngày dự kiến:</label>
                    <span>${formatDate(imp.expected_date || imp.created_at)}</span>
                </div>
                <div class="detail-row">
                    <label>Địa chỉ:</label>
                    <span>${imp.supplier_address || 'Chưa có địa chỉ'}</span>
                </div>
                <div class="detail-row">
                    <label>Trạng thái:</label>
                    <span class="badge badge-${getStatusBadge(imp.status)}">${getStatusText(imp.status)}</span>
                </div>
                <div class="detail-row">
                    <label>Tài xế:</label>
                    <span>${imp.driver_name || 'Chưa phân công'}</span>
                </div>
                <div class="detail-row">
                    <label>Biển số xe:</label>
                    <span>${imp.plate || 'Chưa có'}</span>
                </div>
            </div>

            <h4 style="margin: 24px 0 12px; font-size:14px; color:var(--text-secondary);">Danh sách hàng nhập</h4>
            <table class="data-table" style="width:100%;">
                <thead>
                    <tr>
                        <th>Sản phẩm</th>
                        <th>SL</th>
                        <th>Đơn vị</th>
                    </tr>
                </thead>
                <tbody>
                    ${productsHtml}
                </tbody>
            </table>

            ${imp.note ? `<div style="margin-top:16px; padding:12px; background:var(--body-bg); border-radius:8px;"><strong>Ghi chú:</strong> ${imp.note}</div>` : ''}

            <!-- ACTION BUTTONS -->
            <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border); display:flex; gap:8px; flex-wrap:wrap;">
                ${imp.status === 'pending' || imp.status === 'Chưa thực hiện' ? `
                    <button class="btn btn-primary" onclick="closeOrderModal(); assignImportDriver('${imp.id}')">
                        <i class="bi bi-person-plus"></i> Phân công tài xế
                    </button>
                ` : ''}
                ${(imp.status === 'assigned' || imp.status === 'in_transit') && state.user?.role === 'ADMIN' ? `
                    <button class="btn btn-success" onclick="adminCompleteImport('${imp.id}')">
                        <i class="bi bi-check-circle"></i> Admin hoàn thành
                    </button>
                ` : ''}
                <button class="btn btn-outline" onclick="closeOrderModal()">
                    <i class="bi bi-x-lg"></i> Đóng
                </button>
            </div>
        `;
    }

    if (modal) modal.classList.remove('hidden');
}

async function assignImportDriver(importId) {
    // Find import from pending
    const imp = (state.imports?.pending || []).find(i => i.id == importId);

    if (!imp) {
        alert('Không tìm thấy phiếu nhập!');
        return;
    }

    // Store current import ID for assignment
    state.currentAssignImportId = importId;

    // Build driver select options with plate data
    const driverOptions = (state.drivers || []).map(d =>
        `<option value="${d.name}" data-plate="${d.plate || ''}">${d.name}${d.plate ? ' - ' + d.plate : ''}</option>`
    ).join('');

    // Show modal
    const modal = window.$('#modal-order-detail');
    const modalBody = window.$('#modal-order-body');
    const modalTitle = window.$('#modal-order-title');

    if (modalTitle) modalTitle.textContent = `Gán tài xế - Phiếu nhập #${imp.ticket_no || imp.id}`;

    if (modalBody) {
        modalBody.innerHTML = `
            <div class="order-detail-grid" style="margin-bottom:24px;">
                <div class="detail-row">
                    <label>Nhà cung cấp:</label>
                    <span>${imp.supplier_name || 'Chưa có'}</span>
                </div>
                <div class="detail-row">
                    <label>Địa chỉ:</label>
                    <span>${imp.supplier_address || 'Chưa có'}</span>
                </div>
                <div class="detail-row">
                    <label>Ngày dự kiến:</label>
                    <span>${formatDate(imp.expected_date || imp.created_at)}</span>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Chọn tài xế *</label>
                <select id="assign-driver-select" class="form-control" onchange="onDriverChange(this)">
                    <option value="">-- Chọn tài xế --</option>
                    ${driverOptions}
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">Biển số xe</label>
                <input type="text" id="assign-plate" class="form-control" placeholder="Tự động điền khi chọn tài xế">
            </div>
            
            <div style="display:flex; gap:12px; margin-top:24px;">
                <button class="btn btn-outline" onclick="closeOrderModal()">Hủy</button>
                <button class="btn btn-primary" onclick="confirmAssignImportDriver()">
                    <i class="bi bi-check"></i> Xác nhận gán
                </button>
            </div>
        `;
    }

    if (modal) modal.classList.remove('hidden');
}

async function confirmAssignImportDriver() {
    const importId = state.currentAssignImportId;
    const driverSelect = window.$('#assign-driver-select');
    const plateInput = window.$('#assign-plate');

    const driverName = driverSelect?.value;
    const plate = plateInput?.value || '';

    if (!driverName) {
        alert('Vui lòng chọn tài xế!');
        return;
    }

    showLoading('Đang gán tài xế...');
    try {
        const res = await api.assignImportDriver(importId, driverName, plate);
        hideLoading();

        if (res.error) {
            alert(res.msg || 'Lỗi gán tài xế!');
            return;
        }

        alert(res.msg || 'Đã gán tài xế!');
        closeOrderModal();
        loadImportTickets();
    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}

async function adminCompleteImport(importId) {

    if (!confirm('ADMIN: Xác nhận hoàn thành phiếu nhập này?')) return;

    showLoading('Đang hoàn thành...');
    try {
        const res = await api.completeImport(importId, {});
        hideLoading();
        alert(res.msg || 'Hoàn thành phiếu nhập!');
        loadImportTickets();
        closeOrderModal();
    } catch (e) {
        hideLoading();
        alert('Lỗi: ' + e.message);
    }
}

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    // Check for existing session
    const session = localStorage.getItem('LT_SESSION');
    if (session) {
        try {
            const parsed = JSON.parse(session);
            if (parsed.user) {
                state = { ...state, ...parsed };
                initApp();
                return;
            }
        } catch (e) {
            console.error('Session parse error:', e);
        }
    }

    // Show login
    show('view-login');
    hide('view-app');
});

// Export for global access
window.handleLogin = handleLogin;
window.doLogout = doLogout;
window.showSection = showSection;
window.toggleSubmenu = toggleSubmenu;
window.switchDispatchTab = switchDispatchTab;
window.searchOrders = searchOrders;
window.addOrderProduct = addOrderProduct;
window.removeOrderProduct = removeOrderProduct;
window.submitOrder = submitOrder;
window.viewOrderDetail = viewOrderDetail;
window.assignDriver = assignDriver;
window.confirmAssignDriver = confirmAssignDriver;
window.completeOrder = completeOrder;
window.goToPage = goToPage;
window.toggleUserMenu = toggleUserMenu;
window.assignDriver = assignDriver;
window.closeOrderModal = closeOrderModal;

// Delivery modal exports
window.openDeliveryModal = openDeliveryModal;
window.closeDeliveryModal = closeDeliveryModal;
window.renderDeliveryCart = renderDeliveryCart;
window.updateCartQty = updateCartQty;
window.updateCartNote = updateCartNote;
window.removeCartItem = removeCartItem;
window.handleImageSelect = handleImageSelect;
window.submitDelivery = submitDelivery;
window.startOrder = startOrder;
// Sync exports
window.forceSyncMisa = forceSyncMisa;
// Driver select exports
window.onDriverChange = onDriverChange;
// Date filter exports
window.filterByDate = filterByDate;
window.clearDateFilter = clearDateFilter;
// Chat exports
window.loadOrderChat = loadOrderChat;
window.sendChatMessage = sendChatMessage;
window.previewChatImage = previewChatImage;
window.clearChatImage = clearChatImage;
window.showChatImage = showChatImage;
window.closeChatImageViewer = closeChatImageViewer;
window.startChatRefresh = startChatRefresh;
window.stopChatRefresh = stopChatRefresh;
// Multi-driver exports
window.initDriverAssignments = initDriverAssignments;
window.renderDriverAssignments = renderDriverAssignments;
window.updateQtySummary = updateQtySummary;
window.addDriverAssignment = addDriverAssignment;
window.removeDriverAssignment = removeDriverAssignment;
window.submitAllDriverAssignments = submitAllDriverAssignments;
window.toggleExternalDriverInput = toggleExternalDriverInput;
// Extra item exports
window.addExtraItem = addExtraItem;
// Admin exports
window.adminCompleteOrder = adminCompleteOrder;
// Import ticket exports
window.switchOrderType = switchOrderType;
window.loadImportTickets = loadImportTickets;
window.renderImportList = renderImportList;
window.viewImportDetail = viewImportDetail;
window.assignImportDriver = assignImportDriver;
window.confirmAssignImportDriver = confirmAssignImportDriver;
window.adminCompleteImport = adminCompleteImport;
// Edit order exports
window.editOrder = editOrder;
window.saveEditOrder = saveEditOrder;
// New multi-driver exports
window.onNewDriverChange = onNewDriverChange;
window.addDriverAssignmentRow = addDriverAssignmentRow;
window.removeDriverAssignmentRow = removeDriverAssignmentRow;
window.renderDriverAssignmentsList = renderDriverAssignmentsList;
window.updateQtySummaryDisplay = updateQtySummaryDisplay;
window.submitMultiDriverAssignment = submitMultiDriverAssignment;
