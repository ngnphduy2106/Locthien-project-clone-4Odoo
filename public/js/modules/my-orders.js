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

        // Helper to check if split order has all drivers completed (e.g., "2/2")
        const isSplitCompleted = (o) => {
            const progress = o.split_progress || '';
            if (!progress) return false;
            const match = progress.match(/(\d+)\/(\d+)/);
            if (match) {
                const completed = parseInt(match[1]);
                const total = parseInt(match[2]);
                return completed === total && total > 0;
            }
            return false;
        };

        // Helper to check if THIS driver's assignment is completed 
        // (for split orders, each driver sees their own assignment status)
        const isMyAssignmentCompleted = (o) => {
            // Check assignment_status field (returned from backend for each driver's assignment)
            const assignStatus = (o.assignment_status || '').toLowerCase();
            return assignStatus === 'completed';
        };

        // Helper to check if order is in "delivering" state
        const isDelivering = (o) => {
            // If this driver's assignment is completed, it's NOT in delivering for them
            if (isMyAssignmentCompleted(o)) return false;
            // If split order with all drivers completed, it's NOT delivering
            if (isSplitCompleted(o)) return false;

            const s = (o.status || '').toLowerCase();
            const code = o.statusCode || '';
            return code === 'DANG_GIAO' || code === 'CHO_NHAN' ||
                s === 'đang giao' || s === 'delivering' || s === 'đang thực hiện' ||
                s === 'assigned' || s === 'in_transit';
        };

        // Helper to check if order is completed (for this driver)
        const isCompleted = (o) => {
            // This driver's assignment is completed (even if other drivers haven't)
            if (isMyAssignmentCompleted(o)) return true;
            // Split order with all drivers completed
            if (isSplitCompleted(o)) return true;

            const s = (o.status || '').toLowerCase();
            const code = o.statusCode || '';
            return code === 'HOAN_THANH' ||
                s === 'hoàn thành' || s === 'completed' || s === 'đã thực hiện';
        };

        // Helper to get sortable date from order
        const getOrderDate = (o) => {
            const dateStr = o.date || o.order_date || o.ngay || o.expected_date || o.created_at || o.sale_order_date || '';
            if (!dateStr) {
                console.log(`⚠️ No date for order ${o.soDon || o.id}`);
                return new Date(0);
            }

            // Handle d/m/yyyy or dd/mm/yyyy format (e.g., "3/2/2026" or "31/12/2025")
            if (typeof dateStr === 'string' && dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
                const parts = dateStr.split('/');
                const parsed = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                console.log(`📅 Parsed ${o.soDon || o.id}: "${dateStr}" → ${parsed.toLocaleDateString()}`);
                return parsed;
            }

            // Handle ISO format or other parseable formats
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
                console.log(`📅 ISO parsed ${o.soDon || o.id}: "${dateStr}" → ${parsed.toLocaleDateString()}`);
                return parsed;
            }

            console.log(`❌ Failed to parse ${o.soDon || o.id}: "${dateStr}"`);
            return new Date(0);
        };

        // Helper to get sortable order code (extract number from code like PO00035.25 or N1045)
        const getOrderCode = (o) => {
            const code = o.soDon || o.id || '';
            // Extract ALL digits and use as number
            const digits = code.replace(/\D/g, '');
            return digits ? parseInt(digits) : 0;
        };

        // Sort function: by date DESC, then by code DESC
        const sortOrders = (orders) => {
            return [...orders].sort((a, b) => {
                const dateA = getOrderDate(a);
                const dateB = getOrderDate(b);
                // Sort by date descending (newest first)
                const timeDiff = dateB.getTime() - dateA.getTime();
                if (timeDiff !== 0) return timeDiff;
                // If same date, sort by code descending
                return getOrderCode(b) - getOrderCode(a);
            });
        };

        // Group by status and sort
        const delivering = sortOrders(this.orders.filter(o => isDelivering(o)));
        const completed = sortOrders(this.orders.filter(o => isCompleted(o)));

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
            <div class="order-card" style="position:relative; ${orderType === 'import' ? 'background:linear-gradient(135deg,#E8F5E9 0%,#C8E6C9 100%);border-left:4px solid #4CAF50;' : 'background:linear-gradient(135deg,#E3F2FD 0%,#BBDEFB 100%);border-left:4px solid #2196F3;'}">
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
                    <div><i class="bi bi-calendar"></i> ${order.date || order.order_date || order.ngay || order.expected_date || order.created_at || order.import_date || 'N/A'}</div>
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
        try {
            // Get order details
            const order = this.orders.find(o => (o.id || o.order_id) === orderId);

            if (!order) {
                alert('Không tìm thấy đơn hàng!');
                return;
            }

            // For EXPORT orders - use the delivery modal with image upload
            if (orderType === 'export') {
                // Use the global openDeliveryModal function which has image upload
                if (typeof openDeliveryModal === 'function') {
                    openDeliveryModal(orderId);
                } else if (typeof window.openDeliveryModal === 'function') {
                    window.openDeliveryModal(orderId);
                } else {
                    console.error('openDeliveryModal function not found!');
                    alert('Lỗi: Không tìm thấy form hoàn thành đơn!');
                }
                return;
            }

            // For IMPORT orders - confirm and complete directly
            if (!confirm('Xác nhận hoàn thành đơn nhập này?')) {
                return;
            }

            const products = order?.products || order?.items || [];

            // Get driver info from localStorage
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : {};
            const driverName = user.name || user.fullName || localStorage.getItem('userName') || 'Driver';

            // Import ticket completion - use Supabase imports API
            const response = await fetch(`/api/imports/${orderId}/complete`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actual_products: products,
                    note: `Hoàn thành bởi ${driverName}`
                })
            });

            const data = await response.json();

            if (data.error) {
                alert('Lỗi: ' + data.msg);
                return;
            }

            alert('✅ Đã hoàn thành đơn nhập!');
            this.loadMyOrders(); // Reload

        } catch (error) {
            console.error('Error completing order:', error);
            alert('Có lỗi xảy ra!');
        }
    },

    // Xem chi tiết
    async viewDetail(orderId, orderType = 'export') {
        const order = this.orders.find(o => (o.id || o.order_id) === orderId);
        if (!order) return;

        console.log('View order detail:', order);
        const typeLabel = orderType === 'import' ? 'Đơn nhập' : 'Đơn xuất';

        // Build product list - show all products (same for everyone)
        let products = order.products || order.cart || [];
        if (typeof products === 'string') {
            try { products = JSON.parse(products); } catch (e) { products = []; }
        }

        // Fetch driver's assigned quantity and actual products from API
        let isSplitOrder = order.is_split_order;
        let driverAssignedQty = order.assigned_qty ? Number(order.assigned_qty) : null;

        if (order.assignment_id) {
            try {
                const resp = await fetch(`/api/orders/assignment/${order.assignment_id}`);
                const data = await resp.json();
                if (!data.error && data.data) {
                    driverAssignedQty = Number(data.data.assigned_qty) || driverAssignedQty;
                    isSplitOrder = true;

                    // Use actual_products for completed orders
                    if (data.data.actual_products && Array.isArray(data.data.actual_products) && data.data.actual_products.length > 0) {
                        products = data.data.actual_products;
                        console.log(`📦 Using actual_products for completed order:`, products);
                    }
                }
            } catch (e) {
                console.error('Error fetching assignment:', e);
            }
        }

        // Build products list (may be updated after API call)
        const productsList = products.map(p =>
            `• ${p.name || p.code}: ${p.qty || p.amount || 0} ${p.unit || 'kg'}`
        ).join('\n') || 'Chưa có sản phẩm';

        // Show split order badge with driver's assigned quantity
        const splitBadge = (isSplitOrder && driverAssignedQty)
            ? `<div style="margin-bottom: 0.75rem; padding: 8px 12px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 8px; font-weight: 600;">
                <span style="color: #92400e;">📦 Phần của bạn:</span> 
                <span style="color: #78350f; font-size: 1.1em;">${driverAssignedQty} kg</span>
                ${order.split_progress ? `<span style="color: #a16207; font-size: 0.85em; margin-left: 8px;">(${order.split_progress})</span>` : ''}
               </div>`
            : '';

        // Format amount
        const amount = (order.sale_order_amount || order.total || order.amount || 0).toLocaleString('vi-VN');

        // Build detail modal HTML
        const modalHtml = `
            <div class="modal-overlay" id="my-order-detail-modal" onclick="if(event.target === this) this.remove()">
                <div class="modal-content" style="max-width: 500px; max-height: 85vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3>📦 ${typeLabel} ${order.soDon || orderId}</h3>
                        <button onclick="document.getElementById('my-order-detail-modal').remove()" class="btn-close">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 1rem;">
                        <!-- Thông tin khách hàng -->
                        <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px;">
                            <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">
                                👤 ${order.customer || order.customer_name || order.khach || 'Khách hàng'}
                            </div>
                            <div style="color: var(--text-secondary); font-size: 0.9rem;">
                                📍 ${order.address || order.delivery_address || order.diaChi || 'Chưa có địa chỉ'}
                            </div>
                            ${order.phone ? `<div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.25rem;">📞 <a href="tel:${order.phone}" style="color: var(--primary-color);">${order.phone}</a></div>` : ''}
                        </div>
                        
                        <!-- Ghi chú từ MISA (nếu có) -->
                        ${order.misa_note ? `
                        <div style="margin-bottom: 1rem; padding: 0.75rem; background: #fffbeb; border-radius: 8px; border-left: 3px solid #f59e0b;">
                            <div style="font-weight: 600; margin-bottom: 0.25rem; color: #92400e; font-size: 0.8rem;">📝 GHI CHÚ TỪ MISA</div>
                            <div style="color: #78350f;">${order.misa_note}</div>
                        </div>
                        ` : ''}
                        
                        <!-- Người tạo đơn -->
                        ${order.creator_name ? `
                        <div style="margin-bottom: 1rem; padding: 0.75rem; background: #eff6ff; border-radius: 8px; border-left: 3px solid #3b82f6;">
                            <div style="font-weight: 600; margin-bottom: 0.25rem; color: #1e40af; font-size: 0.8rem;">👔 NGƯỜI TẠO ĐƠN</div>
                            <div style="color: #1e3a8a;">${order.creator_name}</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">Liên hệ người này nếu cần hỗ trợ</div>
                        </div>
                        ` : ''}
                        
                        <!-- Sản phẩm -->
                        <div style="margin-bottom: 1rem;">
                            ${splitBadge}
                            <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">📋 Danh sách sản phẩm</div>
                            <div style="background: var(--bg-tertiary); padding: 0.75rem; border-radius: 8px; font-size: 0.9rem; white-space: pre-line;">
                                ${productsList}
                            </div>
                        </div>
                        
                        <!-- Tổng tiền -->
                        <div style="text-align: right; padding: 0.75rem; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; color: white;">
                            <div style="font-size: 0.8rem; opacity: 0.9;">Tổng giá trị</div>
                            <div style="font-size: 1.25rem; font-weight: 700;">${amount} VNĐ</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existing = document.getElementById('my-order-detail-modal');
        if (existing) existing.remove();

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
};

// Đăng ký module
AppRouter.registerModule('my-orders', MyOrdersModule);
