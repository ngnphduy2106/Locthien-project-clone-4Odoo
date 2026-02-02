// ===============================================
// MODULE: LỊCH SỬ ĐƠN HÀNG (Order History)
// ===============================================

const OrderHistoryModule = {
    history: [],
    filteredHistory: [], // Stores filtered/sorted results
    currentPage: 1,
    itemsPerPage: 20,
    totalPages: 1,
    useCardLayout: true, // Cards by default - toggle with button group
    searchQuery: '',
    dateFilter: null,

    // Khởi tạo module
    init() {
        console.log('📋 Order History Module initialized');
        console.log('🎨 Layout mode:', this.useCardLayout ? 'CARDS' : 'TABLE');

        // Attach button event listeners
        this.setupToggleButtons();

        this.loadHistory();
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
            const isDriver = (state.user?.role || '').toLowerCase() === 'driver';
            const driverName = state.user?.name || '';

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
        console.log('🎨 Layout:', this.useCardLayout ? 'CARDS' : 'TABLE', '| Data:', this.history.length);
        if (this.useCardLayout) {
            this.renderCards();
        } else {
            this.renderTable();
        }
        this.renderPagination();
    },

    // NEW: Render as cards
    renderCards() {
        const container = document.getElementById('history-cards-container');
        const tableContainer = document.getElementById('history-table-container');

        if (!container) {
            console.error('❌ Cards container not found! Falling back to table.');
            this.useCardLayout = false;
            this.renderTable();
            return;
        }

        container.classList.remove('hidden');
        if (tableContainer) tableContainer.classList.add('hidden');

        if (this.history.length === 0) {
            console.log('⚠️ No history data to display');
            container.innerHTML = '<div class="history-empty-state"><i class="bi bi-inbox"></i><h4>Chưa có lịch sử đơn hàng</h4></div>';
            return;
        }

        console.log('🎴 Rendering', this.history.length, 'cards...');
        console.log('📦 Sample data:', this.history[0]);

        container.innerHTML = this.history.map(order => {
            const orderId = order.orderCode || order.id || 'N/A';
            const customer = order.customerName || order.accountName || 'N/A';
            const date = order.orderDate || order.order_date || order.createdAt;
            const amount = order.totalAmount || order.total_amount || 0;
            const status = order.status || 'N/A';
            const driver = order.driverName || order.driver_name || '-';
            const completedDate = order.completedAt || order.completed_at;
            const statusClass = this.getStatusClass(status);
            const statusText = this.getStatusText(status);

            return `
                <div class="history-order-card status-${statusClass}" 
                     onclick="OrderHistoryModule.viewDetail('${orderId}')"
                     data-order-id="${orderId}">
                    <div class="order-card-header">
                        <div>
                            <div class="order-id">#${orderId}</div>
                            <div class="order-customer">${customer}</div>
                        </div>
                        <span class="badge badge-${statusClass}">${statusText}</span>
                    </div>
                    <div class="order-meta">
                        <div class="order-meta-item">
                            <i class="bi bi-calendar3"></i>
                            <span>${date ? new Date(date).toLocaleDateString('vi-VN') : 'N/A'}</span>
                        </div>
                        <div class="order-meta-item">
                            <i class="bi bi-person"></i>
                            <span>Tài xế: ${driver}</span>
                        </div>
                        <div class="order-meta-item">
                            <i class="bi bi-check-circle"></i>
                            <span>Hoàn thành: ${completedDate ? new Date(completedDate).toLocaleString('vi-VN') : '-'}</span>
                        </div>
                    </div>
                    <div class="order-card-footer">
                        <div class="order-total">${amount.toLocaleString('vi-VN')} VNĐ</div>
                        <button class="btn-view-detail" 
                                onclick="event.stopPropagation(); OrderHistoryModule.viewDetail('${orderId}')">
                            <i class="bi bi-eye"></i> Chi tiết
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        console.log('✅ Rendered', this.history.length, 'cards');
    },

    // OLD: Render as table
    renderTable() {
        const container = document.getElementById('history-table-body');
        const cardsContainer = document.getElementById('history-cards-container');
        const tableContainer = document.getElementById('history-table-container');

        if (!container) {
            console.error('❌ Table container not found!');
            return;
        }

        if (cardsContainer) cardsContainer.classList.add('hidden');
        if (tableContainer) tableContainer.classList.remove('hidden');

        if (this.history.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: #8c8c8c;">
                        <i class="bi bi-inbox" style="font-size: 48px; display: block; margin-bottom: 12px;"></i>
                        Chưa có lịch sử đơn hàng
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = this.history.map(order => {
            const orderId = order.orderCode || order.id || 'N/A';
            const customer = order.customerName || order.accountName || 'N/A';
            const date = order.orderDate || order.order_date || order.createdAt;
            const amount = order.totalAmount || order.total_amount || 0;
            const status = order.status || 'N/A';
            const driver = order.driverName || order.driver_name || '-';
            const completedDate = order.completedAt || order.completed_at;

            return `
            <tr onclick="OrderHistoryModule.viewDetail('${orderId}')" style="cursor:pointer;" class="history-row">
                <td><strong>${orderId}</strong></td>
                <td>${customer}</td>
                <td>${date ? new Date(date).toLocaleDateString('vi-VN') : 'N/A'}</td>
                <td>${amount.toLocaleString('vi-VN')} VNĐ</td>
                <td>
                    <span class="status-badge ${this.getStatusClass(status)}">
                        ${this.getStatusText(status)}
                    </span>
                </td>
                <td>${driver}</td>
                <td>${completedDate ? new Date(completedDate).toLocaleString('vi-VN') : '-'}</td>
            </tr>`;
        }).join('');

        console.log('✅ Rendered', this.history.length, 'table rows');
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
            // Store order in state.orders for viewOrderDetail to find
            if (!state.orders) state.orders = {};
            if (!state.orders.completed) state.orders.completed = [];

            // Add to completed orders if not already there
            const exists = state.orders.completed.find(o => o.id === order.id);
            if (!exists) {
                state.orders.completed.push(order);
            }

            viewOrderDetail(order.id, { readonly: true });
        } else {
            // Fallback: simple alert
            let details = `Chi tiết đơn hàng ${order.soDon || orderId} \n\n`;
            details += `Khách hàng: ${order.khach || order.account_name || order.customer || 'N/A'} \n`;
            details += `Ngày đặt: ${order.ngay || order.sale_order_date || order.date || 'N/A'} \n`;
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

        console.log('🔍 Filtering history:', { query, status });

        this.filteredHistory = this.history.filter(order => {
            // Status filter
            if (status && (order.status || '').toLowerCase() !== status.toLowerCase()) {
                return false;
            }

            // Search filter
            if (query) {
                const searchFields = [
                    order.soDon || order.sale_order_no || order.id,
                    order.khach || order.account_name || order.customer,
                    order.taiXe || order.driver,
                    order.diaChi || order.shipping_address
                ].map(f => (f || '').toLowerCase());

                return searchFields.some(field => field.includes(query));
            }

            return true;
        });

        // Apply current sort
        this.sortHistory(false);
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
                    return new Date(a.ngay || a.sale_order_date || 0) - new Date(b.ngay || b.sale_order_date || 0);
                case 'date-desc':
                    return new Date(b.ngay || b.sale_order_date || 0) - new Date(a.ngay || a.sale_order_date || 0);
                case 'customer-asc':
                    return (a.khach || a.account_name || '').localeCompare(b.khach || b.account_name || '');
                case 'customer-desc':
                    return (b.khach || b.account_name || '').localeCompare(a.khach || a.account_name || '');
                case 'driver-asc':
                    return (a.taiXe || a.driver || '').localeCompare(b.taiXe || b.driver || '');
                case 'amount-desc':
                    return (b.amount || b.sale_order_amount || 0) - (a.amount || a.sale_order_amount || 0);
                case 'amount-asc':
                    return (a.amount || a.sale_order_amount || 0) - (b.amount || b.sale_order_amount || 0);
                default:
                    return 0;
            }
        });

        this.filteredHistory = data;

        if (doRender) {
            this.renderFilteredHistory();
        }
    },

    // Render filtered results
    renderFilteredHistory() {
        const data = this.filteredHistory.length > 0 ? this.filteredHistory : this.history;

        // Temporarily swap history with filtered for rendering
        const originalHistory = this.history;
        this.history = data;
        this.renderHistory();
        this.history = originalHistory;
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
