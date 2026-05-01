// ===============================================
// MODULE: LỊCH SỬ ĐƠN HÀNG (Order History)
// ===============================================

const OrderHistoryModule = {
    history: [],
    filteredHistory: [], // Stores filtered/sorted results
    currentPage: 1,
    itemsPerPage: 500,
    totalPages: 1,
    useCardLayout: false, // Table by default - toggle with button group
    searchQuery: '',
    dateFilter: null,

    // Khởi tạo module
    init() {
        console.log('📋 Order History Module initialized');
        console.log('🎨 Layout mode:', this.useCardLayout ? 'CARDS' : 'TABLE');

        // Attach button event listeners
        this.setupToggleButtons();

        this.loadOverviewStats();
        this.loadHistory();
    },

    // Load commercial overview stats
    async loadOverviewStats() {
        try {
            const response = await fetch('/api/reports/dashboard');
            const data = await response.json();

            if (data.error) {
                console.error('Error loading dashboard stats:', data.msg);
                return;
            }

            const stats = data.data || data;

            // Total Orders
            const totalEl = document.getElementById('history-stat-total');
            if (totalEl) totalEl.textContent = (stats.totalOrders || 0).toLocaleString();

            // Pending Orders
            const pendingEl = document.getElementById('history-stat-pending');
            if (pendingEl) pendingEl.textContent = (stats.pendingOrders || 0).toLocaleString();

            // Completed Orders
            const completedEl = document.getElementById('history-stat-completed');
            if (completedEl) completedEl.textContent = (stats.completedTotal || 0).toLocaleString();

            // Calculation rate
            const total = stats.totalOrders || 0;
            const completed = stats.completedTotal || 0;
            const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
            const rateEl = document.getElementById('history-stat-rate');
            if (rateEl) {
                rateEl.innerHTML = `<i class="bi bi-check-circle"></i> ${rate}% tỷ lệ hoàn thành`;
            }

        } catch (error) {
            console.error('Error loading overview stats:', error);
        }
    },

    // Setup toggle button event listeners
    setupToggleButtons() {
        const cardsBtn = document.getElementById('btn-cards-view');
        const tableBtn = document.getElementById('btn-table-view');

        if (cardsBtn) {
            cardsBtn.addEventListener('click', () => {
                console.log('🔘 Cards button clicked');
                this.setView('cards');
            });
        }

        if (tableBtn) {
            tableBtn.addEventListener('click', () => {
                console.log('🔘 Table button clicked');
                this.setView('table');
            });
        }

        console.log('✅ Toggle buttons attached');
    },

    // Load lịch sử
    async loadHistory(page = 1) {
        try {
            // Check if current user is driver - filter by their name
            const isDriver = (window.state?.user?.role || '').toLowerCase() === 'driver';
            const driverName = window.state?.user?.name || '';

            let url = `/api/reports/order-history?page=${page}&limit=${this.itemsPerPage}`;

            // Add driver filter for driver role
            if (isDriver && driverName) {
                url += `&driver=${encodeURIComponent(driverName)}`;
                console.log(`📋 Loading order history for driver: ${driverName}`);
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                console.error('Error from API:', data.msg);
                this.loadMockHistory();
                return;
            }

            this.history = data.data || data.orders || data.history || [];
            this.filteredHistory = [...this.history]; // Initialize filtered with all data
            this.totalPages = data.totalPages || Math.ceil((data.total || this.history.length) / this.itemsPerPage);
            this.currentPage = page;
            this.renderHistory();
        } catch (error) {
            console.error('Error loading history:', error);
            this.loadMockHistory();
        }
    },

    // Load mock data
    loadMockHistory() {
        this.history = [
            {
                id: 'ORD001',
                customer: 'Công ty TNHH ABC',
                date: '2024-07-28',
                total: 15000000,
                status: 'Hoàn thành',
                driver: 'Nguyễn Văn A',
                completedDate: '2024-07-28 15:30'
            },
            {
                id: 'ORD002',
                customer: 'Công ty XYZ',
                date: '2024-07-27',
                total: 25000000,
                status: 'Hoàn thành',
                driver: 'Trần Thị B',
                completedDate: '2024-07-27 16:45'
            },
            {
                id: 'ORD003',
                customer: 'Công ty DEF',
                date: '2024-07-26',
                total: 18000000,
                status: 'Đã hủy',
                driver: null,
                completedDate: null,
                cancelReason: 'Khách hàng hủy đơn'
            },
            {
                id: 'ORD004',
                customer: 'Công ty GHI',
                date: '2024-07-25',
                total: 32000000,
                status: 'Hoàn thành',
                driver: 'Lê Văn C',
                completedDate: '2024-07-25 14:20'
            },
            {
                id: 'ORD005',
                customer: 'Công ty JKL',
                date: '2024-07-24',
                total: 12000000,
                status: 'Hoàn thành',
                driver: 'Nguyễn Văn A',
                completedDate: '2024-07-24 17:00'
            }
        ];
        this.renderHistory();
    },

    // Render lịch sử (Router)
    renderHistory() {
        // Use filteredHistory if available, otherwise use all history
        const dataToRender = this.filteredHistory.length > 0 ? this.filteredHistory : this.history;
        console.log('🎨 Layout:', this.useCardLayout ? 'CARDS' : 'TABLE', '| Data:', dataToRender.length);
        if (this.useCardLayout) {
            this.renderCards(dataToRender);
        } else {
            this.renderTable(dataToRender);
        }
        this.renderPagination();
    },

    // NEW: Render as compact rows (matching dispatch view)
    renderCards(data) {
        const orders = data || this.history;
        const container = document.getElementById('history-cards-container');
        const tableContainer = document.getElementById('history-table-container');

        if (!container) {
            console.error('❌ Cards container not found! Falling back to table.');
            this.useCardLayout = false;
            this.renderTable(orders);
            return;
        }

        container.classList.remove('hidden');
        if (tableContainer) tableContainer.classList.add('hidden');

        if (orders.length === 0) {
            console.log('⚠️ No history data to display');
            container.innerHTML = '<div class="history-empty-state"><i class="bi bi-inbox"></i><h4>Không tìm thấy đơn hàng</h4></div>';
            return;
        }

        console.log('🎴 Rendering', orders.length, 'compact rows...');

        // Compact row-based layout
        container.innerHTML = `
            <div class="compact-order-list" style="display: flex; flex-direction: column; gap: 0;">
                ${orders.map(order => {
            const orderId = order.orderCode || order.id || 'N/A';
            const customer = order.customerName || order.accountName || order.khach || order.account_name || 'N/A';
            const address = order.shippingAddress || order.shipping_address || order.diaChi || 'Sunco';
            const date = order.orderDate || order.order_date || order.createdAt;
            const amount = order.totalAmount || order.total_amount || 0;
            const status = order.status || 'N/A';
            const driver = order.driverName || order.driver_name || order.taiXe || '-';
            const statusClass = this.getStatusClass(status);
            const statusText = this.getStatusText(status);
            const orderType = order.orderType || 'export';
            const isImport = orderType === 'import';

            // Check permission to view price
            const currentUser = window.state?.user || {};
            const role = String(currentUser.role || '').toLowerCase();
            const isAdmin = role === 'admin' || role === 'tester';
            const isCreator = order.creatorName && currentUser.name && order.creatorName === currentUser.name;
            const canViewPrice = isAdmin || isCreator;
            const displayAmount = canViewPrice ? `${amount.toLocaleString('vi-VN')}đ` : '***';

            return `
                        <div class="compact-order-row" onclick="OrderHistoryModule.viewDetail('${orderId}')" style="
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            padding: 12px 16px;
                            background: var(--card-bg);
                            border-radius: 8px;
                            margin-bottom: 8px;
                            cursor: pointer;
                            border-left: 4px solid ${status === 'Hoàn thành' || status === 'COMPLETED' || status === 'DONE' ? 'var(--success)' :
                    status === 'Đã hủy' || status === 'Đã hủy bỏ' || status === 'CANCELLED' ? 'var(--danger)' : 'var(--warning)'};
                            transition: all 0.15s ease;
                        " onmouseenter="this.style.background='var(--hover-bg)'" onmouseleave="this.style.background='var(--card-bg)'">
                            
                            <!-- Order ID -->
                            <div style="min-width: 140px; font-weight: 600; color: ${isImport ? '#16a34a' : 'var(--primary)'}; font-size: 13px;">
                                ${orderId}
                                ${isImport ? '<span style="background:#4CAF50; color:white; padding:1px 5px; border-radius:4px; font-size:9px; margin-left:4px;">Nhập</span>' : ''}
                                ${order.merged_order_no ? `<span style="background:#4c6ef5; color:white; padding:1px 5px; border-radius:4px; font-size:9px; margin-left:4px;" title="Chuyến ghép: ${order.merged_order_no}"><i class="bi bi-link-45deg"></i></span>` : ''}
                            </div>
                            
                            <!-- Customer (flex-grow) -->
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px;">
                                    ${customer}
                                </div>
                                <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <i class="bi bi-geo-alt" style="font-size: 10px;"></i> ${address}
                                </div>
                            </div>
                            
                            <!-- Date -->
                            <div style="min-width: 80px; font-size: 12px; color: var(--text-secondary); text-align: center;">
                                ${date ? new Date(date).toLocaleDateString('vi-VN') : 'N/A'}
                            </div>
                            
                            <!-- Driver -->
                            <div style="min-width: 100px; font-size: 12px; color: var(--text-secondary); text-align: center;">
                                ${driver !== '-' ? `<span style="color: var(--info);">${driver}</span>` : '<span style="opacity:0.5;">—</span>'}
                            </div>
                            
                            <!-- Amount -->
                            <div style="min-width: 100px; font-size: 12px; font-weight: 600; color: var(--text-primary); text-align: right;">
                                ${displayAmount}
                            </div>
                            
                            <!-- Status Badge -->
                            <div style="min-width: 90px; text-align: center;">
                                <span class="badge badge-${statusClass}" style="font-size: 11px; padding: 4px 10px;">
                                    ${statusText}
                                </span>
                            </div>
                            
                            <!-- Actions -->
                            <div style="display: flex; gap: 6px;" onclick="event.stopPropagation()">
                                <button class="btn btn-outline btn-sm" onclick="OrderHistoryModule.viewDetail('${orderId}')" style="padding: 4px 10px; font-size: 11px;">
                                    <i class="bi bi-eye"></i>
                                </button>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;

        console.log('✅ Rendered', orders.length, 'compact rows');
    },

    // Render as split table (Export + Import side by side)
    renderTable(data) {
        const orders = data || this.history;
        const cardsContainer = document.getElementById('history-cards-container');
        const tableContainer = document.getElementById('history-table-container');

        if (!tableContainer) {
            console.error('❌ Table container not found!');
            return;
        }

        if (cardsContainer) cardsContainer.classList.add('hidden');
        tableContainer.classList.remove('hidden');

        // Split orders by type
        const exportOrders = orders.filter(o => (o.orderType || 'export') === 'export');
        const importOrders = orders.filter(o => o.orderType === 'import');

        // Permission check helper
        const currentUser = window.state?.user || {};
        const role = String(currentUser.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'tester';

        const canViewPrice = (order) => {
            const isCreator = order.creatorName && currentUser.name && order.creatorName === currentUser.name;
            return isAdmin || isCreator;
        };

        // Products formatter
        const formatProducts = (products) => {
            if (!products || !Array.isArray(products) || products.length === 0) return '—';
            return products.map(p => {
                const name = p.name || p.code || p.product || 'SP';
                const qty = Number(p.qty || p.quantity || 0).toLocaleString('vi-VN');
                const unit = p.unit || 'Kg';
                return `${name}: ${qty} ${unit}`;
            }).join('<br>');
        };

        // Render export row
        const renderExportRow = (order) => {
            const orderId = order.orderCode || order.id || 'N/A';
            const customer = order.customerName || order.accountName || 'N/A';
            const driver = order.driverName || order.driver_name || '—';
            const assistant = order.assistantName || '—';
            const orderDate = order.orderDate || order.order_date || order.createdAt;
            const fmtDate = orderDate ? new Date(orderDate).toLocaleDateString('vi-VN') : '—';
            const products = formatProducts(order.products);

            return `
            <tr onclick="OrderHistoryModule.viewDetail('${orderId}')" style="cursor:pointer;" class="history-row">
                <td style="font-size:12px; white-space:nowrap;">${fmtDate}</td>
                <td><strong>${orderId}</strong></td>
                <td>${customer}</td>
                <td style="font-size:11px; line-height:1.4;">${products}</td>
                <td>${order.plate || '—'}</td>
                <td>${driver}</td>
            </tr>`;
        };

        // Render import row
        const renderImportRow = (order) => {
            const orderId = order.orderCode || order.id || 'N/A';
            const supplier = order.customerName || 'N/A';
            const driver = order.driverName || '—';
            const assistant = order.assistantName || '—';
            const orderDate = order.orderDate || order.order_date || order.createdAt;
            const fmtDate = orderDate ? new Date(orderDate).toLocaleDateString('vi-VN') : '—';
            const products = formatProducts(order.products);

            return `
            <tr onclick="OrderHistoryModule.viewDetail('${orderId}')" style="cursor:pointer;" class="history-row">
                <td style="font-size:12px; white-space:nowrap;">${fmtDate}</td>
                <td><strong style="color:#16a34a;">${orderId}</strong></td>
                <td>${supplier}</td>
                <td style="font-size:11px; line-height:1.4;">${products}</td>
                <td>${order.plate || '—'}</td>
                <td>${driver}</td>
            </tr>`;
        };

        const emptyRow = (cols, text) => `<tr><td colspan="${cols}" style="text-align:center; padding:30px; color:#9CA3AF;"><i class="bi bi-inbox" style="font-size:32px; display:block; margin-bottom:8px;"></i>${text}</td></tr>`;

        tableContainer.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                <!-- Export Table -->
                <div>
                    <h4 style="margin:0 0 8px; font-size:14px; color:var(--primary); display:flex; align-items:center; gap:6px;">
                        <i class="bi bi-box-arrow-up-right"></i> Đơn Xuất
                        <span style="background:var(--primary); color:white; padding:2px 8px; border-radius:10px; font-size:11px;">${exportOrders.length}</span>
                    </h4>
                    <div style="overflow-x:auto; border:1px solid #E5E7EB; border-radius:8px;">
                        <table class="data-table" style="width:100%; font-size:12px;">
                            <thead>
                                <tr>
                                    <th>Ngày</th>
                                    <th>Mã Đơn</th>
                                    <th>Khách Hàng</th>
                                    <th>Sản Phẩm</th>
                                    <th>Biển Số</th>
                                    <th>Tài Xế</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${exportOrders.length > 0 ? exportOrders.map(renderExportRow).join('') : emptyRow(6, 'Không có đơn xuất')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Import Table -->
                <div>
                    <h4 style="margin:0 0 8px; font-size:14px; color:#16a34a; display:flex; align-items:center; gap:6px;">
                        <i class="bi bi-box-arrow-in-down-left"></i> Đơn Nhập
                        <span style="background:#16a34a; color:white; padding:2px 8px; border-radius:10px; font-size:11px;">${importOrders.length}</span>
                    </h4>
                    <div style="overflow-x:auto; border:1px solid #E5E7EB; border-radius:8px;">
                        <table class="data-table" style="width:100%; font-size:12px;">
                            <thead>
                                <tr>
                                    <th>Ngày</th>
                                    <th>Mã Đơn</th>
                                    <th>Nhà Cung Cấp</th>
                                    <th>Sản Phẩm</th>
                                    <th>Biển Số</th>
                                    <th>Tài Xế</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${importOrders.length > 0 ? importOrders.map(renderImportRow).join('') : emptyRow(6, 'Không có đơn nhập')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        console.log('✅ Rendered split tables:', exportOrders.length, 'export +', importOrders.length, 'import');
    },

    // Toggle between card/table views
    toggleView() {
        this.useCardLayout = !this.useCardLayout;
        console.log('🔄 Toggled to:', this.useCardLayout ? 'CARDS' : 'TABLE');

        // Update button text and icon
        const toggleText = document.getElementById('toggle-text');
        const toggleIcon = document.getElementById('toggle-icon');

        if (toggleText) {
            toggleText.textContent = this.useCardLayout ? 'Chuyển sang Table' : 'Chuyển sang Cards';
        }

        if (toggleIcon) {
            toggleIcon.className = this.useCardLayout ? 'bi bi-table' : 'bi bi-grid-3x3-gap';
        }

        this.renderHistory();
    },

    // Set specific view (for button group)
    setView(viewType) {
        this.useCardLayout = viewType === 'cards';
        console.log('🎯 Set view to:', viewType.toUpperCase());

        // Update button group active state
        const cardsBtn = document.getElementById('btn-cards-view');
        const tableBtn = document.getElementById('btn-table-view');

        if (cardsBtn && tableBtn) {
            if (this.useCardLayout) {
                cardsBtn.classList.add('active');
                tableBtn.classList.remove('active');
            } else {
                cardsBtn.classList.remove('active');
                tableBtn.classList.add('active');
            }
        }

        this.renderHistory();
    },

    // Search handler
    handleSearch(query) {
        this.searchQuery = query;
        console.log('🔍 Search:', query);
        this.renderHistory();
    },

    // Date filter handler
    handleDateFilter(date) {
        this.dateFilter = date;
        console.log('📅 Date filter:', date);
        this.renderHistory();
    },

    // Get status class
    getStatusClass(status) {
        const statusMap = {
            'Hoàn thành': 'success',
            'COMPLETED': 'success',
            'DONE': 'success',
            'Đã hủy': 'danger',
            'CANCELLED': 'danger'
        };
        return statusMap[status] || 'success';
    },

    // Get status text
    getStatusText(status) {
        const statusMap = {
            'COMPLETED': 'Hoàn thành',
            'DONE': 'Hoàn thành',
            'CANCELLED': 'Đã hủy'
        };
        return statusMap[status] || status;
    },

    // Render pagination
    renderPagination() {
        const container = document.getElementById('history-pagination');
        if (!container) return;

        container.innerHTML = `
            <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} onclick="OrderHistoryModule.goToPage(${this.currentPage - 1})">
                <i class="bi bi-chevron-left"></i>
            </button>
            <span class="pagination-info">Trang ${this.currentPage} / ${this.totalPages}</span>
            <button class="pagination-btn" ${this.currentPage === this.totalPages ? 'disabled' : ''} onclick="OrderHistoryModule.goToPage(${this.currentPage + 1})">
                <i class="bi bi-chevron-right"></i>
            </button>
        `;
    },

    // Go to page
    goToPage(page) {
        if (page < 1 || page > this.totalPages) return;
        this.loadHistory(page);
    },

    // View detail
    viewDetail(orderId) {
        const order = this.history.find(o =>
            (o.id || o.order_id) === orderId ||
            o.soDon === orderId ||
            o.sale_order_no === orderId
        );
        if (!order) {
            console.warn('Order not found in history:', orderId);
            return;
        }

        console.log('Opening order detail from history:', order);

        // Use the global viewOrderDetail function if available
        if (typeof viewOrderDetail === 'function') {
            // Store order in window.state.orders for viewOrderDetail to find
            if (!window.state) window.state = {};
            if (!window.state.orders) window.state.orders = {};
            if (!window.state.orders.completed) window.state.orders.completed = [];

            // Add to completed orders if not already there
            const exists = window.state.orders.completed.find(o => o.id === order.id);
            if (!exists) {
                window.state.orders.completed.push(order);
            }

            viewOrderDetail(order.id, {});
        } else {
            // Fallback: simple alert
            let details = `Chi tiết đơn hàng ${order.soDon || orderId} \n\n`;
            details += `Khách hàng: ${order.khach || order.account_name || order.customer || 'N/A'} \n`;
            details += `Ngày giao hàng: ${order.ngay || order.sale_order_date || order.date || 'N/A'} \n`;
            details += `Địa chỉ: ${order.diaChi || order.shipping_address || 'N/A'} \n`;
            details += `Tài xế: ${order.taiXe || order.driver || 'N/A'} \n`;
            details += `Trạng thái: ${order.status} \n`;
            alert(details);
        }
    },

    // Filter history based on search and status
    filterHistory() {
        const searchInput = document.getElementById('history-search');
        const statusFilter = document.getElementById('history-status-filter');

        const query = (searchInput?.value || '').toLowerCase().trim();
        const status = statusFilter?.value || '';

        console.log('🔍 Filtering history:', { query, status, totalOrders: this.history.length });
        console.log('📦 Sample order:', this.history[0]);

        // Start with all history if no filters
        if (!query && !status) {
            this.filteredHistory = [...this.history];
            this.renderHistory();
            return;
        }

        this.filteredHistory = this.history.filter(order => {
            // Status filter
            if (status && (order.status || '').toLowerCase() !== status.toLowerCase()) {
                return false;
            }

            // Search filter - check ALL possible field names
            if (query) {
                const searchFields = [
                    // Order ID fields
                    order.orderCode,
                    order.id,
                    order.soDon,
                    order.sale_order_no,
                    // Customer fields
                    order.customerName,
                    order.accountName,
                    order.account_name,
                    order.khach,
                    order.customer,
                    // Driver fields
                    order.driverName,
                    order.driver_name,
                    order.driver,
                    order.taiXe,
                    // Address fields
                    order.shippingAddress,
                    order.shipping_address,
                    order.diaChi,
                    order.address
                ].map(f => String(f || '').toLowerCase());

                const matches = searchFields.some(field => field.includes(query));
                return matches;
            }

            return true;
        });

        console.log('✅ Filtered results:', this.filteredHistory.length);

        // Apply current sort and render
        this.sortHistory(false);
        this.renderHistory();
    },

    // Sort history
    sortHistory(doRender = true) {
        const sortSelect = document.getElementById('history-sort');
        const sortValue = sortSelect?.value || 'date-desc';

        console.log('📊 Sorting history by:', sortValue);

        const data = this.filteredHistory.length > 0 ? this.filteredHistory : [...this.history];

        data.sort((a, b) => {
            switch (sortValue) {
                case 'date-asc':
                    return new Date(a.orderDate || a.order_date || a.createdAt || 0) - new Date(b.orderDate || b.order_date || b.createdAt || 0);
                case 'date-desc':
                    return new Date(b.orderDate || b.order_date || b.createdAt || 0) - new Date(a.orderDate || a.order_date || a.createdAt || 0);
                case 'customer-asc':
                    return (a.customerName || a.accountName || '').localeCompare(b.customerName || b.accountName || '');
                case 'customer-desc':
                    return (b.customerName || b.accountName || '').localeCompare(a.customerName || a.accountName || '');
                case 'driver-asc':
                    return (a.driverName || a.driver_name || '').localeCompare(b.driverName || b.driver_name || '');
                case 'amount-desc':
                    return (b.totalAmount || b.total_amount || 0) - (a.totalAmount || a.total_amount || 0);
                case 'amount-asc':
                    return (a.totalAmount || a.total_amount || 0) - (b.totalAmount || b.total_amount || 0);
                default:
                    return 0;
            }
        });

        this.filteredHistory = data;

        if (doRender) {
            this.renderHistory();
        }
    },

    // Export to Excel
    exportToExcel() {
        // TODO: Implement Excel export
        alert('Xuất dữ liệu ra Excel');
    }
};

// Đăng ký module
AppRouter.registerModule('order-history', OrderHistoryModule);

// Expose to global scope for button onclick handlers
window.OrderHistoryModule = OrderHistoryModule;

// Auto-init if section is visible
if (document.getElementById('section-order-history') && !document.getElementById('section-order-history').classList.contains('hidden')) {
    console.log('🚀 Auto-initializing Order History Module...');
    OrderHistoryModule.init();
}
