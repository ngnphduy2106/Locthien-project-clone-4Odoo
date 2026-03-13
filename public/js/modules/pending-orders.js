// ===============================================
// MODULE: ĐƠN ĐANG GIAO (Pending Orders)
// Displays pending and in-progress orders (both export & import)
// ===============================================

const PendingOrdersModule = {
    orders: [],
    filteredOrders: [],
    currentPage: 1,
    itemsPerPage: 15,
    dateRange: null,

    // Initialize module
    init() {
        console.log('🚚 Pending Orders Module initialized');
        this.initDateRange();
        this.loadOrders();
    },

    initDateRange() {
        const dateInput = document.getElementById('pending-orders-date-filter');
        if (dateInput && typeof flatpickr !== 'undefined') {
            flatpickr(dateInput, {
                mode: 'range',
                dateFormat: 'd/m/Y',
                locale: 'vn',
                onChange: (selectedDates) => {
                    if (selectedDates.length === 2) {
                        this.dateRange = {
                            start: selectedDates[0],
                            end: new Date(selectedDates[1].setHours(23, 59, 59, 999))
                        };
                        this.handleSearch();
                    }
                }
            });
        }
    },

    clearDateFilter() {
        const dateInput = document.getElementById('pending-orders-date-filter');
        if (dateInput && typeof flatpickr !== 'undefined' && dateInput._flatpickr) {
            dateInput._flatpickr.clear();
        }
        this.dateRange = null;
        this.handleSearch();
    },

    handleSearch() {
        this.currentPage = 1;
        this.filterOrders();
    },

    // Load pending and assigned orders (export + import)
    async loadOrders() {
        const containerExport = document.getElementById('pending-orders-export-body');
        const containerImport = document.getElementById('pending-orders-import-body');
        if (!containerExport || !containerImport) return;

        const loadingHtml = `
            <tr>
                <td colspan="5" style="text-align:center; padding:40px; color:#8c8c8c;">
                    <i class="bi bi-arrow-repeat spin" style="font-size:24px;"></i>
                    <p>Đang tải dữ liệu...</p>
                </td>
            </tr>
        `;
        containerExport.innerHTML = loadingHtml;
        containerImport.innerHTML = loadingHtml;

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
                    taiXe: imp.assigned_driver || imp.driver_name || '-',
                    bienSo: imp.assigned_plate || imp.plate || '-',
                    products: imp.products || [],
                    _status: imp.assigned_driver ? 'Đang giao' : 'Chưa giao',
                    _type: 'import'
                }));
                allOrders = [...allOrders, ...imports];
            }

            this.orders = allOrders;

            // Sort by assigned driver/plate first, then date (newest first)
            this.orders.sort((a, b) => {
                const getDriver = o => o.taiXe || o.custom_field13 || o.driver || '';
                const getPlate = o => o.bienSo || o.custom_field14 || o.plate || '';

                const isAssignedA = (getDriver(a) && getDriver(a) !== '-') && (getPlate(a) && getPlate(a) !== '-');
                const isAssignedB = (getDriver(b) && getDriver(b) !== '-') && (getPlate(b) && getPlate(b) !== '-');

                if (isAssignedA && !isAssignedB) return -1;
                if (!isAssignedA && isAssignedB) return 1;

                const dateA = new Date(a.ngay || a.sale_order_date || a.created_date || 0);
                const dateB = new Date(b.ngay || b.sale_order_date || b.created_date || 0);
                return dateB - dateA;
            });

            this.filteredOrders = [...this.orders];
            this.renderOrders();

            console.log(`📦 Loaded ${allOrders.length} orders (export + import)`);

        } catch (error) {
            console.error('Error loading pending orders:', error);
            const errorHtml = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--danger);">Lỗi tải dữ liệu</td></tr>`;
            if (containerExport) containerExport.innerHTML = errorHtml;
            if (containerImport) containerImport.innerHTML = errorHtml;
        }
    },

    // Render orders table
    renderOrders() {
        const containerExport = document.getElementById('pending-orders-export-body');
        const containerImport = document.getElementById('pending-orders-import-body');
        if (!containerExport || !containerImport) return;

        const renderTable = (orders, isImportType) => {
            if (orders.length === 0) {
                return `
                    <tr>
                        <td colspan="${isImportType ? 5 : 5}" style="text-align:center; padding:40px; color:#8c8c8c;">
                            <i class="bi bi-inbox" style="font-size:32px; display:block; margin-bottom:12px;"></i>
                            Không có đơn hàng nào
                        </td>
                    </tr>
                `;
            }

            return orders.map(order => {
                const orderId = order.soDon || order.sale_order_no || 'N/A';
                const customer = order.khach || order.account_name || 'N/A';
                const driver = order.taiXe || order.custom_field13 || order.driver || '-';
                const plate = order.bienSo || order.custom_field14 || order.plate || '-';

                const clickHandler = isImportType
                    ? `viewImportDetail && viewImportDetail('${order.id}')`
                    : `viewOrderDetail && viewOrderDetail('${order.id}')`;

                if (isImportType) {
                    // Import: Mã đơn | Nhà Cung Cấp | Sản phẩm | Tài Xế | Biển Số
                    const productList = (order.products || []).map(p =>
                        `${p.name || p.code || 'SP'}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`
                    ).join(', ');

                    return `
                        <tr onclick="${clickHandler}" style="cursor:pointer;" class="history-row">
                            <td><strong style="color:#16a34a;">${orderId}</strong></td>
                            <td>${customer}</td>
                            <td style="font-size:12px; max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${productList || '—'}</td>
                            <td>${driver !== '-' ? `<span style="color:var(--info);">${driver}</span>` : '<span style="opacity:0.5;">—</span>'}</td>
                            <td>${plate !== '-' ? `<span style="font-family:monospace; font-weight:600;">${plate}</span>` : '<span style="opacity:0.5;">—</span>'}</td>
                        </tr>
                    `;
                } else {
                    // Export: Mã đơn | Khách hàng | Sản phẩm | Tài Xế | Biển Số
                    const productList = (order.products || []).map(p =>
                        `${p.name || p.code || 'SP'}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`
                    ).join(', ');
                    return `
                        <tr onclick="${clickHandler}" style="cursor:pointer;" class="history-row">
                            <td><strong style="color:var(--primary);">${orderId}</strong></td>
                            <td>${customer}</td>
                            <td style="font-size:12px; max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${productList || '—'}</td>
                            <td>${driver !== '-' ? `<span style="color:var(--info);">${driver}</span>` : '<span style="opacity:0.5;">—</span>'}</td>
                            <td>${plate !== '-' ? `<span style="font-family:monospace; font-weight:600;">${plate}</span>` : '<span style="opacity:0.5;">—</span>'}</td>
                        </tr>
                    `;
                }
            }).join('');
        };

        const exportOrdersAll = this.filteredOrders.filter(o => o._type === 'export');
        const importOrdersAll = this.filteredOrders.filter(o => o._type === 'import');

        const totalItems = this.filteredOrders.length;
        const maxItems = Math.max(exportOrdersAll.length, importOrdersAll.length);
        const totalPages = Math.ceil(maxItems / this.itemsPerPage) || 1;

        if (this.currentPage > totalPages) this.currentPage = totalPages;

        const startIdx = (this.currentPage - 1) * this.itemsPerPage;
        const endIdx = startIdx + this.itemsPerPage;

        const exportOrders = exportOrdersAll.slice(startIdx, endIdx);
        const importOrders = importOrdersAll.slice(startIdx, endIdx);

        containerExport.innerHTML = renderTable(exportOrders, false);
        containerImport.innerHTML = renderTable(importOrders, true);

        this.updatePaginationInfo(totalItems, totalPages);
        console.log('✅ Rendered pending orders split by export/import (page ' + this.currentPage + ')');
    },

    updatePaginationInfo(totalItems, totalPages) {
        const infoSpan = document.getElementById('pending-orders-page-info');
        if (infoSpan) {
            infoSpan.textContent = `Trang ${this.currentPage} / ${totalPages} (${totalItems} đơn)`;
        }

        const paginationDiv = document.getElementById('pending-orders-pagination');
        if (paginationDiv) {
            const buttons = paginationDiv.querySelectorAll('.pagination-btn');
            if (buttons.length >= 2) {
                buttons[0].disabled = this.currentPage === 1;
                buttons[1].disabled = this.currentPage === totalPages;
            }
        }
    },

    changePage(offset) {
        const exportOrdersAll = this.filteredOrders.filter(o => o._type === 'export');
        const importOrdersAll = this.filteredOrders.filter(o => o._type === 'import');
        const maxItems = Math.max(exportOrdersAll.length, importOrdersAll.length);
        const totalPages = Math.ceil(maxItems / this.itemsPerPage) || 1;

        let newPage = this.currentPage + offset;

        if (newPage < 1) newPage = 1;
        if (newPage > totalPages) newPage = totalPages;

        if (newPage !== this.currentPage) {
            this.currentPage = newPage;
            this.renderOrders();
        }
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

            // Date Range filter
            if (this.dateRange) {
                const orderDateObj = new Date(order.ngay || order.sale_order_date || order.created_date || 0);
                if (orderDateObj < this.dateRange.start || orderDateObj > this.dateRange.end) {
                    return false;
                }
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
