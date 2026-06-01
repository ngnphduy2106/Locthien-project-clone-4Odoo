// ===============================================
// MODULE: TỔNG QUAN (Dashboard) — Role-Specific V2
// -----------------------------------------------
// Config-driven architecture: each role defines
// its own KPIs, charts, analytics & panels.
// WHY: keeps code DRY while letting every role
//      see exactly the widgets it needs.
// ===============================================

const DashboardModule = {
    charts: {},
    _statsData: null,
    _myOrders: null,
    _importsData: null,

    // ═══════════════════════════════════════════════════
    // ROLE DETECTION
    // ═══════════════════════════════════════════════════
    getPermissions() {
        const user = window.state?.user || {};
        const role = (user.role || '').toLowerCase().trim();
        return {
            role,
            isAdmin:      ['admin', 'tester'].includes(role),
            isDispatcher:  ['dispatcher', 'điều phối', 'dieu phoi'].includes(role),
            isAccountant:  ['accountant', 'kế toán', 'ke toan', 'ketoan'].includes(role),
            isSales:       ['sales', 'nhân viên kinh doanh', 'kinh doanh'].includes(role),
            isDriver:      ['driver', 'assistant', 'phụ xe'].includes(role),
            isViewer:      ['viewer', 'xem', 'giám sát', 'guard', 'bảo vệ', 'bao ve'].includes(role),
            isImportMgr:   ['import_manager', 'quản lý nhập'].includes(role),
            isStaff:       role === 'staff' || role === 'nhân viên',
        };
    },

    // ═══════════════════════════════════════════════════
    // ROLE DASHBOARD CONFIGURATIONS
    // Each role gets a tailored set of widgets
    // ═══════════════════════════════════════════════════
    _configs: {
        admin: {
            title: 'Tổng quan hệ thống',
            subtitle: 'Theo dõi toàn bộ hoạt động kinh doanh & vận hành',
            icon: 'bi-shield-check', badge: 'Quản trị', badgeClass: 'badge-admin',
            kpis: ['total', 'pending', 'delivering', 'completed', 'revenue', 'imports'],
            charts: ['orders', 'revenue'],
            analytics: ['products', 'customers', 'drivers'],
            actions: [
                { label: 'Điều phối',      icon: 'bi-signpost-split',   section: 'dispatch',       color: '#4dabf7' },
                { label: 'Tạo đơn xuất',   icon: 'bi-box-arrow-up',     section: 'create-export',  color: '#40c057' },
                { label: 'QL tài khoản',   icon: 'bi-people',           section: 'users',          color: '#845ef7' },
            ],
            panels: [], showPeriod: true,
        },
        dispatcher: {
            title: 'Quản lý vận hành',
            subtitle: 'Điều phối đơn hàng & theo dõi tài xế',
            icon: 'bi-signpost-split', badge: 'Điều phối', badgeClass: 'badge-dispatcher',
            kpis: ['total', 'pending', 'delivering', 'completed'],
            charts: ['orders'],
            analytics: ['products', 'drivers'],
            actions: [
                { label: 'Điều phối',      icon: 'bi-signpost-split', section: 'dispatch',       color: '#4dabf7' },
                { label: 'Đơn đang giao',  icon: 'bi-truck',          section: 'pending-orders', color: '#fd7e14' },
                { label: 'Ghép đơn PO',    icon: 'bi-layers',         section: 'merge-orders',   color: '#40c057' },
            ],
            panels: ['unassigned'], showPeriod: true,
        },
        driver: {
            title: 'Đơn hàng của tôi',
            subtitle: 'Theo dõi tiến độ giao hàng cá nhân',
            icon: 'bi-truck', badge: 'Tài xế', badgeClass: 'badge-driver',
            kpis: ['myTotal', 'myDelivering', 'myCompleted', 'myTrips'],
            charts: ['myTrips'],
            analytics: [],
            actions: [
                { label: 'Đơn đang giao', icon: 'bi-truck',          section: 'pending-orders', color: '#4dabf7' },
                { label: 'Lịch sử đơn',   icon: 'bi-clock-history',  section: 'order-history',  color: '#40c057' },
            ],
            panels: ['myOrders'], showPeriod: false,
        },
        sales: {
            title: 'Tổng quan kinh doanh',
            subtitle: 'Theo dõi đơn hàng & hoạt động khách hàng',
            icon: 'bi-graph-up-arrow', badge: 'Kinh doanh', badgeClass: 'badge-sales',
            kpis: ['total', 'completed', 'pendingConfirm'],
            charts: ['orders'],
            analytics: ['products', 'customersByCount'],
            actions: [
                { label: 'Tạo đơn nhập', icon: 'bi-box-arrow-in-down', section: 'create-order',    color: '#4dabf7' },
                { label: 'Tạo đơn xuất', icon: 'bi-box-arrow-up',      section: 'create-export',   color: '#40c057' },
                { label: 'Xác nhận đơn', icon: 'bi-clipboard-check',   section: 'confirm-orders',  color: '#e64980' },
            ],
            panels: [], showPeriod: true,
        },
        accountant: {
            title: 'Báo cáo tài chính',
            subtitle: 'Doanh thu, phân tích giá trị đơn hàng',
            icon: 'bi-calculator', badge: 'Kế toán', badgeClass: 'badge-accountant',
            kpis: ['total', 'completed', 'revenue', 'avgOrder'],
            charts: ['revenue', 'orders'],
            analytics: ['customersByRevenue', 'products'],
            actions: [
                { label: 'Lịch sử đơn hàng', icon: 'bi-clock-history', section: 'order-history', color: '#4dabf7' },
            ],
            panels: [], showPeriod: true,
        },
        import_manager: {
            title: 'Quản lý nhập hàng',
            subtitle: 'Theo dõi phiếu nhập & nhà cung cấp',
            icon: 'bi-box-arrow-in-down', badge: 'QL Nhập hàng', badgeClass: 'badge-import',
            kpis: ['importTotal', 'importPending', 'importDelivering', 'importCompleted'],
            charts: ['imports'],
            analytics: ['importProducts'],
            actions: [
                { label: 'Tạo đơn nhập',  icon: 'bi-plus-circle', section: 'create-order',    color: '#4dabf7' },
                { label: 'Đơn đang giao', icon: 'bi-truck',       section: 'pending-orders',  color: '#fd7e14' },
            ],
            panels: [], showPeriod: true,
        },
        viewer: {
            title: 'Giám sát hoạt động',
            subtitle: 'Theo dõi trạng thái đơn hàng',
            icon: 'bi-eye', badge: 'Giám sát', badgeClass: 'badge-viewer',
            kpis: ['total', 'delivering', 'completed'],
            charts: ['orders'],
            analytics: ['products'],
            actions: [
                { label: 'Đơn đang giao', icon: 'bi-truck',         section: 'pending-orders', color: '#4dabf7' },
                { label: 'Lịch sử đơn',   icon: 'bi-clock-history', section: 'order-history',  color: '#40c057' },
            ],
            panels: [], showPeriod: true,
        },
    },

    // Resolve role → config
    _getConfig() {
        const p = this.getPermissions();
        if (p.isAdmin)      return this._configs.admin;
        if (p.isDispatcher)  return this._configs.dispatcher;
        if (p.isDriver)      return this._configs.driver;
        if (p.isSales)       return this._configs.sales;
        if (p.isAccountant)  return this._configs.accountant;
        if (p.isImportMgr)   return this._configs.import_manager;
        if (p.isViewer)      return this._configs.viewer;
        return this._configs.viewer; // fallback = read-only view
    },

    // ═══════════════════════════════════════════════════
    // INIT & RENDER
    // ═══════════════════════════════════════════════════
    init() {
        console.log('📊 Dashboard init | role:', this.getPermissions().role);
        this.render();
        this.loadData();
    },

    // Build the full dashboard HTML from config
    render() {
        const container = document.getElementById('section-dashboard');
        if (!container) return;
        const cfg = this._getConfig();
        const user = window.state?.user || {};
        const userName = user.fullName || user.name || user.phone || '';

        let h = '';

        // ── Header ──
        h += `<div class="db-header">
            <div class="db-header-left">
                <h2 class="db-title">${cfg.title}</h2>
                <span class="db-role-badge ${cfg.badgeClass}"><i class="bi ${cfg.icon}"></i> ${cfg.badge}</span>
            </div>
            <div class="db-actions">
                ${cfg.showPeriod ? `<select id="db-period" class="db-select" onchange="DashboardModule.onPeriodChange()">
                    <option value="all">Tất cả</option><option value="today">Hôm nay</option>
                    <option value="week">Tuần này</option><option value="month" selected>Tháng này</option>
                    <option value="year">Năm nay</option>
                </select>` : ''}
                <button class="db-refresh-btn" onclick="DashboardModule.loadData()" title="Tải lại"><i class="bi bi-arrow-clockwise"></i></button>
            </div>
        </div>`;

        // ── Welcome ──
        h += `<p class="db-welcome">Xin chào <strong>${userName || 'bạn'}</strong>, ${cfg.subtitle.toLowerCase()}</p>`;

        // ── Quick Actions ──
        if (cfg.actions.length) {
            h += `<div class="db-quick-actions">${cfg.actions.map(a =>
                `<button class="db-quick-btn" onclick="showSection('${a.section}')" style="--qb-c:${a.color}"><i class="bi ${a.icon}"></i><span>${a.label}</span></button>`
            ).join('')}</div>`;
        }

        // ── KPI Row ──
        h += `<div class="db-kpi-row" id="db-kpi-row"><div class="db-loading"><i class="bi bi-arrow-repeat db-spin"></i> Đang tải dữ liệu…</div></div>`;

        // ── Special Panel: Driver's Orders ──
        if (cfg.panels.includes('myOrders')) {
            h += `<div class="db-section-title"><i class="bi bi-list-task"></i> Đơn cần giao hôm nay</div>
                  <div class="db-panel" id="db-my-orders-panel"><div class="db-loading"><i class="bi bi-arrow-repeat db-spin"></i> Đang tải…</div></div>`;
        }

        // ── Special Panel: Dispatcher's Unassigned Orders ──
        if (cfg.panels.includes('unassigned')) {
            h += `<div class="db-section-title"><i class="bi bi-exclamation-triangle-fill"></i> Đơn chưa phân công</div>
                  <div class="db-panel" id="db-unassigned-panel"><div class="db-loading"><i class="bi bi-arrow-repeat db-spin"></i> Đang tải…</div></div>`;
        }

        // ── Charts ──
        if (cfg.charts.length) {
            const chartMeta = {
                orders:  { title: 'Số lượng đơn hàng',       id: 'db-chart-orders',   sub: 'db-chart-orders-sub' },
                revenue: { title: 'Giá trị đơn hàng',        id: 'db-chart-value',    sub: 'db-chart-value-sub' },
                myTrips: { title: 'Hoạt động 7 ngày gần nhất', id: 'db-chart-my-trips', sub: '' },
                imports: { title: 'Phiếu nhập theo ngày',    id: 'db-chart-imports',  sub: 'db-chart-imports-sub' },
            };
            h += `<div class="db-charts-row">`;
            cfg.charts.forEach(key => {
                const c = chartMeta[key]; if (!c) return;
                h += `<div class="db-chart-card"><div class="db-chart-header"><h3>${c.title}</h3>
                    ${c.sub ? `<span class="db-chart-sub" id="${c.sub}">Dữ liệu tháng này</span>` : ''}
                    </div><div class="db-chart-body"><canvas id="${c.id}"></canvas></div></div>`;
            });
            h += `</div>`;
        }

        // ── Analytics ──
        if (cfg.analytics.length) {
            const meta = {
                products:           { title: 'Top sản phẩm',                icon: 'bi-box-seam' },
                customers:          { title: 'Top khách hàng',              icon: 'bi-people' },
                customersByCount:   { title: 'Top khách hàng (số đơn)',     icon: 'bi-people' },
                customersByRevenue: { title: 'Top khách hàng (doanh thu)',  icon: 'bi-currency-dollar' },
                drivers:            { title: 'Top tài xế',                  icon: 'bi-truck' },
                importProducts:     { title: 'Top sản phẩm nhập',          icon: 'bi-box-arrow-in-down' },
            };
            h += `<div class="db-analytics-row">`;
            cfg.analytics.forEach(type => {
                const m = meta[type] || { title: type, icon: 'bi-bar-chart' };
                h += `<div class="db-analytics-card"><div class="db-analytics-header"><i class="bi ${m.icon}"></i> ${m.title}</div>
                    <div id="db-analytics-${type}" class="db-analytics-body"><div class="db-loading">Đang tải…</div></div></div>`;
            });
            h += `</div>`;
        }

        // ── Footer ──
        h += `<div class="db-footer"><span><i class="bi bi-clock"></i> Cập nhật lúc: <strong id="db-update-time">--:--</strong></span></div>`;

        container.innerHTML = h;
    },

    // ═══════════════════════════════════════════════════
    // DATA LOADING — Fetch → Compute → Populate widgets
    // ═══════════════════════════════════════════════════
    async loadData() {
        try {
            const p = this.getPermissions();
            const cfg = this._getConfig();

            // 1. Dashboard stats (server-cached, 5min TTL)
            const statsRes = await fetch('/api/reports/dashboard');
            const statsJson = await statsRes.json();
            const stats = statsJson.data || statsJson || {};
            this._statsData = stats;

            // 2. Orders data (pending + assigned) for charts & analytics
            let allOrders = [], pendingOrders = [];
            if (!p.isImportMgr) {
                const ordersRes = await fetch('/api/orders');
                const ordersJson = await ordersRes.json();
                pendingOrders = ordersJson.pending || [];
                allOrders = [...pendingOrders, ...(ordersJson.assigned || [])];
            }

            // 3. Period filter
            const period = document.getElementById('db-period')?.value || 'month';
            const filtered = this._filterByPeriod(allOrders, period);

            // 4. Computed stats
            stats.totalRevenue = filtered.reduce((s, o) => s + (parseFloat(o.amount || o.sale_order_amount) || 0), 0);
            stats.avgOrderValue = stats.completedTotal ? stats.totalRevenue / Math.max(stats.completedTotal, 1) : 0;

            // ── DRIVER: Fetch personal orders ──
            if (p.isDriver) {
                await this._loadDriverData(stats, allOrders);
            }

            // ── SALES: Count pending confirmations ──
            if (p.isSales) {
                try {
                    const cRes = await fetch('/api/orders/pending-confirm?type=export');
                    const cJson = await cRes.json();
                    stats.pendingConfirmation = Array.isArray(cJson.data || cJson) ? (cJson.data || cJson).length : 0;
                } catch (_e) { stats.pendingConfirmation = 0; }
            }

            // ── IMPORT MANAGER: fetch imports for chart ──
            if (p.isImportMgr || cfg.charts.includes('imports') || cfg.analytics.includes('importProducts')) {
                try {
                    const impRes = await fetch('/api/imports');
                    const impJson = await impRes.json();
                    this._importsData = impJson.data || [];
                } catch (_e) { this._importsData = []; }
            }

            // ═══════ RENDER ALL WIDGETS ═══════
            this._renderKPIs(stats, cfg);

            // Charts
            if (cfg.charts.includes('orders'))  this._renderOrdersChart(filtered);
            if (cfg.charts.includes('revenue')) this._renderValueChart(filtered);
            if (cfg.charts.includes('myTrips')) this._renderMyTripsChart(this._myOrders || []);
            if (cfg.charts.includes('imports')) this._renderImportsChart(this._importsData || []);

            // Analytics
            this._renderAnalytics(cfg, filtered, p);

            // Special Panels
            if (cfg.panels.includes('myOrders'))   this._renderMyOrdersPanel();
            if (cfg.panels.includes('unassigned')) this._renderUnassignedPanel(pendingOrders);

            // Timestamp
            const t = document.getElementById('db-update-time');
            if (t) t.textContent = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

        } catch (e) {
            console.error('📊 Dashboard load error:', e);
        }
    },

    // Driver-specific data loader — uses /api/orders/my/:name
    async _loadDriverData(stats, fallbackOrders) {
        const myName = (window.state?.user?.fullName || window.state?.user?.name || '').trim();
        if (!myName) { this._myOrders = []; return; }

        try {
            const res = await fetch(`/api/orders/my/${encodeURIComponent(myName)}`);
            const json = await res.json();
            let orders = json.data || json.orders || json;
            if (!Array.isArray(orders)) orders = [];
            this._myOrders = orders;
        } catch (_e) {
            // Fallback: filter from loaded orders
            const nameLower = myName.toLowerCase();
            this._myOrders = fallbackOrders.filter(o => {
                const d = (o.taiXe || o.driver || o.custom_field13 || '').toLowerCase();
                const a = (o.assistant_name || o.phuXe || '').toLowerCase();
                return d.includes(nameLower) || a.includes(nameLower);
            });
        }

        const comp = ['đã thực hiện', 'completed', 'hoàn thành', 'đã giao hàng'];
        stats.myTotalOrders     = this._myOrders.length;
        stats.myCompletedOrders = this._myOrders.filter(o => comp.includes((o.status || o.delivery_status || '').toLowerCase().trim())).length;
        stats.myDeliveringOrders = stats.myTotalOrders - stats.myCompletedOrders;
        stats.myTrips            = stats.myCompletedOrders;
    },

    onPeriodChange() { this.loadData(); },

    // ═══════════════════════════════════════════════════
    // KPI CARDS
    // ═══════════════════════════════════════════════════
    _kpiDefs: {
        total:            { label: 'Tổng đơn hàng',     icon: 'bi-clipboard-data',    c1: '#4dabf7', c2: '#339af0', field: 'totalOrders' },
        pending:          { label: 'Chờ xử lý',         icon: 'bi-hourglass-split',   c1: '#ffa94d', c2: '#fd7e14', field: 'pendingOrders' },
        delivering:       { label: 'Đang giao',         icon: 'bi-truck',             c1: '#74c0fc', c2: '#4dabf7', field: 'deliveringOrders' },
        completed:        { label: 'Hoàn thành',        icon: 'bi-check-circle',      c1: '#69db7c', c2: '#40c057', field: 'completedTotal', showRate: true },
        revenue:          { label: 'Doanh thu',          icon: 'bi-currency-dollar',   c1: '#b197fc', c2: '#845ef7', field: 'totalRevenue', fmt: 'billion' },
        avgOrder:         { label: 'TB / đơn',          icon: 'bi-calculator',        c1: '#fcc419', c2: '#fab005', field: 'avgOrderValue', fmt: 'billion' },
        imports:          { label: 'Đơn nhập',          icon: 'bi-box-arrow-in-down', c1: '#f783ac', c2: '#e64980', field: 'totalImports' },
        myTotal:          { label: 'Đơn của tôi',       icon: 'bi-person-badge',      c1: '#4dabf7', c2: '#339af0', field: 'myTotalOrders' },
        myDelivering:     { label: 'Đang giao',          icon: 'bi-truck',             c1: '#ffa94d', c2: '#fd7e14', field: 'myDeliveringOrders' },
        myCompleted:      { label: 'Đã hoàn thành',     icon: 'bi-check-circle',      c1: '#69db7c', c2: '#40c057', field: 'myCompletedOrders' },
        myTrips:          { label: 'Tổng chuyến',       icon: 'bi-signpost-2',        c1: '#b197fc', c2: '#845ef7', field: 'myTrips' },
        pendingConfirm:   { label: 'Chờ xác nhận',      icon: 'bi-clipboard-check',   c1: '#f783ac', c2: '#e64980', field: 'pendingConfirmation' },
        importTotal:      { label: 'Tổng phiếu nhập',   icon: 'bi-box-arrow-in-down', c1: '#4dabf7', c2: '#339af0', field: 'totalImports' },
        importPending:    { label: 'Chờ xử lý',         icon: 'bi-hourglass-split',   c1: '#ffa94d', c2: '#fd7e14', field: 'pendingImports' },
        importDelivering: { label: 'Đang vận chuyển',   icon: 'bi-truck',             c1: '#74c0fc', c2: '#4dabf7', field: 'deliveringImports' },
        importCompleted:  { label: 'Hoàn thành',        icon: 'bi-check-circle',      c1: '#69db7c', c2: '#40c057', field: 'completedImports' },
    },

    _renderKPIs(stats, cfg) {
        const row = document.getElementById('db-kpi-row');
        if (!row) return;

        row.innerHTML = cfg.kpis.map((key, idx) => {
            const d = this._kpiDefs[key];
            if (!d) return '';
            let val = stats[d.field] ?? 0;
            let sub = null, isText = false;

            if (d.showRate) {
                const base = stats.totalOrders || stats.myTotalOrders || 1;
                sub = Math.round((val / Math.max(base, 1)) * 100) + '% tỷ lệ';
            }
            if (d.fmt === 'billion') { val = this._formatBillion(val); isText = true; }

            return this._kpiCard(d.label, val, d.icon, d.c1, d.c2, sub, isText, idx);
        }).join('');

        // Animate numeric counters with stagger
        row.querySelectorAll('.db-kpi-value[data-target]').forEach(el => {
            this._animateCount(el, parseInt(el.dataset.target) || 0);
        });
    },

    _kpiCard(label, value, icon, c1, c2, subText, isText, idx) {
        const display = isText ? value : '0';
        const attr    = isText ? '' : `data-target="${value}"`;
        return `<div class="db-kpi-card" style="background:linear-gradient(135deg,${c1},${c2});animation-delay:${(idx || 0) * 0.06}s">
            <div class="db-kpi-icon"><i class="bi ${icon}"></i></div>
            <div class="db-kpi-info">
                <span class="db-kpi-label">${label}</span>
                <span class="db-kpi-value" ${attr}>${display}</span>
                ${subText ? `<span class="db-kpi-sub">${subText}</span>` : ''}
            </div>
        </div>`;
    },

    _animateCount(el, target) {
        if (!target) { el.textContent = '0'; return; }
        const dur = 800, start = performance.now();
        const step = (now) => {
            const t = Math.min((now - start) / dur, 1);
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            el.textContent = Math.floor(eased * target).toLocaleString('vi-VN');
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },

    // ═══════════════════════════════════════════════════
    // CHARTS
    // ═══════════════════════════════════════════════════
    _chartOpts(extra) {
        return {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ...(extra?.yTicks ? { ticks: extra.yTicks } : {}) },
                x: { grid: { display: false } },
            },
        };
    },

    _groupByDate(items, dateField, valueField) {
        const g = {};
        items.forEach(o => {
            const raw = o[dateField] || o.ngay || o.sale_order_date || o.created_at || '';
            const d = String(raw).split('T')[0];
            if (!d) return;
            g[d] = (g[d] || 0) + (valueField ? (parseFloat(o[valueField] || o.amount || o.sale_order_amount) || 0) : 1);
        });
        return g;
    },

    _renderOrdersChart(orders) {
        const ctx = document.getElementById('db-chart-orders');
        if (!ctx) return;
        if (this.charts.orders) this.charts.orders.destroy();
        const g = this._groupByDate(orders);
        const labels = Object.keys(g).sort().slice(-14);
        this.charts.orders = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map(d => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
                datasets: [{ label: 'Số đơn', data: labels.map(d => g[d] || 0),
                    borderColor: '#4dabf7', backgroundColor: 'rgba(77,171,247,0.08)',
                    tension: 0.4, fill: true, pointRadius: 4,
                    pointBackgroundColor: '#4dabf7', pointBorderColor: '#fff', pointBorderWidth: 2 }],
            },
            options: this._chartOpts(),
        });
    },

    _renderValueChart(orders) {
        const ctx = document.getElementById('db-chart-value');
        if (!ctx) return;
        if (this.charts.value) this.charts.value.destroy();
        const g = {};
        orders.forEach(o => {
            const d = (o.ngay || o.sale_order_date || '').split('T')[0];
            if (d) g[d] = (g[d] || 0) + (parseFloat(o.amount || o.sale_order_amount) || 0);
        });
        const labels = Object.keys(g).sort().slice(-14);
        this.charts.value = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(d => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
                datasets: [{ label: 'Giá trị', data: labels.map(d => g[d] || 0),
                    backgroundColor: 'rgba(81,207,102,0.7)', borderColor: '#40c057', borderWidth: 1, borderRadius: 4 }],
            },
            options: this._chartOpts({ yTicks: { callback: v => (v / 1e6).toFixed(0) + 'M' } }),
        });
    },

    _renderMyTripsChart(orders) {
        const ctx = document.getElementById('db-chart-my-trips');
        if (!ctx) return;
        if (this.charts.myTrips) this.charts.myTrips.destroy();

        // Pre-fill 7 days so the chart always shows a full week
        const g = {}, now = new Date();
        for (let i = 6; i >= 0; i--) {
            g[new Date(now.getTime() - i * 864e5).toISOString().split('T')[0]] = 0;
        }
        orders.forEach(o => {
            const d = (o.ngay || o.sale_order_date || o.created_at || '').split('T')[0];
            if (d && d in g) g[d]++;
        });
        const labels = Object.keys(g);
        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

        this.charts.myTrips = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(d => { const dt = new Date(d); return dayNames[dt.getDay()] + '\n' + dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }); }),
                datasets: [{ label: 'Đơn', data: labels.map(d => g[d]),
                    backgroundColor: 'rgba(77,171,247,0.6)', borderColor: '#339af0', borderWidth: 1, borderRadius: 6 }],
            },
            options: this._chartOpts(),
        });
    },

    _renderImportsChart(imports) {
        const ctx = document.getElementById('db-chart-imports');
        if (!ctx) return;
        if (this.charts.imports) this.charts.imports.destroy();
        const g = {};
        imports.forEach(t => {
            const d = (t.expected_date || t.created_at || '').split('T')[0];
            if (d) g[d] = (g[d] || 0) + 1;
        });
        const labels = Object.keys(g).sort().slice(-14);
        this.charts.imports = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(d => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
                datasets: [{ label: 'Phiếu nhập', data: labels.map(d => g[d] || 0),
                    backgroundColor: 'rgba(247,131,172,0.6)', borderColor: '#e64980', borderWidth: 1, borderRadius: 4 }],
            },
            options: this._chartOpts(),
        });
    },

    // ═══════════════════════════════════════════════════
    // ANALYTICS — Horizontal bar rankings
    // ═══════════════════════════════════════════════════
    _renderAnalytics(cfg, filtered, p) {
        cfg.analytics.forEach(type => {
            const id = `db-analytics-${type}`;
            switch (type) {
                case 'products':           this._renderTopProducts(filtered, id); break;
                case 'customers':          this._renderTopCustomers(filtered, true, id); break;
                case 'customersByCount':   this._renderTopCustomers(filtered, false, id); break;
                case 'customersByRevenue': this._renderTopCustomers(filtered, true, id); break;
                case 'drivers':            this._renderTopDrivers(filtered, p.isAdmin, id); break;
                case 'importProducts':     this._renderImportProducts(this._importsData || [], id); break;
            }
        });
    },

    // Shared horizontal bar renderer
    _barHTML(sorted, max, c1, c2, fmtVal) {
        if (!sorted.length) return '<div class="db-empty">Không có dữ liệu</div>';
        return sorted.map(([name, val], i) => `
            <div class="db-bar-item" style="animation-delay:${i * 0.06}s">
                <div class="db-bar-label"><span class="db-bar-rank">${i + 1}</span> ${name}</div>
                <div class="db-bar-track"><div class="db-bar-fill" style="width:${(val / max * 100).toFixed(0)}%;background:linear-gradient(90deg,${c1},${c2})"></div></div>
                <div class="db-bar-value">${fmtVal(val)}</div>
            </div>`).join('');
    },

    _renderTopProducts(orders, elId) {
        const el = document.getElementById(elId); if (!el) return;
        const counts = {};
        orders.forEach(o => (o.products || o.cart || []).forEach(p => {
            const n = p.tenVatTu || p.name || p.productName || '?';
            counts[n] = (counts[n] || 0) + (parseInt(p.soLuong || p.qty) || 1);
        }));
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        el.innerHTML = this._barHTML(sorted, sorted[0]?.[1] || 1, '#4dabf7', '#339af0', v => v.toLocaleString('vi-VN'));
    },

    _renderTopCustomers(orders, showRevenue, elId) {
        const el = document.getElementById(elId); if (!el) return;
        const st = {};
        orders.forEach(o => {
            const n = o.khach || o.account_name || '?';
            if (!st[n]) st[n] = { count: 0, value: 0 };
            st[n].count++;
            st[n].value += parseFloat(o.amount || o.sale_order_amount) || 0;
        });
        const key = showRevenue ? 'value' : 'count';
        const sorted = Object.entries(st).sort((a, b) => b[1][key] - a[1][key]).slice(0, 5).map(([n, s]) => [n, s[key]]);
        const max = sorted[0]?.[1] || 1;
        el.innerHTML = this._barHTML(sorted, max, '#69db7c', '#40c057',
            showRevenue ? v => this._formatBillion(v) : v => v + ' đơn');
    },

    _renderTopDrivers(orders, showRevenue, elId) {
        const el = document.getElementById(elId); if (!el) return;
        const st = {};
        orders.forEach(o => {
            const d = o.taiXe || o.driver || o.custom_field13; if (!d) return;
            if (!st[d]) st[d] = { count: 0, value: 0, merged: new Set() };
            if (o.merged_order_no) {
                if (!st[d].merged.has(o.merged_order_no)) { st[d].count++; st[d].merged.add(o.merged_order_no); }
            } else st[d].count++;
            st[d].value += parseFloat(o.amount || o.sale_order_amount) || 0;
        });
        const sorted = Object.entries(st).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
        const max = sorted[0]?.[1].count || 1;
        if (!sorted.length) { el.innerHTML = '<div class="db-empty">Không có dữ liệu</div>'; return; }
        el.innerHTML = sorted.map(([name, s], i) => `
            <div class="db-bar-item" style="animation-delay:${i * 0.06}s">
                <div class="db-bar-label"><span class="db-bar-rank">${i + 1}</span> ${name}</div>
                <div class="db-bar-track"><div class="db-bar-fill" style="width:${(s.count / max * 100).toFixed(0)}%;background:linear-gradient(90deg,#b197fc,#845ef7)"></div></div>
                <div class="db-bar-value">${s.count} chuyến${showRevenue ? ' · ' + this._formatBillion(s.value) : ''}</div>
            </div>`).join('');
    },

    _renderImportProducts(imports, elId) {
        const el = document.getElementById(elId); if (!el) return;
        const counts = {};
        imports.forEach(t => {
            let prods = t.products || [];
            if (typeof prods === 'string') try { prods = JSON.parse(prods); } catch (_) { prods = []; }
            prods.forEach(p => {
                const n = p.tenVatTu || p.name || p.productName || '?';
                counts[n] = (counts[n] || 0) + (parseInt(p.soLuong || p.qty || p.quantity) || 1);
            });
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        el.innerHTML = this._barHTML(sorted, sorted[0]?.[1] || 1, '#f783ac', '#e64980', v => v.toLocaleString('vi-VN'));
    },

    // ═══════════════════════════════════════════════════
    // SPECIAL PANELS
    // ═══════════════════════════════════════════════════

    // Driver panel: show MY active (non-completed) orders
    _renderMyOrdersPanel() {
        const panel = document.getElementById('db-my-orders-panel'); if (!panel) return;
        const orders = this._myOrders || [];
        const completedSt = ['đã thực hiện', 'completed', 'hoàn thành', 'đã giao hàng', 'đã hủy bỏ', 'cancelled'];
        const active = orders.filter(o => !completedSt.includes((o.status || o.delivery_status || '').toLowerCase().trim()));

        if (!active.length) {
            panel.innerHTML = `<div class="db-empty-state">
                <i class="bi bi-emoji-smile"></i>
                <p>Không có đơn cần giao</p>
                <span>Bạn đã hoàn thành tất cả đơn hàng!</span>
            </div>`;
            return;
        }

        panel.innerHTML = active.slice(0, 8).map((o, i) => {
            const productCount = (o.products || o.cart || o.local_items || []).length;
            return `<div class="db-order-card" style="animation-delay:${i * 0.06}s">
                <div class="db-order-card-header">
                    <span class="db-order-code"><i class="bi bi-receipt"></i> ${o.soDon || o.sale_order_no || o.ticket_no || o.id || '—'}</span>
                    <span class="db-order-badge db-badge-active">${o.status || 'Chờ giao'}</span>
                </div>
                <div class="db-order-card-body">
                    <div class="db-order-field"><i class="bi bi-person"></i> ${o.khach || o.account_name || o.supplier_name || '—'}</div>
                    <div class="db-order-field"><i class="bi bi-geo-alt"></i> ${this._truncate(o.diaChi || o.shipping_address || o.supplier_address || '', 55)}</div>
                    ${productCount ? `<div class="db-order-field"><i class="bi bi-box"></i> ${productCount} sản phẩm</div>` : ''}
                </div>
            </div>`;
        }).join('') +
        (active.length > 8 ? `<div class="db-panel-more" onclick="showSection('pending-orders')">Xem tất cả ${active.length} đơn →</div>` : '');
    },

    // Dispatcher panel: unassigned orders needing driver assignment
    _renderUnassignedPanel(pendingOrders) {
        const panel = document.getElementById('db-unassigned-panel'); if (!panel) return;
        const unassigned = pendingOrders.filter(o => !o.taiXe && !o.driver && !o.custom_field13);

        if (!unassigned.length) {
            panel.innerHTML = `<div class="db-empty-state">
                <i class="bi bi-check2-all"></i>
                <p>Tất cả đơn đã được phân công</p>
            </div>`;
            return;
        }

        panel.innerHTML =
            `<div class="db-panel-count"><i class="bi bi-exclamation-circle-fill"></i> ${unassigned.length} đơn chờ phân công tài xế</div>` +
            unassigned.slice(0, 6).map((o, i) => `
                <div class="db-order-card db-order-urgent" style="animation-delay:${i * 0.06}s" onclick="showSection('dispatch')" title="Nhấn để điều phối">
                    <div class="db-order-card-header">
                        <span class="db-order-code">${o.soDon || o.sale_order_no || o.id || '—'}</span>
                        <span class="db-order-date">${o.ngay ? new Date(o.ngay).toLocaleDateString('vi-VN') : ''}</span>
                    </div>
                    <div class="db-order-card-body">
                        <div class="db-order-field"><i class="bi bi-person"></i> ${o.khach || o.account_name || '—'}</div>
                        <div class="db-order-field"><i class="bi bi-geo-alt"></i> ${this._truncate(o.diaChi || o.shipping_address || '', 50)}</div>
                    </div>
                </div>`).join('') +
            (unassigned.length > 6 ? `<div class="db-panel-more" onclick="showSection('dispatch')">Xem thêm ${unassigned.length - 6} đơn →</div>` : '');
    },

    // ═══════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════
    _formatBillion(v) {
        if (v >= 1e9) return (v / 1e9).toFixed(2) + ' Tỷ';
        if (v >= 1e6) return (v / 1e6).toFixed(1) + ' Tr';
        if (v >= 1e3) return Math.round(v / 1e3) + 'K đ';
        return Number(v).toLocaleString('vi-VN') + 'đ';
    },

    _filterByPeriod(orders, period) {
        if (period === 'all') return orders;
        const now = new Date();
        return orders.filter(o => {
            const d = new Date(o.ngay || o.sale_order_date || o.created_at);
            if (isNaN(d.getTime())) return false;
            switch (period) {
                case 'today': return d.toDateString() === now.toDateString();
                case 'week':  return d >= new Date(now.getTime() - 7 * 864e5);
                case 'month': return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                case 'year':  return d.getFullYear() === now.getFullYear();
                default: return true;
            }
        });
    },

    _truncate(str, len) {
        if (!str) return '—';
        return str.length > len ? str.substring(0, len) + '…' : str;
    },
};

// Export globally
window.DashboardModule = DashboardModule;
if (typeof AppRouter !== 'undefined') AppRouter.registerModule('dashboard', DashboardModule);
