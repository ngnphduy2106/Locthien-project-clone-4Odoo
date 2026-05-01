// ===============================================
// MODULE: QUẢN LÝ ĐƠN HÀNG (Order Management)
// ===============================================

const OrdersModule = {
    orders: [],
    currentTab: 'pending',
    // Render cache for faster tab switching
    _renderCache: { pending: null, delivering: null, completed: null },

    // Khởi tạo module
    init() {
        console.log('Orders Module initialized');
        this.loadOrders();
        this.setupEventListeners();
    },

    // Setup event listeners
    setupEventListeners() {
        // Tab switching
        const tabs = document.querySelectorAll('[data-order-tab]');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.orderTab);
            });
        });

        // Search
        const searchInput = document.getElementById('order-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchOrders(e.target.value);
            });
        }
    },

    // Load danh sách đơn hàng
    async loadOrders() {
        try {
            const response = await fetch('/api/orders');
            const data = await response.json();

            if (data.error) {
                console.error('Error from API:', data.msg);
                this.loadMockOrders();
                return;
            }

            this.orders = data.orders || [];
            // Invalidate render cache when data changes
            this._renderCache = { pending: null, delivering: null, completed: null };
            this.renderOrders();
        } catch (error) {
            console.error('Error loading orders:', error);
            this.loadMockOrders();
        }
    },

    // Load mock data
    loadMockOrders() {
        this.orders = [
            {
                id: 'ORD001',
                customer: 'Công ty TNHH ABC',
                address: '123 Nguyễn Văn Linh, Q7, TP.HCM',
                status: 'Chờ xử lý',
                date: '2024-07-28',
                total: 15000000,
                products: [
                    { name: 'HCl 37%', quantity: 100, unit: 'kg' },
                    { name: 'NaOH 50%', quantity: 50, unit: 'kg' }
                ]
            },
            {
                id: 'ORD002',
                customer: 'Công ty XYZ',
                address: '456 Lê Văn Việt, Q9, TP.HCM',
                status: 'Đang giao',
                date: '2024-07-27',
                total: 25000000,
                driver: 'Nguyễn Văn A',
                plate: '51A-12345',
                products: [
                    { name: 'H2SO4 98%', quantity: 200, unit: 'kg' }
                ]
            }
        ];
        this.renderOrders();
    },

    // Render danh sách đơn hàng (with caching for faster tab switching)
    renderOrders() {
        const container = document.getElementById('orders-list');
        if (!container) return;

        const tab = this.currentTab;

        // Check cache first for faster tab switching
        if (this._renderCache[tab] !== null) {
            container.innerHTML = this._renderCache[tab];
            return;
        }

        const filteredOrders = this.filterOrdersByTab();

        if (filteredOrders.length === 0) {
            const html = `
                <div class="empty-state">
                    <i class="bi bi-inbox"></i>
                    <p>Không có đơn hàng nào</p>
                </div>
            `;
            this._renderCache[tab] = html;
            container.innerHTML = html;
            return;
        }

        const html = filteredOrders.map(order => `
            <div class="order-card" onclick="OrdersModule.viewOrderDetail('${order.id || order.order_id}')">
                <div class="order-header">
                    <div>
                        <div class="order-id">#${order.id || order.order_id}</div>
                        <div class="order-customer">${order.customer || order.customer_name || 'N/A'}</div>
                    </div>
                    <span class="status-badge ${this.getStatusClass(order.status)}">${order.status}</span>
                </div>
                <div class="order-info">
                    <div><i class="bi bi-calendar"></i> ${order.date || order.order_date ? new Date(order.date || order.order_date).toLocaleDateString('vi-VN') : 'N/A'}</div>
                    <div><i class="bi bi-geo-alt"></i> ${order.address || order.delivery_address || 'N/A'}</div>
                    ${order.driver || order.driver_name ? `<div><i class="bi bi-truck"></i> ${order.driver || order.driver_name} - ${order.plate || order.vehicle_plate || ''}</div>` : ''}
                </div>
                <div class="order-footer">
                    ${!isDispatcherRole() ? `<div class="order-total">${(order.total || order.total_amount || 0).toLocaleString('vi-VN')} VNĐ</div>` : ''}
                    <button class="btn-view" onclick="event.stopPropagation(); OrdersModule.viewOrderDetail('${order.id || order.order_id}')">
                        Xem chi tiết <i class="bi bi-arrow-right"></i>
                    </button>
                </div>
            </div>
        `).join('');

        this._renderCache[tab] = html;
        container.innerHTML = html;
    },

    // Filter orders by tab
    filterOrdersByTab() {
        const statusMap = {
            'pending': ['Chờ xử lý', 'PENDING', 'NEW'],
            'delivering': ['Đang giao', 'DELIVERING', 'IN_PROGRESS'],
            'completed': ['Hoàn thành', 'COMPLETED', 'DONE']
        };

        const validStatuses = statusMap[this.currentTab] || [];

        return this.orders.filter(o => validStatuses.includes(o.status));
    },

    // Switch tab
    switchTab(tab) {
        this.currentTab = tab;

        // Update active tab
        document.querySelectorAll('[data-order-tab]').forEach(t => {
            t.classList.remove('active');
        });
        const activeTab = document.querySelector(`[data-order-tab="${tab}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        this.renderOrders();
    },

    // Get status class
    getStatusClass(status) {
        const statusMap = {
            'Chờ xử lý': 'warning',
            'PENDING': 'warning',
            'NEW': 'warning',
            'Đang giao': 'info',
            'DELIVERING': 'info',
            'IN_PROGRESS': 'info',
            'Hoàn thành': 'success',
            'COMPLETED': 'success',
            'DONE': 'success',
            'Đã hủy': 'danger',
            'CANCELLED': 'danger'
        };
        return statusMap[status] || '';
    },

    // View order detail
    viewOrderDetail(orderId) {
        const order = this.orders.find(o => (o.id || o.order_id) === orderId);
        if (!order) return;

        // TODO: Show modal with order details
        console.log('View order:', order);
        let details = `Chi tiết đơn hàng ${orderId}\n\n`;
        details += `Khách hàng: ${order.customer || order.customer_name}\n`;
        details += `Địa chỉ: ${order.address || order.delivery_address}\n`;
        if (!isDispatcherRole()) {
            details += `Tổng tiền: ${(order.total || order.total_amount || 0).toLocaleString('vi-VN')} VNĐ\n`;
        }
        details += `Trạng thái: ${order.status}\n`;
        if (order.driver || order.driver_name) {
            details += `Tài xế: ${order.driver || order.driver_name}\n`;
        }

        alert(details);
    },

    // Search orders
    searchOrders(query) {
        if (!query) {
            this.renderOrders();
            return;
        }

        const filtered = this.orders.filter(order =>
            (order.id || order.order_id || '').toLowerCase().includes(query.toLowerCase()) ||
            (order.customer || order.customer_name || '').toLowerCase().includes(query.toLowerCase()) ||
            (order.address || order.delivery_address || '').toLowerCase().includes(query.toLowerCase())
        );

        // Render filtered results
        const container = document.getElementById('orders-list');
        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-search"></i>
                    <p>Không tìm thấy đơn hàng nào</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(order => `
            <div class="order-card" onclick="OrdersModule.viewOrderDetail('${order.id || order.order_id}')">
                <div class="order-header">
                    <div>
                        <div class="order-id">#${order.id || order.order_id}</div>
                        <div class="order-customer">${order.customer || order.customer_name}</div>
                    </div>
                    <span class="status-badge ${this.getStatusClass(order.status)}">${order.status}</span>
                </div>
                <div class="order-info">
                    <div><i class="bi bi-calendar"></i> ${order.date || order.order_date}</div>
                    <div><i class="bi bi-geo-alt"></i> ${order.address || order.delivery_address}</div>
                </div>
                <div class="order-footer">
                    ${!isDispatcherRole() ? `<div class="order-total">${(order.total || order.total_amount || 0).toLocaleString('vi-VN')} VNĐ</div>` : ''}
                </div>
            </div>
        `).join('');
    }
};

// Đăng ký module
AppRouter.registerModule('orders', OrdersModule);
