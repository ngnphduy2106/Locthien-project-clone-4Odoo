// ===============================================
// MODULE: ĐIỀU PHỐI (Dispatch/Order Management)
// ===============================================

const DispatchModule = {
    orders: [],
    currentTab: 'pending',
    employees: [],
    // Render cache for faster tab switching
    _renderCache: { pending: null, delivering: null, completed: null },
    _cacheVersion: 0,

    // Khởi tạo module
    init() {
        console.log('Dispatch Module initialized');
        this.loadEmployees();
        this.loadOrders();
        this.setupEventListeners();
    },

    // Load danh sách nhân viên (tài xế)
    async loadEmployees() {
        try {
            if (window.api) {
                const data = await window.api.getEmployees();
                if (!data.error) {
                    this.employees = (data.employees || []).filter(e => e.role === 'DRIVER');
                }
            }
        } catch (error) {
            console.error('Error loading employees:', error);
        }
    },

    // Setup event listeners
    setupEventListeners() {
        // Tab switching
        const tabs = document.querySelectorAll('[data-dispatch-tab]');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.dispatchTab);
            });
        });

        // Search
        const searchInput = document.getElementById('dispatch-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchOrders(e.target.value);
            });
        }
    },

    // Load danh sách đơn hàng
    async loadOrders() {
        try {
            if (window.api) {
                const data = await window.api.getOrders();

                if (data.error) {
                    console.error('Error from API:', data.msg);
                    this.loadMockOrders();
                    return;
                }

                this.orders = data.orders || [];
                // Invalidate render cache when data changes
                this._cacheVersion++;
                this._renderCache = { pending: null, delivering: null, completed: null };
            } else {
                this.loadMockOrders();
            }

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
                customer_name: 'Công ty TNHH ABC',
                address: '123 Nguyễn Văn Linh, Q7, TP.HCM',
                delivery_address: '123 Nguyễn Văn Linh, Q7, TP.HCM',
                status: 'Chờ xử lý',
                date: '2024-07-28',
                order_date: '28/7/2024',
                total: 15000000,
                total_amount: 15000000,
                products: [
                    {
                        code: '10HCL',
                        material_code: '10HCL',
                        name: 'Axit clohydric HCl (10+1)%',
                        material_name: 'Axit clohydric HCl (10+1)%',
                        quantity: 100,
                        qty: 100,
                        unit: 'kg',
                        delivered_qty: 0
                    },
                    {
                        code: 'NAOH50',
                        material_code: 'NAOH50',
                        name: 'NaOH 50%',
                        material_name: 'NaOH 50%',
                        quantity: 50,
                        qty: 50,
                        unit: 'kg',
                        delivered_qty: 0
                    }
                ]
            },
            {
                id: 'ORD002',
                customer: 'Công ty XYZ',
                customer_name: 'Công ty XYZ',
                address: '456 Lê Văn Việt, Q9, TP.HCM',
                delivery_address: '456 Lê Văn Việt, Q9, TP.HCM',
                status: 'Đang giao',
                date: '2024-07-27',
                order_date: '27/7/2024',
                total: 25000000,
                total_amount: 25000000,
                driver: 'Nguyễn Văn A',
                driver_name: 'Nguyễn Văn A',
                plate: '51A-12345',
                vehicle_plate: '51A-12345',
                products: [
                    {
                        code: 'H2SO4',
                        material_code: 'H2SO4',
                        name: 'H2SO4 98%',
                        material_name: 'H2SO4 98%',
                        quantity: 200,
                        qty: 200,
                        unit: 'kg',
                        delivered_qty: 200
                    }
                ]
            },
            {
                id: 'ORD003',
                customer: 'Công ty DEF',
                customer_name: 'Công ty DEF',
                address: '789 Võ Văn Ngân, Thủ Đức, TP.HCM',
                delivery_address: '789 Võ Văn Ngân, Thủ Đức, TP.HCM',
                status: 'Hoàn thành',
                date: '2024-07-26',
                order_date: '26/7/2024',
                total: 18000000,
                total_amount: 18000000,
                driver: 'Trần Thị B',
                driver_name: 'Trần Thị B',
                plate: '51B-67890',
                vehicle_plate: '51B-67890',
                completedDate: '2024-07-26 16:30',
                completed_at: '2024-07-26 16:30',
                products: [
                    {
                        code: 'JAVEL',
                        material_code: 'JAVEL',
                        name: 'Javen 10%',
                        material_name: 'Javen 10%',
                        quantity: 150,
                        qty: 150,
                        unit: 'kg',
                        delivered_qty: 150
                    }
                ]
            }
        ];
        this.renderOrders();
    },

    // Render danh sách đơn hàng
    renderOrders() {
        const container = document.getElementById('dispatch-content');
        if (!container) return;

        const filteredOrders = this.filterOrdersByTab();

        container.innerHTML = `
            <div class="tab-buttons">
                <button class="tab-button ${this.currentTab === 'pending' ? 'active' : ''}" data-dispatch-tab="pending">Chờ xử lý</button>
                <button class="tab-button ${this.currentTab === 'delivering' ? 'active' : ''}" data-dispatch-tab="delivering">Đang giao</button>
                <button class="tab-button ${this.currentTab === 'completed' ? 'active' : ''}" data-dispatch-tab="completed">Hoàn thành</button>
            </div>

            <input type="text" id="dispatch-search" class="form-control" placeholder="🔍 Tìm kiếm đơn hàng..." style="margin-bottom: 20px;">

            <div id="dispatch-orders-list"></div>
        `;

        // Re-setup event listeners after rendering
        this.setupEventListeners();

        // Render orders list
        this.renderOrdersList(filteredOrders);
    },

    // Render orders list (with caching for faster tab switching)
    renderOrdersList(orders) {
        const listContainer = document.getElementById('dispatch-orders-list');
        if (!listContainer) return;

        // Check cache first for faster tab switching
        const tab = this.currentTab;
        if (this._renderCache[tab] !== null) {
            listContainer.innerHTML = this._renderCache[tab];
            return;
        }

        if (orders.length === 0) {
            const html = `
                <div class="empty-state">
                    <i class="bi bi-inbox"></i>
                    <p>Không có đơn hàng nào</p>
                </div>
            `;
            this._renderCache[tab] = html;
            listContainer.innerHTML = html;
            return;
        }

        // 2-row compact format matching imports
        const html = `<div class="compact-order-list" style="display:flex; flex-direction:column; gap:4px;">
            ${orders.map(order => {
            const orderId = order.id || order.order_id || order.soDon || order.orderCode;
            const date = order.date || order.order_date || order.ngay || order.expected_date;
            const customer = order.customer || order.customer_name || order.khach || 'N/A';
            const address = order.address || order.delivery_address || order.diaChi || 'Sunco';
            const driver = order.driver || order.driver_name || order.assigned_driver || '';
            const status = order.status || 'Chờ xử lý';
            const borderColor = status === 'Hoàn thành' || status === 'COMPLETED' || status === 'DONE' ? 'var(--success)' :
                status === 'Đang giao' || status === 'DELIVERING' || status === 'Đang thực hiện' ? 'var(--info)' : 'var(--warning)';

            return `
                <div class="compact-order-row" onclick="DispatchModule.viewOrderDetail('${orderId}')" style="
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    padding: 8px 10px;
                    background: var(--card-bg);
                    border-radius: 6px;
                    cursor: pointer;
                    border-left: 3px solid ${borderColor};
                    transition: all 0.15s ease;
                    position: relative;
                " onmouseenter="this.style.opacity='0.9'" onmouseleave="this.style.opacity='1'">
                    
                    <!-- ROW 1: PO + Date + Status + BUTTONS -->
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:nowrap; width:100%;">
                        <span style="font-weight:600; color:var(--primary); font-size:11px; white-space:nowrap;">${orderId}</span>
                        <span style="font-size:10px; color:var(--text-secondary); white-space:nowrap;">${date ? new Date(date).toLocaleDateString('vi-VN') : 'N/A'}</span>
                        <span class="badge badge-${this.getStatusClass(status)}" style="font-size:9px; padding:2px 5px; white-space:nowrap;">${status}</span>
                        <div style="display:flex; gap:3px; flex-shrink:0;" onclick="event.stopPropagation()">
                            <button class="btn btn-outline btn-sm" onclick="DispatchModule.viewOrderDetail('${orderId}')" style="padding:2px; font-size:9px; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center;">
                                <i class="bi bi-eye"></i>
                            </button>
                            ${this.getActionButton(order)}
                        </div>
                        ${driver ? `<span style="font-size:10px; color:var(--info); margin-left:auto; white-space:nowrap;">${driver}</span>` : ''}
                    </div>
                    
                    <!-- ROW 2: Customer + Address -->
                    <div style="display:flex; align-items:center; gap:8px; width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        <span style="font-weight:500; color:var(--text-primary); font-size:12px;">${customer}</span>
                        <span style="font-size:10px; color:var(--text-muted);"><i class="bi bi-geo-alt" style="font-size:9px;"></i> ${address}</span>
                    </div>
                </div>`;
        }).join('')}
        </div>`;

        this._renderCache[tab] = html;
        listContainer.innerHTML = html;
    },

    // Get action button based on status (compact icon buttons)
    getActionButton(order) {
        const status = order.status;
        const orderId = order.id || order.order_id || order.soDon || order.orderCode;

        if (status === 'Chờ xử lý' || status === 'PENDING' || status === 'NEW' || status === 'Chưa thực hiện') {
            return `
                <button class="btn btn-info btn-sm" onclick="event.stopPropagation(); DispatchModule.showAssignDriverModal('${orderId}')" style="padding:3px 6px; font-size:9px; border-radius:50%; width:24px; height:24px;">
                    <i class="bi bi-person-plus"></i>
                </button>
            `;
        } else if (status === 'Đang giao' || status === 'DELIVERING' || status === 'IN_PROGRESS' || status === 'Đang thực hiện') {
            return `
                <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); DispatchModule.viewOrderDetail('${orderId}')" style="padding:3px 6px; font-size:9px; border-radius:50%; width:24px; height:24px;">
                    <i class="bi bi-check"></i>
                </button>
            `;
        } else {
            return '';
        }
    },

    // Filter orders by tab
    filterOrdersByTab() {
        const statusMap = {
            'pending': ['Chờ xử lý', 'PENDING', 'NEW', 'Chưa thực hiện'],
            'delivering': ['Đang giao', 'DELIVERING', 'IN_PROGRESS', 'Đang thực hiện'],
            'completed': ['Hoàn thành', 'COMPLETED', 'DONE', 'Đã thực hiện']
        };

        const validStatuses = statusMap[this.currentTab] || [];

        return this.orders.filter(o => validStatuses.includes(o.status));
    },

    // Switch tab
    switchTab(tab) {
        this.currentTab = tab;

        // Update active tab
        document.querySelectorAll('[data-dispatch-tab]').forEach(t => {
            t.classList.remove('active');
        });
        const activeTab = document.querySelector(`[data-dispatch-tab="${tab}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        const filteredOrders = this.filterOrdersByTab();
        this.renderOrdersList(filteredOrders);
    },

    // Get status class
    getStatusClass(status) {
        const statusMap = {
            'Chờ xử lý': 'warning',
            'PENDING': 'warning',
            'NEW': 'warning',
            'Chưa thực hiện': 'warning',
            'Đang giao': 'info',
            'DELIVERING': 'info',
            'IN_PROGRESS': 'info',
            'Đang thực hiện': 'info',
            'Hoàn thành': 'success',
            'COMPLETED': 'success',
            'DONE': 'success',
            'Đã thực hiện': 'success',
            'Đã hủy': 'danger',
            'Đã hủy bỏ': 'danger',
            'CANCELLED': 'danger'
        };
        return statusMap[status] || '';
    },

    // Show assign driver modal
    showAssignDriverModal(orderId) {
        const order = this.orders.find(o => (o.id || o.order_id) === orderId);
        if (!order) return;

        // Create modal HTML
        const modalHTML = `
            <div class="modal-overlay" id="assign-driver-modal" onclick="if(event.target === this) DispatchModule.closeAssignModal()">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3><i class="bi bi-person-plus"></i> Gán Tài Xế</h3>
                        <button class="btn-close" onclick="DispatchModule.closeAssignModal()">
                            <i class="bi bi-x"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div style="margin-bottom: 16px; padding: 12px; background: #f0f2f5; border-radius: 8px;">
                            <strong>Đơn hàng: #${order.id || order.order_id}</strong><br>
                            <small>${order.customer || order.customer_name}</small>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Tài xế *</label>
                            <input type="text" id="driver-name" class="form-control" placeholder="Nhập tên tài xế" list="driver-list">
                            <datalist id="driver-list">
                                ${this.employees.map(e => `<option value="${e.name || e.full_name}">`).join('')}
                            </datalist>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Biển số xe *</label>
                            <input type="text" id="vehicle-plate" class="form-control" placeholder="VD: 51A-12345">
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Ghi chú</label>
                            <textarea id="assign-note" class="form-control" rows="3" placeholder="Ghi chú thêm (không bắt buộc)"></textarea>
                        </div>

                        <button class="btn-view" style="width: 100%; padding: 12px;" onclick="DispatchModule.assignDriver('${orderId}')">
                            <i class="bi bi-check-circle"></i> Xác nhận gán tài xế
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    // Close assign modal
    closeAssignModal() {
        const modal = document.getElementById('assign-driver-modal');
        if (modal) {
            modal.remove();
        }
    },

    // Gán tài xế cho đơn hàng
    async assignDriver(orderId) {
        const driverName = document.getElementById('driver-name').value.trim();
        const vehiclePlate = document.getElementById('vehicle-plate').value.trim();
        const note = document.getElementById('assign-note').value.trim();

        if (!driverName) {
            alert('Vui lòng nhập tên tài xế!');
            return;
        }

        if (!vehiclePlate) {
            alert('Vui lòng nhập biển số xe!');
            return;
        }

        try {
            if (window.api) {
                const data = await window.api.assignOrder(orderId, driverName, vehiclePlate, note);

                if (data.error) {
                    alert('Lỗi: ' + data.msg);
                    return;
                }

                alert(`Đã gán tài xế ${driverName} (${vehiclePlate}) cho đơn hàng ${orderId}`);
            } else {
                // Mock update
                const order = this.orders.find(o => (o.id || o.order_id) === orderId);
                if (order) {
                    order.driver = driverName;
                    order.plate = vehiclePlate;
                    order.status = 'Đang giao';
                }
                alert(`Đã gán tài xế ${driverName} (${vehiclePlate}) cho đơn hàng ${orderId}`);
            }

            this.closeAssignModal();
            this.loadOrders(); // Reload orders

        } catch (error) {
            console.error('Error assigning driver:', error);
            alert('Có lỗi xảy ra khi gán tài xế!');
        }
    },

    // View order detail
    viewOrderDetail(orderId) {
        const order = this.orders.find(o => (o.id || o.order_id) === orderId);
        if (!order) return;

        // Lấy danh sách sản phẩm
        const products = order.products || order.items || [];

        // Tính tổng số lượng
        const totalQuantity = products.reduce((sum, p) => sum + (p.quantity || p.qty || 0), 0);
        const deliveredQuantity = products.reduce((sum, p) => sum + (p.delivered_qty || 0), 0);
        const remainingQuantity = totalQuantity - deliveredQuantity;

        // Create modal HTML
        const modalHTML = `
            <div class="modal-overlay" id="order-detail-modal" onclick="if(event.target === this) DispatchModule.closeDetailModal()">
                <div class="modal-content order-detail-modal" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
                    <!-- Header -->
                    <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px 12px 0 0; position: sticky; top: 0; z-index: 10;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0; font-size: 20px;">
                                <i class="bi bi-file-text"></i> #${order.id || order.order_id} - ${order.customer_name || order.customer || 'N/A'}
                            </h3>
                            <button class="btn-close" onclick="DispatchModule.closeDetailModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 8px; cursor: pointer;">
                                <i class="bi bi-x" style="font-size: 20px;"></i>
                            </button>
                        </div>
                        <div style="margin-top: 8px; font-size: 13px; opacity: 0.9;">
                            <i class="bi bi-calendar"></i> ${order.order_date || order.date || 'N/A'}
                            <span style="margin-left: 16px;"><i class="bi bi-geo-alt"></i> ${order.delivery_address || order.address || 'N/A'}</span>
                        </div>
                    </div>

                    <div class="modal-body" style="padding: 24px;">
                        <!-- Thông tin khách hàng -->
                        <div class="detail-section">
                            <h4 class="section-title"><i class="bi bi-person"></i> Khách hàng</h4>
                            <div class="info-card">
                                <div class="info-row">
                                    <strong>${order.customer_name || order.customer || 'N/A'}</strong>
                                </div>
                                <div class="info-row" style="font-size: 13px; color: #64748b;">
                                    ${order.delivery_address || order.address || 'N/A'}
                                </div>
                            </div>
                        </div>

                        <!-- Ghi chú từ MISA (nếu có) -->
                        ${order.misa_note ? `
                        <div class="detail-section">
                            <h4 class="section-title" style="color: #f59e0b;"><i class="bi bi-sticky"></i> Ghi chú từ MISA</h4>
                            <div class="info-card" style="background: #fffbeb; border-left: 3px solid #f59e0b;">
                                <div class="info-row" style="color: #78350f;">
                                    ${order.misa_note}
                                </div>
                            </div>
                        </div>
                        ` : ''}

                        <!-- Người tạo đơn (nếu có) -->
                        ${order.creator_name ? `
                        <div class="detail-section">
                            <h4 class="section-title" style="color: #3b82f6;"><i class="bi bi-person-badge"></i> Người tạo đơn</h4>
                            <div class="info-card" style="background: #eff6ff; border-left: 3px solid #3b82f6;">
                                <div class="info-row" style="color: #1e3a8a;">
                                    ${order.creator_name}
                                </div>
                                <div class="info-row" style="font-size: 12px; color: #6b7280;">
                                    Liên hệ người này nếu cần hỗ trợ
                                </div>
                            </div>
                        </div>
                        ` : ''}

                        <!-- Danh sách hàng hóa -->
                        <div class="detail-section">
                            <h4 class="section-title"><i class="bi bi-box-seam"></i> Danh sách hàng hóa</h4>
                            <div class="products-table">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <thead>
                                        <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                                            <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #475569;">Mã</th>
                                            <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #475569;">Tên hàng</th>
                                            <th style="padding: 12px; text-align: right; font-size: 13px; font-weight: 600; color: #475569;">SL. ĐVT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${products.map(p => `
                                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                                <td style="padding: 12px;">
                                                    <span class="product-code">${p.code || p.material_code || 'N/A'}</span>
                                                </td>
                                                <td style="padding: 12px; font-size: 14px;">${p.name || p.material_name || 'N/A'}</td>
                                                <td style="padding: 12px; text-align: right; font-weight: 600;">${p.quantity || p.qty || 0} ${p.unit || 'kg'}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Mặt hàng phụ (Vỏ) - Local only, NOT synced to MISA -->
                        <div class="detail-section">
                            <h4 class="section-title"><i class="bi bi-box"></i> Mặt hàng phụ (Vỏ)</h4>
                            <div class="local-items-section" id="local-items-section-${orderId}">
                                <!-- Buttons cho các loại vỏ phổ biến -->
                                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                                    <button class="local-item-btn" data-type="Vỏ can 30L" onclick="DispatchModule.addLocalItem('${orderId}', 'Vỏ can 30L')" style="padding: 8px 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; cursor: pointer; font-size: 13px;">
                                        🧴 Vỏ can 30L
                                    </button>
                                    <button class="local-item-btn" data-type="Vỏ phuy" onclick="DispatchModule.addLocalItem('${orderId}', 'Vỏ phuy')" style="padding: 8px 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; cursor: pointer; font-size: 13px;">
                                        🛢️ Vỏ phuy
                                    </button>
                                    <button class="local-item-btn" data-type="Vỏ tank" onclick="DispatchModule.addLocalItem('${orderId}', 'Vỏ tank')" style="padding: 8px 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; cursor: pointer; font-size: 13px;">
                                        🏭 Vỏ tank
                                    </button>
                                    <button class="local-item-btn" data-type="Vỏ can 20L" onclick="DispatchModule.addLocalItem('${orderId}', 'Vỏ can 20L')" style="padding: 8px 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; cursor: pointer; font-size: 13px;">
                                        🧴 Vỏ can 20L
                                    </button>
                                </div>
                                
                                <!-- Textbox gợi ý sản phẩm CRM -->
                                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                                    <input type="text" id="local-item-name-${orderId}" class="form-control" placeholder="Hoặc nhập tên mặt hàng..." list="crm-products-list" style="flex: 1;">
                                    <input type="number" id="local-item-qty-${orderId}" class="form-control" placeholder="SL" style="width: 80px;" value="1" min="1">
                                    <button onclick="DispatchModule.addLocalItemManual('${orderId}')" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer;">
                                        <i class="bi bi-plus"></i> Thêm
                                    </button>
                                </div>
                                
                                <!-- Datalist gợi ý sản phẩm CRM -->
                                <datalist id="crm-products-list">
                                    ${(window.cachedMaterials || []).map(m => `<option value="${m.name || m.material_name}">`).join('')}
                                </datalist>
                                
                                <!-- Bảng hiển thị mặt hàng phụ đã thêm -->
                                <div id="local-items-table-${orderId}">
                                    ${this.renderLocalItemsTable(order.local_items || [], orderId)}
                                </div>
                            </div>
                        </div>

                        <!-- Thông tin vận chuyển -->
                        <div class="detail-section">
                            <h4 class="section-title"><i class="bi bi-truck"></i> Thông tin vận chuyển</h4>
                            <div class="info-card">
                                <div class="info-row">
                                    <span style="color: #64748b;">Tài xế:</span>
                                    <strong>${order.driver_name || order.driver || 'Chưa gán'}</strong>
                                </div>
                                <div class="info-row">
                                    <span style="color: #64748b;">Xe:</span>
                                    <strong>${order.vehicle_plate || order.plate || '---'}</strong>
                                </div>
                                ${order.delivery_note ? `
                                <div class="info-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9; flex-direction: column; gap: 4px;">
                                    <span style="color: #64748b;"><i class="bi bi-pencil-square"></i> Ghi chú giao hàng:</span>
                                    <div style="background: #fef3c7; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #f59e0b; color: #92400e; font-size: 13px;">
                                        ${order.delivery_note}
                                    </div>
                                </div>
                                ` : ''}
                            </div>
                        </div>

                        <!-- Phân công tài xế -->
                        <div class="detail-section">
                            <h4 class="section-title"><i class="bi bi-person-gear"></i> Phân công tài xế</h4>
                            
                            ${order.driver_name || order.driver ? `
                                <!-- Hiển thị tài xế đã gán -->
                                <div class="assigned-driver-card">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <div style="font-weight: 600; margin-bottom: 4px;">${order.driver_name || order.driver}</div>
                                            <div style="font-size: 13px; color: #64748b;">
                                                <i class="bi bi-truck"></i> ${order.vehicle_plate || order.plate || 'N/A'}
                                            </div>
                                        </div>
                                        <div style="display: flex; gap: 8px;">
                                            <button class="btn-icon" onclick="DispatchModule.editDriver('${orderId}')" title="Sửa">
                                                <i class="bi bi-pencil"></i>
                                            </button>
                                            <button class="btn-icon btn-danger" onclick="DispatchModule.removeDriver('${orderId}')" title="Xóa">
                                                <i class="bi bi-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ` : `
                                <!-- Form gán tài xế -->
                                <div class="assign-driver-form" id="assign-driver-form-${orderId}">
                                    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px; color: #92400e;">
                                        <i class="bi bi-exclamation-triangle"></i> Chưa có tài xế nào
                                    </div>
                                    
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                                        <div>
                                            <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600;">Chọn tài xế</label>
                                            <select id="driver-select-${orderId}" class="form-control" style="width: 100%;">
                                                <option value="">-- Chọn tài xế --</option>
                                                ${this.employees.map(e => `<option value="${e.id || e.employee_id}">${e.fullName || e.full_name || e.name}</option>`).join('')}
                                            </select>
                                        </div>
                                        <div>
                                            <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600;">Số lượng (kg)</label>
                                            <input type="number" id="driver-qty-${orderId}" class="form-control" placeholder="Số lượng" value="${totalQuantity}">
                                        </div>
                                    </div>
                                    
                                    <div style="margin-bottom: 12px;">
                                        <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600;">Ghi chú</label>
                                        <input type="text" id="driver-note-${orderId}" class="form-control" placeholder="Ghi chú">
                                    </div>
                                    
                                    <button class="btn-primary" onclick="DispatchModule.addDriverToOrder('${orderId}')" style="width: 100%; padding: 12px; background: #f97316; border: none; color: white; border-radius: 8px; font-weight: 600; cursor: pointer;">
                                        <i class="bi bi-plus-circle"></i> THÊM TÀI XẾ
                                    </button>
                                </div>
                            `}

                            <!-- Tổng kết -->
                            <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                    <span style="font-size: 13px; color: #64748b;">Tổng CRM:</span>
                                    <strong style="color: #1e293b;">${totalQuantity} kg</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                    <span style="font-size: 13px; color: #64748b;">Đã phân:</span>
                                    <strong style="color: #059669;">${deliveredQuantity} kg</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="font-size: 13px; color: #64748b;">Còn lại:</span>
                                    <strong style="color: #dc2626;">${remainingQuantity} kg</strong>
                                </div>
                            </div>

                            <!-- Nút xác nhận phân công -->
                            ${order.driver_name || order.driver ? `
                                <button class="btn-success" onclick="DispatchModule.confirmAssignment('${orderId}')" style="width: 100%; margin-top: 16px; padding: 14px; background: #10b981; border: none; color: white; border-radius: 8px; font-weight: 600; font-size: 15px; cursor: pointer;">
                                    <i class="bi bi-check-circle"></i> XÁC NHẬN PHÂN CÔNG
                                </button>
                            ` : ''}
                        </div>

                        <!-- Trao đổi đơn hàng -->
                        <div class="detail-section">
                            <h4 class="section-title"><i class="bi bi-chat-dots"></i> Trao đổi đơn hàng</h4>
                            <div class="chat-container">
                                <div class="chat-messages" id="chat-messages-${orderId}" style="min-height: 100px; max-height: 200px; overflow-y: auto; padding: 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 12px;">
                                    <div style="text-align: center; color: #94a3b8; font-size: 13px; padding: 20px;">
                                        <i class="bi bi-chat-dots" style="font-size: 24px; opacity: 0.3;"></i>
                                        <div>Đang tải...</div>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <input type="text" id="chat-input-${orderId}" class="form-control" placeholder="Nhập tin nhắn..." style="flex: 1;">
                                    <button class="btn-primary" onclick="DispatchModule.sendMessage('${orderId}')" style="padding: 10px 20px; background: #3b82f6; border: none; color: white; border-radius: 8px; cursor: pointer;">
                                        <i class="bi bi-send"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Footer Actions -->
                        <div style="display: flex; gap: 12px; margin-top: 24px; padding-top: 20px; border-top: 2px solid #e2e8f0;">
                            <button class="btn-secondary" onclick="DispatchModule.closeDetailModal()" style="flex: 1; padding: 12px; background: #e5e7eb; border: none; color: #374151; border-radius: 8px; font-weight: 600; cursor: pointer;">
                                Đóng
                            </button>
                            <button class="btn-success" onclick="DispatchModule.closeDetailModal(); openDeliveryModal('${orderId}')" style="flex: 1; padding: 12px; background: #10b981; border: none; color: white; border-radius: 8px; font-weight: 600; cursor: pointer;">
                                <i class="bi bi-check-circle"></i> Hoàn thành
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .order-detail-modal .detail-section {
                    margin-bottom: 24px;
                }
                
                .order-detail-modal .section-title {
                    font-size: 15px;
                    font-weight: 700;
                    color: #667eea;
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .order-detail-modal .info-card {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 16px;
                }
                
                .order-detail-modal .info-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                
                .order-detail-modal .info-row:last-child {
                    margin-bottom: 0;
                }
                
                .order-detail-modal .product-code {
                    background: #e0e7ff;
                    color: #4338ca;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                }
                
                .order-detail-modal .assigned-driver-card {
                    background: #f0fdf4;
                    border: 1px solid #86efac;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                }
                
                .order-detail-modal .btn-icon {
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    border: 1px solid #e5e7eb;
                    background: white;
                    color: #6b7280;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .order-detail-modal .btn-icon:hover {
                    background: #f3f4f6;
                    border-color: #d1d5db;
                }
                
                .order-detail-modal .btn-icon.btn-danger {
                    color: #dc2626;
                }
                
                .order-detail-modal .btn-icon.btn-danger:hover {
                    background: #fee2e2;
                    border-color: #fca5a5;
                }

                /* Mobile responsive for products table */
                @media (max-width: 767px) {
                    .order-detail-modal .products-table {
                        overflow-x: auto;
                    }
                    
                    .order-detail-modal .products-table table {
                        min-width: 100%;
                    }
                    
                    .order-detail-modal .products-table th,
                    .order-detail-modal .products-table td {
                        padding: 8px !important;
                        font-size: 12px !important;
                    }
                    
                    .order-detail-modal .products-table th:first-child,
                    .order-detail-modal .products-table td:first-child {
                        display: none; /* Hide code column on mobile */
                    }
                    
                    .order-detail-modal .product-code {
                        font-size: 10px !important;
                        padding: 2px 6px !important;
                    }
                    
                    .order-detail-modal .modal-content {
                        margin: 10px;
                        max-height: calc(100vh - 20px);
                    }
                    
                    .order-detail-modal .modal-header {
                        padding: 14px !important;
                    }
                    
                    .order-detail-modal .modal-header h3 {
                        font-size: 16px !important;
                    }
                    
                    .order-detail-modal .modal-body {
                        padding: 14px !important;
                    }
                    
                    .order-detail-modal .section-title {
                        font-size: 13px !important;
                    }
                    
                    /* Stack assign driver form on mobile */
                    .order-detail-modal .assign-driver-form > div[style*="grid-template-columns: 1fr 1fr"] {
                        display: block !important;
                    }
                    
                    .order-detail-modal .assign-driver-form > div[style*="grid-template-columns: 1fr 1fr"] > div {
                        margin-bottom: 12px;
                    }
                    
                    /* Local items buttons wrap */
                    .local-items-section > div[style*="flex-wrap: wrap"] {
                        gap: 6px !important;
                    }
                    
                    .local-items-section .local-item-btn {
                        padding: 6px 10px !important;
                        font-size: 11px !important;
                    }
                }
            </style>
        `;

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    // Close detail modal
    closeDetailModal() {
        const modal = document.getElementById('order-detail-modal');
        if (modal) {
            modal.remove();
        }
    },

    // Add driver to order
    async addDriverToOrder(orderId) {
        const driverSelect = document.getElementById(`driver-select-${orderId}`);
        const qtyInput = document.getElementById(`driver-qty-${orderId}`);
        const noteInput = document.getElementById(`driver-note-${orderId}`);

        const driverId = driverSelect.value;
        const quantity = parseInt(qtyInput.value) || 0;
        const note = noteInput.value.trim();

        if (!driverId) {
            alert('Vui lòng chọn tài xế!');
            return;
        }

        if (quantity <= 0) {
            alert('Vui lòng nhập số lượng hợp lệ!');
            return;
        }

        try {
            // Call API to assign driver
            // const response = await fetch('/api/orders/assign-driver', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify({ orderId, driverId, quantity, note })
            // });

            // Mock update
            const order = this.orders.find(o => (o.id || o.order_id) === orderId);
            const driver = this.employees.find(e => (e.id || e.employee_id) == driverId);

            if (order && driver) {
                order.driver_name = driver.fullName || driver.full_name || driver.name;
                order.driver = driver.fullName || driver.full_name || driver.name;
                order.vehicle_plate = driver.plate || '---';
                order.plate = driver.plate || '---';
                order.status = 'Đang giao';
            }

            alert('✅ Đã thêm tài xế thành công!');
            this.closeDetailModal();
            this.loadOrders();

        } catch (error) {
            console.error('Error adding driver:', error);
            alert('Có lỗi xảy ra khi thêm tài xế!');
        }
    },

    // Edit driver
    editDriver(orderId) {
        alert('Chức năng sửa tài xế đang được phát triển!');
        // TODO: Implement edit driver functionality
    },

    // Remove driver
    async removeDriver(orderId) {
        if (!confirm('Bạn có chắc muốn xóa tài xế khỏi đơn hàng này?')) {
            return;
        }

        try {
            // Call API to remove driver
            // const response = await fetch(`/api/orders/${orderId}/remove-driver`, {
            //     method: 'DELETE'
            // });

            // Mock update
            const order = this.orders.find(o => (o.id || o.order_id) === orderId);
            if (order) {
                order.driver_name = null;
                order.driver = null;
                order.vehicle_plate = null;
                order.plate = null;
                order.status = 'Chờ xử lý';
            }

            alert('✅ Đã xóa tài xế thành công!');
            this.closeDetailModal();
            this.loadOrders();

        } catch (error) {
            console.error('Error removing driver:', error);
            alert('Có lỗi xảy ra khi xóa tài xế!');
        }
    },

    // Confirm assignment
    async confirmAssignment(orderId) {
        if (!confirm('Xác nhận phân công tài xế cho đơn hàng này?')) {
            return;
        }

        try {
            // Call API to confirm assignment
            // const response = await fetch(`/api/orders/${orderId}/confirm-assignment`, {
            //     method: 'POST'
            // });

            alert('✅ Đã xác nhận phân công thành công!');
            this.closeDetailModal();
            this.loadOrders();

        } catch (error) {
            console.error('Error confirming assignment:', error);
            alert('Có lỗi xảy ra khi xác nhận phân công!');
        }
    },

    // Send message
    async sendMessage(orderId) {
        const input = document.getElementById(`chat-input-${orderId}`);
        const message = input.value.trim();

        if (!message) {
            return;
        }

        try {
            // Call API to send message
            // const response = await fetch('/api/orders/messages', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify({ orderId, message })
            // });

            // Mock: Add message to chat
            const chatContainer = document.getElementById(`chat-messages-${orderId}`);
            if (chatContainer) {
                const messageHTML = `
                    <div style="margin-bottom: 12px; padding: 10px; background: white; border-radius: 8px; border-left: 3px solid #667eea;">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">
                            <strong>Bạn</strong> • ${new Date().toLocaleTimeString('vi-VN')}
                        </div>
                        <div style="font-size: 14px; color: #1e293b;">${message}</div>
                    </div>
                `;
                chatContainer.insertAdjacentHTML('beforeend', messageHTML);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            input.value = '';

        } catch (error) {
            console.error('Error sending message:', error);
            alert('Có lỗi xảy ra khi gửi tin nhắn!');
        }
    },

    // Complete order
    async completeOrder(orderId) {
        if (!confirm('Xác nhận hoàn thành đơn hàng này?')) {
            return;
        }

        try {
            // Get order details first
            const order = this.orders.find(o => (o.id || o.order_id) === orderId);
            if (!order) {
                alert('Không tìm thấy đơn hàng!');
                return;
            }

            // Get driver info
            const driverName = order.driver_name || order.driver || localStorage.getItem('userName') || 'Driver';
            const plate = order.vehicle_plate || order.plate || '';

            // Call API to complete order
            const response = await fetch(`/api/orders/${orderId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // Use admin_completed flag for dispatch module
                    admin_completed: true,
                    delivery_note: 'Hoàn thành từ màn hình điều phối'
                })
            });

            const data = await response.json();

            if (data.error) {
                alert('Lỗi: ' + data.msg);
                return;
            }

            alert('✅ Đã hoàn thành đơn hàng thành công!');
            this.closeDetailModal();
            this.loadOrders();

        } catch (error) {
            console.error('Error completing order:', error);
            alert('Có lỗi xảy ra khi hoàn thành đơn hàng!');
        }
    },

    // Search orders
    searchOrders(query) {
        if (!query) {
            const filteredOrders = this.filterOrdersByTab();
            this.renderOrdersList(filteredOrders);
            return;
        }

        const filtered = this.orders.filter(order => {
            const matchesSearch = (order.id || order.order_id || '').toLowerCase().includes(query.toLowerCase()) ||
                (order.customer || order.customer_name || '').toLowerCase().includes(query.toLowerCase()) ||
                (order.address || order.delivery_address || '').toLowerCase().includes(query.toLowerCase());

            const statusMap = {
                'pending': ['Chờ xử lý', 'PENDING', 'NEW', 'Chưa thực hiện'],
                'delivering': ['Đang giao', 'DELIVERING', 'IN_PROGRESS', 'Đang thực hiện'],
                'completed': ['Hoàn thành', 'COMPLETED', 'DONE', 'Đã thực hiện']
            };
            const validStatuses = statusMap[this.currentTab] || [];
            const matchesTab = validStatuses.includes(order.status);

            return matchesSearch && matchesTab;
        });

        this.renderOrdersList(filtered);
    },

    // ==========================================
    // LOCAL ITEMS (Vỏ - NOT synced to MISA)
    // ==========================================

    // Render local items table
    renderLocalItemsTable(localItems, orderId) {
        if (!localItems || localItems.length === 0) {
            return `<div style="text-align: center; color: #94a3b8; font-size: 13px; padding: 16px; background: #f8fafc; border-radius: 8px;">
                <i class="bi bi-box" style="font-size: 20px; opacity: 0.5;"></i>
                <div style="margin-top: 8px;">Chưa có mặt hàng phụ</div>
            </div>`;
        }

        return `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #fef3c7; border-bottom: 1px solid #fcd34d;">
                        <th style="padding: 8px; text-align: left;">Mặt hàng</th>
                        <th style="padding: 8px; text-align: right; width: 80px;">SL</th>
                        <th style="padding: 8px; text-align: center; width: 50px;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${localItems.map((item, idx) => `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px;">
                                <span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 12px;">📦</span>
                                ${item.name}
                            </td>
                            <td style="padding: 8px; text-align: right; font-weight: 600;">${item.qty}</td>
                            <td style="padding: 8px; text-align: center;">
                                <button onclick="DispatchModule.removeLocalItem('${orderId}', ${idx})" style="background: none; border: none; color: #dc2626; cursor: pointer; font-size: 14px;" title="Xóa">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div style="margin-top: 8px; text-align: right;">
                <small style="color: #6b7280;">⚠️ Mặt hàng này chỉ lưu local, không đẩy về CRM</small>
            </div>
        `;
    },

    // Add local item from button
    async addLocalItem(orderId, itemName) {
        // Get current order
        const order = this.orders.find(o => (o.id || o.order_id) === orderId);
        if (!order) {
            alert('Không tìm thấy đơn hàng!');
            return;
        }

        // Prompt for quantity
        const qty = prompt(`Nhập số lượng ${itemName}:`, '1');
        if (qty === null || qty.trim() === '') return;

        const quantity = parseInt(qty);
        if (isNaN(quantity) || quantity <= 0) {
            alert('Số lượng không hợp lệ!');
            return;
        }

        // Initialize local_items if needed
        if (!order.local_items) order.local_items = [];

        // Check if item already exists
        const existing = order.local_items.find(i => i.name === itemName);
        if (existing) {
            existing.qty += quantity;
        } else {
            order.local_items.push({ name: itemName, qty: quantity });
        }

        // Save to database
        await this.saveLocalItems(orderId, order.local_items);

        // Update UI
        const tableContainer = document.getElementById(`local-items-table-${orderId}`);
        if (tableContainer) {
            tableContainer.innerHTML = this.renderLocalItemsTable(order.local_items, orderId);
        }
    },

    // Add local item manually from textbox
    async addLocalItemManual(orderId) {
        const nameInput = document.getElementById(`local-item-name-${orderId}`);
        const qtyInput = document.getElementById(`local-item-qty-${orderId}`);

        const itemName = nameInput.value.trim();
        const quantity = parseInt(qtyInput.value) || 1;

        if (!itemName) {
            alert('Vui lòng nhập tên mặt hàng!');
            return;
        }

        // Get current order
        const order = this.orders.find(o => (o.id || o.order_id) === orderId);
        if (!order) {
            alert('Không tìm thấy đơn hàng!');
            return;
        }

        // Initialize local_items if needed
        if (!order.local_items) order.local_items = [];

        // Check if item already exists
        const existing = order.local_items.find(i => i.name === itemName);
        if (existing) {
            existing.qty += quantity;
        } else {
            order.local_items.push({ name: itemName, qty: quantity });
        }

        // Save to database
        await this.saveLocalItems(orderId, order.local_items);

        // Update UI
        const tableContainer = document.getElementById(`local-items-table-${orderId}`);
        if (tableContainer) {
            tableContainer.innerHTML = this.renderLocalItemsTable(order.local_items, orderId);
        }

        // Clear input
        nameInput.value = '';
        qtyInput.value = '1';
    },

    // Remove local item
    async removeLocalItem(orderId, index) {
        if (!confirm('Xóa mặt hàng này?')) return;

        const order = this.orders.find(o => (o.id || o.order_id) === orderId);
        if (!order || !order.local_items) return;

        order.local_items.splice(index, 1);

        // Save to database
        await this.saveLocalItems(orderId, order.local_items);

        // Update UI
        const tableContainer = document.getElementById(`local-items-table-${orderId}`);
        if (tableContainer) {
            tableContainer.innerHTML = this.renderLocalItemsTable(order.local_items, orderId);
        }
    },

    // Save local items to database (NO MISA SYNC)
    async saveLocalItems(orderId, localItems) {
        try {
            const response = await fetch(`/api/orders/${orderId}/local-items`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ local_items: localItems })
            });

            const data = await response.json();
            if (data.error) {
                console.error('Error saving local items:', data.msg);
                alert('Lỗi lưu mặt hàng phụ: ' + data.msg);
            } else {
                console.log('📦 Local items saved successfully');
            }
        } catch (error) {
            console.error('Error saving local items:', error);
            alert('Có lỗi xảy ra khi lưu mặt hàng phụ!');
        }
    }
};


// Đăng ký module
AppRouter.registerModule('dispatch', DispatchModule);
