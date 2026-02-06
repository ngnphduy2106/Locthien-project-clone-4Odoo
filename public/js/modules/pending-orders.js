// ===============================================
// MODULE: ĐƠN ĐANG GIAO (Pending Orders)
// Displays pending and in-progress orders (both export & import)
// ===============================================

const PendingOrdersModule = {
    orders: [],
    filteredOrders: [],

    // Initialize module
    init() {
        console.log('🚚 Pending Orders Module initialized');
        this.loadOrders();
    },

    // Load pending and assigned orders (export + import)
    async loadOrders() {
        const container = document.getElementById('pending-orders-table-body');
        if (!container) return;

        container.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px; color:#8c8c8c;">
                    <i class="bi bi-arrow-repeat spin" style="font-size:24px;"></i>
                    <p>Đang tải...</p>
                </td>
            </tr>
        `;

        try {
            // Fetch both export orders and import tickets
            const [ordersRes, importsRes] = await Promise.all([
                fetch('/api/orders'),
                fetch('/api/imports')
            ]);

            const ordersData = await ordersRes.json();
            const importsData = await importsRes.json();

            let allOrders = [];

            // Process export orders
            if (!ordersData.error) {
                const pending = (ordersData.pending || []).map(o => ({
                    ...o,
                    _status: 'Chưa giao',
                    _type: 'export'
                }));
                const assigned = (ordersData.assigned || []).map(o => ({
                    ...o,
                    _status: 'Đang giao',
                    _type: 'export'
                }));
                allOrders = [...allOrders, ...pending, ...assigned];
            }

            // Process import tickets
            if (!importsData.error) {
                const imports = (importsData.data || []).filter(imp => {
                    // Only include pending/in-progress imports
                    const status = (imp.status || '').toLowerCase();
                    return status !== 'completed' && status !== 'hoàn thành' && status !== 'cancelled';
                }).map(imp => ({
                    id: imp.id,
                    soDon: imp.ticket_no,
                    sale_order_no: imp.ticket_no,
                    khach: imp.supplier_name || imp.supplier || 'N/A',
                    account_name: imp.supplier_name || imp.supplier || 'N/A',
                    ngay: imp.expected_date || imp.created_at,
                    sale_order_date: imp.expected_date || imp.created_at,
                    taiXe: imp.driver_name || '-',
                    bienSo: imp.plate || '-',
                    _status: imp.driver_name ? 'Đang giao' : 'Chưa giao',
                    _type: 'import'
                }));
                allOrders = [...allOrders, ...imports];
            }

            this.orders = allOrders;

            // Sort by date (newest first)
            this.orders.sort((a, b) => {
                const dateA = new Date(a.ngay || a.sale_order_date || a.created_date || 0);
                const dateB = new Date(b.ngay || b.sale_order_date || b.created_date || 0);
                return dateB - dateA;
            });

            this.filteredOrders = [...this.orders];
            this.renderOrders();

            console.log(`📦 Loaded ${allOrders.length} orders (export + import)`);

        } catch (error) {
            console.error('Error loading pending orders:', error);
            container.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--danger);">Lỗi tải dữ liệu</td></tr>`;
        }
    },

    // Render orders table
    renderOrders() {
        const container = document.getElementById('pending-orders-table-body');
        if (!container) return;

        const orders = this.filteredOrders;

        if (orders.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:40px; color:#8c8c8c;">
                        <i class="bi bi-inbox" style="font-size:32px; display:block; margin-bottom:12px;"></i>
                        Không có đơn hàng nào
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = orders.map(order => {
            const orderId = order.soDon || order.sale_order_no || 'N/A';
            const customer = order.khach || order.account_name || 'N/A';
            const date = order.ngay || order.sale_order_date || order.created_date;
            const status = order._status || 'N/A';
            const driver = order.taiXe || order.custom_field13 || order.driver || '-';
            const plate = order.bienSo || order.custom_field14 || order.plate || '-';
            const isImport = order._type === 'import';

            const statusClass = status === 'Đang giao' ? 'warning' : 'secondary';
            const typeBadge = isImport
                ? '<span style="background:#16a34a; color:white; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:4px;">Nhập</span>'
                : '<span style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:4px;">Xuất</span>';

            const clickHandler = isImport
                ? `viewImportDetail && viewImportDetail('${order.id}')`
                : `viewOrderDetail && viewOrderDetail('${order.id}')`;

            return `
                <tr onclick="${clickHandler}" style="cursor:pointer;" class="history-row">
                    <td>
                        <strong style="color:${isImport ? '#16a34a' : 'var(--primary)'};">${orderId}</strong>
                        ${typeBadge}
                    </td>
                    <td>${customer}</td>
                    <td>${date ? new Date(date).toLocaleDateString('vi-VN') : 'N/A'}</td>
                    <td>
                        <span class="badge badge-${statusClass}">${status}</span>
                    </td>
                    <td>${driver !== '-' ? `<span style="color:var(--info);">${driver}</span>` : '<span style="opacity:0.5;">—</span>'}</td>
                    <td>${plate !== '-' ? `<span style="font-family:monospace;">${plate}</span>` : '<span style="opacity:0.5;">—</span>'}</td>
                </tr>
            `;
        }).join('');

        console.log('✅ Rendered', orders.length, 'pending orders (export + import)');
    },

    // Filter orders based on search, status, and type
    filterOrders() {
        const searchInput = document.getElementById('pending-orders-search');
        const statusFilter = document.getElementById('pending-orders-status');

        const query = (searchInput?.value || '').toLowerCase().trim();
        const status = statusFilter?.value || '';

        this.filteredOrders = this.orders.filter(order => {
            // Status filter
            if (status) {
                if (status === 'pending' && order._status !== 'Chưa giao') return false;
                if (status === 'assigned' && order._status !== 'Đang giao') return false;
                if (status === 'import' && order._type !== 'import') return false;
                if (status === 'export' && order._type !== 'export') return false;
            }

            // Search filter
            if (query) {
                const searchFields = [
                    order.soDon,
                    order.sale_order_no,
                    order.khach,
                    order.account_name,
                    order.taiXe,
                    order.custom_field13,
                    order.bienSo,
                    order.custom_field14
                ].map(f => String(f || '').toLowerCase());

                return searchFields.some(field => field.includes(query));
            }

            return true;
        });

        this.renderOrders();
    }
};

// Register module with router if available
if (typeof AppRouter !== 'undefined') {
    AppRouter.registerModule('pending-orders', PendingOrdersModule);
}

// Expose to global scope
window.PendingOrdersModule = PendingOrdersModule;
