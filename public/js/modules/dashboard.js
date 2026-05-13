// ===============================================
// MODULE: TỔNG QUAN (Dashboard Overview) — MISA AMIS Style
// Role-based: All roles see dashboard, scoped by permissions
// ===============================================

const DashboardModule = {
    charts: {},
    _statsData: null,

    // Role permission matrix
    getPermissions() {
        const user = window.state?.user || {};
        const role = (user.role || '').toLowerCase().trim();
        const isAdmin = ['admin', 'tester'].includes(role);
        const isDispatcher = ['dispatcher', 'điều phối', 'dieu phoi'].includes(role);
        const isAccountant = ['accountant', 'kế toán', 'ke toan', 'ketoan'].includes(role);
        const isSales = ['sales', 'nhân viên kinh doanh', 'kinh doanh'].includes(role);
        const isDriver = ['driver', 'assistant', 'phụ xe'].includes(role);
        const isViewer = ['viewer', 'xem', 'giám sát', 'guard', 'bảo vệ', 'bao ve'].includes(role);
        const isImportMgr = ['import_manager', 'quản lý nhập'].includes(role);
        const isStaff = role === 'staff' || role === 'nhân viên';

        return {
            role, isAdmin, isDispatcher, isAccountant, isSales, isDriver, isViewer, isImportMgr, isStaff,
            canSeeRevenue: isAdmin || isAccountant,
            // Drivers see pending/delivering in their dedicated module, not on dashboard
            canSeePending: isAdmin || isDispatcher || isViewer || isImportMgr,
            canSeeDelivering: isAdmin || isDispatcher || isViewer || isImportMgr,
            canSeeChartOrders: isAdmin || isDispatcher || isAccountant || isViewer,
            canSeeChartRevenue: isAdmin || isAccountant,
            canSeeTopProducts: isAdmin || isDispatcher || isAccountant || isImportMgr || isSales,
            canSeeTopCustomers: isAdmin || isAccountant || isSales,
            canSeeTopDrivers: isAdmin || isDispatcher || isImportMgr,
            canSeeImportStats: isAdmin || isDispatcher || isImportMgr,
        };
    },

    init() {
        console.log('📊 Dashboard Module initialized');
        this.render();
        this.loadData();
    },

    // Render the dashboard HTML structure based on role
    render() {
        const container = document.getElementById('section-dashboard');
        if (!container) return;
        const p = this.getPermissions();

        // Role labels for display badge
        const roleLabels = {
            admin: 'Quản trị', tester: 'Tester', dispatcher: 'Điều phối',
            'điều phối': 'Điều phối', driver: 'Tài xế', assistant: 'Phụ xe',
            accountant: 'Kế toán', 'kế toán': 'Kế toán', 'ke toan': 'Kế toán', ketoan: 'Kế toán',
            sales: 'Kinh doanh', 'nhân viên kinh doanh': 'Kinh doanh', 'kinh doanh': 'Kinh doanh',
            viewer: 'Giám sát', 'giám sát': 'Giám sát', 'bảo vệ': 'Bảo vệ', guard: 'Bảo vệ',
            import_manager: 'QL Nhập hàng', 'quản lý nhập': 'QL Nhập hàng',
            staff: 'Nhân viên', 'nhân viên': 'Nhân viên'
        };
        const roleBadgeText = roleLabels[p.role] || p.role || 'Người dùng';
        const roleIcon = p.isAdmin ? 'bi-shield-check' : p.isDriver ? 'bi-truck' : p.isAccountant ? 'bi-calculator' : p.isSales ? 'bi-graph-up-arrow' : p.isDispatcher ? 'bi-signpost-split' : p.isViewer ? 'bi-eye' : 'bi-person';

        container.innerHTML = `
            <div class="db-header">
                <div class="db-header-left">
                    <h2 class="db-title">Tổng quan</h2>
                    <span class="db-role-badge"><i class="bi ${roleIcon}"></i> ${roleBadgeText}</span>
                </div>
                <div class="db-actions">
                    <select id="db-period" class="db-select" onchange="DashboardModule.onPeriodChange()">
                        <option value="all">Tất cả</option>
                        <option value="today">Hôm nay</option>
                        <option value="week">Tuần này</option>
                        <option value="month" selected>Tháng này</option>
                        <option value="year">Năm nay</option>
                    </select>
                    <button class="db-refresh-btn" onclick="DashboardModule.loadData()" title="Tải lại">
                        <i class="bi bi-arrow-clockwise"></i>
                    </button>
                </div>
            </div>

            <!-- KPI Cards Row -->
            <div class="db-kpi-row" id="db-kpi-row"></div>

            <!-- Charts Row -->
            <div class="db-charts-row" id="db-charts-row">
                ${p.canSeeChartOrders ? `
                <div class="db-chart-card">
                    <div class="db-chart-header">
                        <h3>Số lượng đơn hàng</h3>
                        <span class="db-chart-sub" id="db-chart-orders-sub">Dữ liệu tháng này</span>
                    </div>
                    <div class="db-chart-body"><canvas id="db-chart-orders"></canvas></div>
                </div>` : ''}
                ${p.canSeeChartRevenue ? `
                <div class="db-chart-card">
                    <div class="db-chart-header">
                        <h3>Giá trị đơn hàng</h3>
                        <span class="db-chart-sub" id="db-chart-value-sub">Dữ liệu tháng này</span>
                    </div>
                    <div class="db-chart-body"><canvas id="db-chart-value"></canvas></div>
                </div>` : ''}
            </div>

            <!-- Analytics Row -->
            <div class="db-analytics-row" id="db-analytics-row">
                ${p.canSeeTopProducts ? `
                <div class="db-analytics-card">
                    <div class="db-analytics-header"><i class="bi bi-box-seam"></i> Top sản phẩm</div>
                    <div id="db-top-products" class="db-analytics-body"><div class="db-loading">Đang tải...</div></div>
                </div>` : ''}
                ${p.canSeeTopCustomers ? `
                <div class="db-analytics-card">
                    <div class="db-analytics-header"><i class="bi bi-people"></i> Top khách hàng</div>
                    <div id="db-top-customers" class="db-analytics-body"><div class="db-loading">Đang tải...</div></div>
                </div>` : ''}
                ${p.canSeeTopDrivers ? `
                <div class="db-analytics-card">
                    <div class="db-analytics-header"><i class="bi bi-truck"></i> Top tài xế</div>
                    <div id="db-top-drivers" class="db-analytics-body"><div class="db-loading">Đang tải...</div></div>
                </div>` : ''}
            </div>

            <div class="db-footer">
                <span>Cập nhật lúc: <span id="db-update-time">--:--</span></span>
            </div>
        `;
    },

    // Build KPI cards based on permissions
    renderKPICards(stats) {
        const p = this.getPermissions();
        const row = document.getElementById('db-kpi-row');
        if (!row) return;

        const cards = [];

        // Total orders — everyone sees this
        cards.push(this._kpiCard('Tổng đơn hàng', stats.totalOrders || 0, 'bi-clipboard-data', '#4dabf7', '#339af0'));

        if (p.canSeePending) {
            cards.push(this._kpiCard('Chờ xử lý', stats.pendingOrders || 0, 'bi-hourglass-split', '#ffa94d', '#fd7e14'));
        }
        if (p.canSeeDelivering) {
            cards.push(this._kpiCard('Đang giao', stats.deliveringOrders || 0, 'bi-truck', '#74c0fc', '#4dabf7'));
        }

        // Completed
        const total = stats.totalOrders || 1;
        const completed = stats.completedTotal || 0;
        const rate = Math.round((completed / total) * 100);
        cards.push(this._kpiCard('Hoàn thành', completed, 'bi-check-circle', '#69db7c', '#40c057', `${rate}%`));

        if (p.canSeeRevenue) {
            const value = this._formatBillion(stats.totalRevenue || 0);
            cards.push(this._kpiCard('Doanh thu', value, 'bi-currency-dollar', '#b197fc', '#845ef7', null, true));
        }

        if (p.canSeeImportStats) {
            cards.push(this._kpiCard('Đơn nhập', stats.totalImports || 0, 'bi-box-arrow-in-down', '#f783ac', '#e64980'));
        }

        row.innerHTML = cards.join('');
        // Animate counters
        row.querySelectorAll('.db-kpi-value[data-target]').forEach(el => {
            this._animateCount(el, parseInt(el.dataset.target) || 0);
        });
    },

    _kpiCard(label, value, icon, color1, color2, subText, isText) {
        const displayVal = isText ? value : '0';
        const dataTarget = isText ? '' : `data-target="${value}"`;
        return `
        <div class="db-kpi-card" style="background:linear-gradient(135deg, ${color1}, ${color2});">
            <div class="db-kpi-icon"><i class="bi ${icon}"></i></div>
            <div class="db-kpi-info">
                <div class="db-kpi-label">${label}</div>
                <div class="db-kpi-value" ${dataTarget}>${isText ? value : displayVal}</div>
                ${subText ? `<div class="db-kpi-sub">${subText}</div>` : ''}
            </div>
        </div>`;
    },

    _animateCount(el, target) {
        if (target === 0) { el.textContent = '0'; return; }
        const duration = 800;
        const start = performance.now();
        const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.floor(eased * target).toLocaleString('vi-VN');
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },

    _formatBillion(v) {
        if (v >= 1e9) return (v / 1e9).toFixed(2) + ' Tỷ';
        if (v >= 1e6) return (v / 1e6).toFixed(1) + ' Tr';
        return v.toLocaleString('vi-VN') + 'đ';
    },

    // Load data from API
    async loadData() {
        try {
            const p = this.getPermissions();

            // 1. Stats from server-cached endpoint
            const statsRes = await fetch('/api/reports/dashboard');
            const statsJson = await statsRes.json();
            const stats = statsJson.data || statsJson || {};
            this._statsData = stats;

            // 2. Load orders for charts/analytics
            const ordersRes = await fetch('/api/orders');
            const ordersJson = await ordersRes.json();
            const allOrders = [...(ordersJson.pending || []), ...(ordersJson.assigned || [])];

            // Filter by period
            const period = document.getElementById('db-period')?.value || 'month';
            const filtered = this._filterByPeriod(allOrders, period);

            // Calculate revenue from filtered orders
            stats.totalRevenue = filtered.reduce((s, o) => s + (parseFloat(o.amount || o.sale_order_amount) || 0), 0);

            // Render KPI cards
            this.renderKPICards(stats);

            // Render charts
            if (p.canSeeChartOrders) this._renderOrdersChart(filtered);
            if (p.canSeeChartRevenue) this._renderValueChart(filtered);

            // Render analytics
            if (p.canSeeTopProducts) this._renderTopProducts(filtered);
            if (p.canSeeTopCustomers) this._renderTopCustomers(filtered);
            if (p.canSeeTopDrivers) this._renderTopDrivers(filtered);

            // Update time
            const timeEl = document.getElementById('db-update-time');
            if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

        } catch (e) {
            console.error('Dashboard load error:', e);
        }
    },

    _filterByPeriod(orders, period) {
        if (period === 'all') return orders;
        const now = new Date();
        return orders.filter(o => {
            const d = new Date(o.ngay || o.sale_order_date || o.created_at);
            if (isNaN(d.getTime())) return false;
            switch (period) {
                case 'today': return d.toDateString() === now.toDateString();
                case 'week': return d >= new Date(now.getTime() - 7 * 864e5);
                case 'month': return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                case 'year': return d.getFullYear() === now.getFullYear();
                default: return true;
            }
        });
    },

    onPeriodChange() { this.loadData(); },

    // === CHARTS ===
    _renderOrdersChart(orders) {
        const ctx = document.getElementById('db-chart-orders');
        if (!ctx) return;
        if (this.charts.orders) this.charts.orders.destroy();

        const grouped = {};
        orders.forEach(o => {
            const date = (o.ngay || o.sale_order_date || '').split('T')[0];
            if (date) grouped[date] = (grouped[date] || 0) + 1;
        });
        const labels = Object.keys(grouped).sort().slice(-14);
        const data = labels.map(d => grouped[d] || 0);

        this.charts.orders = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map(d => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
                datasets: [{
                    label: 'Số đơn',
                    data,
                    borderColor: '#4dabf7',
                    backgroundColor: 'rgba(77,171,247,0.08)',
                    tension: 0.4, fill: true,
                    pointRadius: 4, pointBackgroundColor: '#4dabf7',
                    pointBorderColor: '#fff', pointBorderWidth: 2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display: false } } } }
        });
    },

    _renderValueChart(orders) {
        const ctx = document.getElementById('db-chart-value');
        if (!ctx) return;
        if (this.charts.value) this.charts.value.destroy();

        const grouped = {};
        orders.forEach(o => {
            const date = (o.ngay || o.sale_order_date || '').split('T')[0];
            const val = parseFloat(o.amount || o.sale_order_amount) || 0;
            if (date) grouped[date] = (grouped[date] || 0) + val;
        });
        const labels = Object.keys(grouped).sort().slice(-14);
        const data = labels.map(d => grouped[d] || 0);

        this.charts.value = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(d => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
                datasets: [{
                    label: 'Giá trị', data,
                    backgroundColor: 'rgba(81,207,102,0.7)',
                    borderColor: '#40c057', borderWidth: 1, borderRadius: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => (v / 1e6).toFixed(0) + 'M' }, grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display: false } } } }
        });
    },

    // === ANALYTICS with horizontal bar charts (MISA style) ===
    _renderTopProducts(orders) {
        const el = document.getElementById('db-top-products');
        if (!el) return;
        const counts = {};
        orders.forEach(o => {
            (o.products || o.cart || []).forEach(p => {
                const name = p.tenVatTu || p.name || p.productName || '?';
                counts[name] = (counts[name] || 0) + (parseInt(p.soLuong || p.qty) || 1);
            });
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (!sorted.length) { el.innerHTML = '<div class="db-empty">Không có dữ liệu</div>'; return; }
        const max = sorted[0][1];
        el.innerHTML = sorted.map(([name, count], i) => `
            <div class="db-bar-item">
                <div class="db-bar-label"><span class="db-bar-rank">${i + 1}</span> ${name}</div>
                <div class="db-bar-track"><div class="db-bar-fill" style="width:${(count / max * 100).toFixed(0)}%; background:linear-gradient(90deg,#4dabf7,#339af0);"></div></div>
                <div class="db-bar-value">${count.toLocaleString('vi-VN')}</div>
            </div>`).join('');
    },

    _renderTopCustomers(orders) {
        const el = document.getElementById('db-top-customers');
        if (!el) return;
        const p = this.getPermissions();
        const stats = {};
        orders.forEach(o => {
            const name = o.khach || o.account_name || '?';
            if (!stats[name]) stats[name] = { count: 0, value: 0 };
            stats[name].count++;
            stats[name].value += parseFloat(o.amount || o.sale_order_amount) || 0;
        });
        const sorted = Object.entries(stats).sort((a, b) => b[1].value - a[1].value).slice(0, 5);
        if (!sorted.length) { el.innerHTML = '<div class="db-empty">Không có dữ liệu</div>'; return; }
        const max = sorted[0][1].value || 1;
        el.innerHTML = sorted.map(([name, s], i) => `
            <div class="db-bar-item">
                <div class="db-bar-label"><span class="db-bar-rank">${i + 1}</span> ${name}</div>
                <div class="db-bar-track"><div class="db-bar-fill" style="width:${(s.value / max * 100).toFixed(0)}%; background:linear-gradient(90deg,#69db7c,#40c057);"></div></div>
                <div class="db-bar-value">${p.canSeeRevenue ? this._formatBillion(s.value) : s.count + ' đơn'}</div>
            </div>`).join('');
    },

    _renderTopDrivers(orders) {
        const el = document.getElementById('db-top-drivers');
        if (!el) return;
        const p = this.getPermissions();
        const stats = {};
        orders.forEach(o => {
            const driver = o.taiXe || o.driver || o.custom_field13;
            if (!driver) return;
            if (!stats[driver]) stats[driver] = { count: 0, value: 0, merged: new Set() };
            if (o.merged_order_no) {
                if (!stats[driver].merged.has(o.merged_order_no)) { stats[driver].count++; stats[driver].merged.add(o.merged_order_no); }
            } else { stats[driver].count++; }
            stats[driver].value += parseFloat(o.amount || o.sale_order_amount) || 0;
        });
        const sorted = Object.entries(stats).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
        if (!sorted.length) { el.innerHTML = '<div class="db-empty">Không có dữ liệu</div>'; return; }
        const max = sorted[0][1].count || 1;
        el.innerHTML = sorted.map(([name, s], i) => `
            <div class="db-bar-item">
                <div class="db-bar-label"><span class="db-bar-rank">${i + 1}</span> ${name}</div>
                <div class="db-bar-track"><div class="db-bar-fill" style="width:${(s.count / max * 100).toFixed(0)}%; background:linear-gradient(90deg,#b197fc,#845ef7);"></div></div>
                <div class="db-bar-value">${s.count} chuyến${p.canSeeRevenue ? ' · ' + this._formatBillion(s.value) : ''}</div>
            </div>`).join('');
    }
};

window.DashboardModule = DashboardModule;
// Register with AppRouter if available
if (typeof AppRouter !== 'undefined') {
    AppRouter.registerModule('dashboard', DashboardModule);
}
