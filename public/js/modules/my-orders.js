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
            console.log(`📋 Orders driver info:`, this.orders.map(o => ({
                id: o.id,
                soDon: o.soDon,
                taiXe: o.taiXe,
                assignment_id: o.assignment_id,
                driver_name: o.driver_name
            })));

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
            },
            // Mock Import Orders for testing date format
            {
                id: 'IMP001',
                soDon: 'N9999',
                customer: 'Test Import - Expected Feb 4',
                khach: 'Test Import - Expected Feb 4',
                address: 'Địa chỉ test',
                status: 'Hoàn thành',
                type: 'import',
                expected_date: '2026-02-04',   // ISO: Feb 4th
                ngay: '04/02/2026',            // Expected display: DD/MM/YYYY
                total: 100,
                assignedTo: 'me'
            },
            {
                id: 'IMP002',
                soDon: 'N9998',
                customer: 'Test Import - Expected Feb 3',
                khach: 'Test Import - Expected Feb 3',
                address: 'Địa chỉ test 2',
                status: 'Đang giao',
                type: 'import',
                expected_date: '2026-02-03',   // ISO: Feb 3rd  
                ngay: '03/02/2026',            // Expected display: DD/MM/YYYY
                total: 200,
                assignedTo: 'me'
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

        // Helper to get sortable date from order (returns timestamp for comparison)
        const getOrderDate = (o) => {
            // Priority 1: Parse ISO date directly (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
            const rawDate = o.expected_date || o.created_at || o.order_date || o.sale_order_date || o.import_date;
            if (rawDate) {
                const str = String(rawDate);
                const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (isoMatch) {
                    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
                    console.log(`🔢 Sort [${o.soDon || o.id}] ISO:`, rawDate, '→', d.toLocaleDateString('vi-VN'));
                    return d;
                }
            }

            // Priority 2: Parse 'ngay' or 'date' (dd/mm/yyyy format)
            let val = o.ngay || o.date || '';
            if (!val) return new Date(0);

            const str = String(val).trim();
            // Handle dd/mm/yyyy
            const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (dmy) {
                const d = new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
                console.log(`🔢 Sort [${o.soDon || o.id}] DMY:`, val, '→', d.toLocaleDateString('vi-VN'));
                return d;
            }

            // Fallback
            console.log(`🔢 Sort [${o.soDon || o.id}] Fallback:`, str);
            const parsed = new Date(str);
            return isNaN(parsed.getTime()) ? new Date(0) : parsed;
        };

        // Helper to get customer name for sorting
        const getCustomerName = (o) => {
            return (o.khach || o.customer || o.account_name || o.customer_name || '').toLowerCase();
        };

        // Simple date parser: returns timestamp from DD/MM/YYYY or ISO format
        const parseDateValue = (o) => {
            // First try ngay field (already formatted DD/MM/YYYY by backend)
            const ngay = o.ngay || o.date || '';
            if (ngay) {
                const dmyMatch = String(ngay).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (dmyMatch) {
                    return new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1])).getTime();
                }
            }
            // Then try ISO dates from DB
            const isoDate = o.expected_date || o.created_at || o.sale_order_date || '';
            if (isoDate) {
                const isoMatch = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (isoMatch) {
                    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3])).getTime();
                }
            }
            return 0;
        };

        // Sort: date DESC, then customer name ASC
        const sortOrders = (orders) => {
            return [...orders].sort((a, b) => {
                const dateA = parseDateValue(a);
                const dateB = parseDateValue(b);
                if (dateB !== dateA) return dateB - dateA; // Newest first
                return getCustomerName(a).localeCompare(getCustomerName(b)); // Then by name A-Z
            });
        };

        // Group by status and sort
        const delivering = sortOrders(this.orders.filter(o => isDelivering(o)));
        const completed = sortOrders(this.orders.filter(o => isCompleted(o)));

        // Helper to generate grouped HTML
        const renderGroupedOrders = (orders, isDeliveringSection) => {
            let html = '';
            const normal = [];
            const mergedMap = {};

            orders.forEach(o => {
                if (o.merged_order_no) {
                    if (!mergedMap[o.merged_order_no]) mergedMap[o.merged_order_no] = [];
                    mergedMap[o.merged_order_no].push(o);
                } else {
                    normal.push(o);
                }
            });

            for (const [tripNo, trips] of Object.entries(mergedMap)) {
                html += `
                <div style="margin-bottom: 24px; padding: 12px; border: 2px dashed ${isDeliveringSection ? '#8B5CF6' : '#10B981'}; border-radius: 12px; background: ${isDeliveringSection ? '#faf5ff' : '#ecfdf5'};">
                    <h4 style="color: ${isDeliveringSection ? '#7c3aed' : '#059669'}; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-size: 15px;">
                        <i class="bi bi-link-45deg"></i> Chuyến Ghép: ${tripNo}
                        <span style="font-size: 11px; font-weight: normal; background: ${isDeliveringSection ? '#8B5CF6' : '#10B981'}; color: white; padding: 2px 8px; border-radius: 12px;">${trips.length} điểm</span>
                    </h4>
                    ${trips.map(o => this.renderOrderCard(o, isDeliveringSection)).join('')}
                </div>`;
            }

            html += normal.map(o => this.renderOrderCard(o, isDeliveringSection)).join('');
            return html;
        };

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
                ${renderGroupedOrders(delivering, true)}
            ` : ''}

            ${completed.length > 0 ? `
                <h3 style="margin-top: 32px; margin-bottom: 16px;"><i class="bi bi-check-circle"></i> Đơn đã hoàn thành</h3>
                ${renderGroupedOrders(completed, false)}
            ` : ''}
        `;
    },

    // Render order card
    renderOrderCard(order, isDelivering = false) {
        // Use assignment_id for split orders to uniquely identify each driver's assignment
        const orderId = order.assignment_id || order.id || order.order_id;
        const orderType = order.type || 'export';
        const typeBadge = orderType === 'import'
            ? '<span class="type-badge import" style="background:#4CAF50; color:white; padding:2px 8px; border-radius:4px; font-size:11px; margin-left:8px;">Nhập</span>'
            : '<span class="type-badge export" style="background:#2196F3; color:white; padding:2px 8px; border-radius:4px; font-size:11px; margin-left:8px;">Xuất</span>';

        return `
            <div class="order-card" style="position:relative; ${orderType === 'import' ? 'background:linear-gradient(135deg,#E8F5E9 0%,#C8E6C9 100%);border-left:4px solid #4CAF50;' : 'background:linear-gradient(135deg,#E3F2FD 0%,#BBDEFB 100%);border-left:4px solid #2196F3;'}">
                ${this.getUnreadBadgeHtml(orderId)}
                <div class="order-header">
                    <div>
                        <div class="order-id" style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                            #${order.soDon || order.id || order.order_id}${typeBadge}
                            ${order.merged_order_no ? `<span style="background:#4c6ef5; color:white; font-size:10px; padding:2px 6px; border-radius:10px;"><i class="bi bi-link-45deg"></i> ${order.merged_order_no}</span>` : ''}
                        </div>
                        <div class="order-customer">${order.customer || order.customer_name || order.khach || ''}</div>
                    </div>
                    <span class="status-badge ${isDelivering ? 'info' : 'success'}">${this.getStatusDisplay(order)}</span>
                </div>
                <div class="order-info">
                    <div><i class="bi bi-geo-alt"></i> ${order.address || order.delivery_address || order.diaChi || ''}</div>
                    ${order.taiXe ? `<div><i class="bi bi-person-badge"></i> <strong style="color:#8B5CF6;">${order.taiXe}</strong> ${order.bienSo ? `(${order.bienSo})` : ''}</div>` : ''}
                    <div><i class="bi bi-calendar"></i> ${typeof formatDate === 'function' ? formatDate(order.expected_date || order.created_at || order.ngay) : (order.ngay || 'N/A')}</div>
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

            // For IMPORT orders - use the new import delivery modal with image upload
            if (typeof openImportDeliveryModal === 'function') {
                openImportDeliveryModal(orderId);
            } else if (typeof window.openImportDeliveryModal === 'function') {
                window.openImportDeliveryModal(orderId);
            } else {
                console.error('openImportDeliveryModal function not found!');
                alert('Lỗi: Không tìm thấy form hoàn thành đơn nhập!');
            }

        } catch (error) {
            console.error('Error completing order:', error);
            alert('Có lỗi xảy ra!');
        }
    },

    // Xem chi tiết
    async viewDetail(orderId, orderType = 'export') {
        // For split orders, orderId may be assignment_id - try to find by that first
        let order = this.orders.find(o => o.assignment_id === orderId);
        // Fallback to order.id or order_id
        if (!order) {
            order = this.orders.find(o => (o.id || o.order_id) === orderId);
        }
        if (!order) return;

        console.log('View order detail:', order, `(found by ${order.assignment_id === orderId ? 'assignment_id' : 'order_id'})`);
        const typeLabel = orderType === 'import' ? 'Đơn nhập' : 'Đơn xuất';

        // Check if current user is admin
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : {};
        const isAdmin = (user.role || '').toLowerCase() === 'admin' || (user.role || '').toLowerCase() === 'tester';
        const isDriver = ['driver', 'taixe', 'assistant', 'phụ xe'].includes((user.role || '').toLowerCase());

        // Build product list - show all products (same for everyone)
        let products = order.products || order.cart || [];
        if (typeof products === 'string') {
            try { products = JSON.parse(products); } catch (e) { products = []; }
        }

        // Fetch all assignments for this order
        let allAssignments = [];
        const orderNo = order.soDon || order.sale_order_no || orderId;
        try {
            const assignResp = await fetch(`/api/orders/${orderNo}/assignments`);
            const assignData = await assignResp.json();
            if (!assignData.error && assignData.data && Array.isArray(assignData.data)) {
                allAssignments = assignData.data;
                console.log(`📦 Loaded ${allAssignments.length} assignments for order ${orderNo}`);
            }
        } catch (e) {
            console.log('No assignments data:', e.message);
        }

        // Fetch driver's assigned quantity and actual products from API
        let isSplitOrder = order.is_split_order || allAssignments.length > 1;
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

        // Show split order badge with driver's assigned quantity (for drivers only)
        const splitBadge = (!isAdmin && isSplitOrder && driverAssignedQty)
            ? `<div style="margin-bottom: 0.75rem; padding: 8px 12px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 8px; font-weight: 600;">
                <span style="color: #92400e;">📦 Phần của bạn:</span> 
                <span style="color: #78350f; font-size: 1.1em;">${driverAssignedQty} kg</span>
                ${order.split_progress ? `<span style="color: #a16207; font-size: 0.85em; margin-left: 8px;">(${order.split_progress})</span>` : ''}
               </div>`
            : '';

        // Build multi-driver assignment section for ADMIN
        let multiDriverHtml = '';
        if (isAdmin && allAssignments.length >= 1) {
            console.log(`🔍 my-orders Admin view: allAssignments.length = ${allAssignments.length}`, allAssignments);
            multiDriverHtml = `
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: linear-gradient(135deg, #f3e8ff, #e9d5ff); border-radius: 8px; border-left: 3px solid #8B5CF6;">
                <div style="font-weight: 600; margin-bottom: 0.5rem; color: #7c3aed; font-size: 0.85rem;">👥 Phân công tài xế (${allAssignments.length} người)</div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${allAssignments.map(a => {
                // Parse assigned_products for this driver
                let driverProducts = [];
                if (a.assigned_products) {
                    driverProducts = typeof a.assigned_products === 'string'
                        ? JSON.parse(a.assigned_products)
                        : a.assigned_products;
                }

                const statusBg = a.status === 'completed' ? 'background:#dcfce7; color:#16a34a;' :
                    a.status === 'delivering' ? 'background:#dbeafe; color:#2563eb;' :
                        'background:#fef3c7; color:#d97706;';
                const statusText = a.status === 'completed' ? '✓ Hoàn thành' :
                    a.status === 'delivering' ? 'Đang giao' : 'Chờ nhận';

                return `
                        <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
                                <div>
                                    <span style="font-weight: 600; font-size: 13px;">${a.driver_name || 'Tài xế'}</span>
                                    ${a.plate ? `<span style="color: #666; font-size: 11px; margin-left: 6px;">🚚 ${a.plate}</span>` : ''}
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="color: #8B5CF6; font-weight: 700; font-size: 13px;">${a.assigned_qty || 0}kg</span>
                                    <span style="font-size: 10px; padding: 3px 8px; border-radius: 10px; ${statusBg}">${statusText}</span>
                                </div>
                            </div>
                            ${driverProducts.length > 0 ? `
                            <div style="padding: 6px 12px; background: #faf5ff; font-size: 11px;">
                                ${driverProducts.map(p => `
                                <div style="display: flex; justify-content: space-between; color: #4c1d95; padding: 2px 0;">
                                    <span>${p.name || p.productName || 'Sản phẩm'}</span>
                                    <span style="font-weight: 600;">${p.qty || p.quantity || 0} ${p.unit || 'kg'}</span>
                                </div>
                                `).join('')}
                            </div>
                            ` : ''}
                        </div>
                        `;
            }).join('')}
                </div>
            </div>
            `;
        }

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

                            <!-- Thông tin vận chuyển -->
                            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                                <div style="font-weight: 600; margin-bottom: 0.5rem; color: #475569;">🚚 Vận chuyển</div>
                                <div style="color: #334155; font-size: 0.9rem; display: grid; grid-template-columns: 80px 1fr; gap: 4px;">
                                    <span style="color: #64748b;">Tài xế:</span>
                                    <span>${order.taiXe || order.driver_name || 'Chưa phân công'} ${order.bienSo || order.plate ? `(${order.bienSo || order.plate})` : ''}</span>
                                    ${order.assistant_name || order.phuXe ? `
                                    <span style="color: #64748b;">Phụ xe:</span>
                                    <span>${order.assistant_name || order.phuXe}</span>
                                    ` : ''}
                                    ${order.delivery_time || order.deliveryTime ? `
                                    <span style="color: #64748b;">T.Gian:</span>
                                    <span>${order.delivery_time || order.deliveryTime}</span>
                                    ` : ''}
                                </div>
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

                            <!-- Multi-driver assignment section (ADMIN only) -->
                            ${multiDriverHtml}

                            <!-- Combined delivery notes from all drivers -->
                            ${(() => {
                const notesArr = allAssignments
                    .filter(a => a.delivery_note && a.delivery_note.trim())
                    .map(a => `${a.driver_name}: ${a.delivery_note}`);
                if (notesArr.length === 0) return '';
                const combinedNotes = notesArr.join(' | ');
                return `
                            <div style="margin-bottom: 1rem; padding: 0.75rem; background: linear-gradient(135deg, #ecfdf5, #d1fae5); border-radius: 8px; border-left: 3px solid #10b981;">
                                <div style="font-weight: 600; margin-bottom: 0.25rem; color: #059669; font-size: 0.8rem;">📝 GHI CHÚ GIAO HÀNG</div>
                                <div style="color: #065f46; font-size: 0.9rem; line-height: 1.5;">${combinedNotes}</div>
                            </div>
                                `;
            })()}

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
