// ===============================================
// MODULE: ĐƠN CỦA TÔI (My Orders)
// ===============================================

const MyOrdersModule = {
    orders: [],
    currentUser: null,
    unreadCounts: {}, // Store unread message counts per order

    // Khởi tạo module
    init() {
        console.log('My Orders Module initialized');
        this.loadMyOrders();
    },

    // Load unread message counts for orders
    async loadUnreadCounts() {
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) return;

            const user = JSON.parse(userStr);
            const userId = user.name || user.phone || '';
            if (!userId) return;

            const response = await fetch(`/api/chat/unread-counts?userId=${encodeURIComponent(userId)}`);
            const data = await response.json();

            if (!data.error && data.counts) {
                this.unreadCounts = data.counts;
                console.log('💬 My Orders: Loaded unread counts:', this.unreadCounts);
            }
        } catch (e) {
            console.error('Load unread counts error:', e);
        }
    },

    // Get HTML for unread badge on order card
    getUnreadBadgeHtml(orderId) {
        const count = this.unreadCounts[orderId] || 0;
        if (count === 0) return '';
        return `<span class="chat-badge">${count > 99 ? '99+' : count}</span>`;
    },

    // Load đơn hàng của tôi
    async loadMyOrders() {
        try {
            // Get current user from session/localStorage
            const userStr = localStorage.getItem('user');
            if (userStr) {
                this.currentUser = JSON.parse(userStr);
            }

            // Get driver name from user session
            const driverName = this.currentUser?.name || this.currentUser?.fullName || '';
            const role = this.currentUser?.role || 'DRIVER';

            if (!driverName) {
                console.warn('No driver name found in session');
                this.orders = [];
                this.renderOrders();
                return;
            }

            const response = await fetch(`/api/orders/my/${encodeURIComponent(driverName)}?role=${role}`);
            const data = await response.json();

            if (data.error) {
                console.error('Error from API:', data.msg);
                this.loadMockOrders();
                return;
            }

            this.orders = data.data || [];
            console.log(`📋 My Orders loaded: ${this.orders.length} (exports + imports)`);

            // Load unread counts before rendering
            await this.loadUnreadCounts();

            this.renderOrders();
        } catch (error) {
            console.error('Error loading my orders:', error);
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
                status: 'Đang giao',
                date: '2024-07-28',
                total: 15000000,
                driver: 'Nguyễn Văn A',
                assignedTo: 'me'
            },
            {
                id: 'ORD003',
                customer: 'Công ty DEF',
                address: '789 Võ Văn Ngân, Thủ Đức, TP.HCM',
                status: 'Hoàn thành',
                date: '2024-07-27',
                total: 18000000,
                driver: 'Nguyễn Văn A',
                assignedTo: 'me',
                completedDate: '2024-07-27 16:30'
            }
        ];
        this.renderOrders();
    },

    // Render danh sách đơn hàng
    renderOrders() {
        const container = document.getElementById('my-orders-list');
        if (!container) return;

        if (this.orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-inbox"></i>
                    <p>Bạn chưa có đơn hàng nào được giao</p>
                </div>
            `;
            return;
        }

        // Helper to check if order is in "delivering" state
        const isDelivering = (o) => {
            const s = (o.status || '').toLowerCase();
            const code = o.statusCode || '';
            return code === 'DANG_GIAO' || code === 'CHO_NHAN' ||
                s === 'đang giao' || s === 'delivering' || s === 'đang thực hiện' ||
                s === 'assigned' || s === 'in_transit';
        };

        // Helper to check if order is completed
        const isCompleted = (o) => {
            const s = (o.status || '').toLowerCase();
            const code = o.statusCode || '';
            return code === 'HOAN_THANH' ||
                s === 'hoàn thành' || s === 'completed' || s === 'đã thực hiện';
        };

        // Group by status
        const delivering = this.orders.filter(o => isDelivering(o));
        const completed = this.orders.filter(o => isCompleted(o));

        container.innerHTML = `
            <div class="stats-grid" style="margin-bottom: 24px;">
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-title">Đang giao</div>
                        <div class="stat-icon"><i class="bi bi-truck"></i></div>
                    </div>
                    <div class="stat-value">${delivering.length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-title">Đã hoàn thành</div>
                        <div class="stat-icon"><i class="bi bi-check-circle"></i></div>
                    </div>
                    <div class="stat-value">${completed.length}</div>
                </div>
            </div>

            ${delivering.length > 0 ? `
                <h3 style="margin-bottom: 16px;"><i class="bi bi-truck"></i> Đơn đang giao</h3>
                ${delivering.map(order => this.renderOrderCard(order, true)).join('')}
            ` : ''}

            ${completed.length > 0 ? `
                <h3 style="margin-top: 32px; margin-bottom: 16px;"><i class="bi bi-check-circle"></i> Đơn đã hoàn thành</h3>
                ${completed.map(order => this.renderOrderCard(order, false)).join('')}
            ` : ''}
        `;
    },

    // Render order card
    renderOrderCard(order, isDelivering = false) {
        const orderId = order.id || order.order_id;
        const orderType = order.type || 'export';
        const typeBadge = orderType === 'import'
            ? '<span class="type-badge import" style="background:#4CAF50; color:white; padding:2px 8px; border-radius:4px; font-size:11px; margin-left:8px;">Nhập</span>'
            : '<span class="type-badge export" style="background:#2196F3; color:white; padding:2px 8px; border-radius:4px; font-size:11px; margin-left:8px;">Xuất</span>';

        return `
            <div class="order-card" style="position:relative; `${orderType === 'import' ? 'background:linear-gradient(135deg,#E8F5E9 0%,#C8E6C9 100%);border-left:4px solid #4CAF50;' : 'background:linear-gradient(135deg,#E3F2FD 0%,#BBDEFB 100%);border-left:4px solid #2196F3;'}">
                ${this.getUnreadBadgeHtml(orderId)}
                <div class="order-header">
                    <div>
                        <div class="order-id">#${order.soDon || order.id || order.order_id}${typeBadge}</div>
                        <div class="order-customer">${order.customer || order.customer_name || order.khach || ''}</div>
                    </div>
                    <span class="status-badge ${isDelivering ? 'info' : 'success'}">${this.getStatusDisplay(order)}</span>
                </div>
                <div class="order-info">
                    <div><i class="bi bi-geo-alt"></i> ${order.address || order.delivery_address || order.diaChi || ''}</div>
                    <div><i class="bi bi-calendar"></i> ${order.date || order.order_date || ''}</div>
                    ${order.completedDate || order.completed_at ? `<div><i class="bi bi-check-circle"></i> Hoàn thành: ${order.completedDate || order.completed_at}</div>` : ''}
                </div>
                <div class="order-footer">
                    <div class="order-total">${(order.total || order.total_amount || 0).toLocaleString('vi-VN')} ${orderType === 'import' ? 'kg' : 'VNĐ'}</div>
                    ${isDelivering ? `
                        <button class="btn-view" onclick="MyOrdersModule.completeOrder('${orderId}', '${orderType}')">
                            <i class="bi bi-check-circle"></i> Hoàn thành
                        </button>
                    ` : `
                        <button class="btn-view" onclick="MyOrdersModule.viewDetail('${orderId}', '${orderType}')">
                            Xem chi tiết
                        </button>
                    `}
                </div>
            </div>
        `;
    },

    // Get display status text
    getStatusDisplay(order) {
        const code = order.statusCode || '';
        if (code === 'CHO_NHAN') return 'Chờ nhận';
        if (code === 'DANG_GIAO') return 'Đang giao';
        if (code === 'HOAN_THANH') return 'Hoàn thành';
        return order.status || 'N/A';
    },

    // Hoàn thành đơn hàng
    async completeOrder(orderId, orderType = 'export') {
        if (!confirm('Xác nhận hoàn thành đơn hàng này?')) {
            return;
        }

        try {
            // Get order details
            const order = this.orders.find(o => (o.id || o.order_id) === orderId);
            const products = order?.products || order?.items || [];

            // Get driver info from localStorage
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : {};
            const driverName = user.name || user.fullName || localStorage.getItem('userName') || 'Driver';
            const plate = user.plate || '';

            let response;

            if (orderType === 'import') {
                // Import ticket completion - use Supabase imports API
                response = await fetch(`/api/imports/${orderId}/complete`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        actual_products: products,
                        note: `Hoàn thành bởi ${driverName}`
                    })
                });
            } else {
                // Export order completion - use MISA orders API
                const cart = products.map(p => ({
                    product: {
                        code: p.code || p.material_code || '',
                        name: p.name || p.material_name || ''
                    },
                    weight_kg: p.qty || p.quantity || 0,
                    unit: p.unit || 'kg'
                }));

                response = await fetch(`/api/orders/${orderId}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'XUAT',
                        warehouse: 'LT1',
                        partner: order?.customer || order?.customer_name || 'Khách hàng',
                        driver_name: driverName,
                        plate: plate,
                        cart: cart,
                        note: '',
                        sender: driverName
                    })
                });
            }

            const data = await response.json();

            if (data.error) {
                alert('Lỗi: ' + data.msg);
                return;
            }

            alert('✅ Đã hoàn thành đơn hàng!');
            this.loadMyOrders(); // Reload

        } catch (error) {
            console.error('Error completing order:', error);
            alert('Có lỗi xảy ra!');
        }
    },

    // Xem chi tiết
    viewDetail(orderId, orderType = 'export') {
        const order = this.orders.find(o => (o.id || o.order_id) === orderId);
        if (!order) return;

        console.log('View order detail:', order);
        const typeLabel = orderType === 'import' ? 'Đơn nhập' : 'Đơn xuất';
        const totalLabel = orderType === 'import' ? 'kg' : 'VNĐ';
        alert(`${typeLabel} ${order.soDon || orderId}\n\n${orderType === 'import' ? 'NCC' : 'Khách hàng'}: ${order.customer || order.customer_name || order.khach}\nĐịa chỉ: ${order.address || order.delivery_address || order.diaChi}\nTổng: ${(order.total || order.total_amount || 0).toLocaleString('vi-VN')} ${totalLabel}`);
    }
};

// Đăng ký module
AppRouter.registerModule('my-orders', MyOrdersModule);
