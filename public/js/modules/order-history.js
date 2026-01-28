// ===============================================
// MODULE: LỊCH SỬ ĐƠN HÀNG (Order History)
// ===============================================

const OrderHistoryModule = {
    history: [],
    currentPage: 1,
    itemsPerPage: 20,
    totalPages: 1,

    // Khởi tạo module
    init() {
        console.log('Order History Module initialized');
        this.loadHistory();
    },

    // Load lịch sử
    async loadHistory(page = 1) {
        try {
            const response = await fetch(`/api/orders/history?page=${page}&limit=${this.itemsPerPage}`);
            const data = await response.json();

            if (data.error) {
                console.error('Error from API:', data.msg);
                this.loadMockHistory();
                return;
            }

            this.history = data.orders || data.history || [];
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

    // Render lịch sử
    renderHistory() {
        const container = document.getElementById('history-table-body');
        if (!container) return;

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

        container.innerHTML = this.history.map(order => `
            <tr onclick="OrderHistoryModule.viewDetail('${order.id || order.order_id}')">
                <td>${order.id || order.order_id || 'N/A'}</td>
                <td>${order.customer || order.customer_name || 'N/A'}</td>
                <td>${order.date || order.order_date ? new Date(order.date || order.order_date).toLocaleDateString('vi-VN') : 'N/A'}</td>
                <td>${(order.total || order.total_amount || 0).toLocaleString('vi-VN')} VNĐ</td>
                <td>
                    <span class="status-badge ${this.getStatusClass(order.status)}">
                        ${this.getStatusText(order.status)}
                    </span>
                </td>
                <td>${order.driver || order.driver_name || '-'}</td>
                <td>${order.completedDate || order.completed_at ? new Date(order.completedDate || order.completed_at).toLocaleString('vi-VN') : '-'}</td>
            </tr>
        `).join('');

        this.renderPagination();
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
            <button class="btn-page" ${this.currentPage === 1 ? 'disabled' : ''} 
                    onclick="OrderHistoryModule.goToPage(${this.currentPage - 1})">
                <i class="bi bi-chevron-left"></i>
            </button>
            <span class="page-info">Trang ${this.currentPage} / ${this.totalPages}</span>
            <button class="btn-page" ${this.currentPage === this.totalPages ? 'disabled' : ''} 
                    onclick="OrderHistoryModule.goToPage(${this.currentPage + 1})">
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
        const order = this.history.find(o => (o.id || o.order_id) === orderId);
        if (!order) return;

        // TODO: Show detail modal
        console.log('View order history:', order);
        let details = `Chi tiết đơn hàng ${orderId}\n\n`;
        details += `Khách hàng: ${order.customer || order.customer_name}\n`;
        details += `Ngày đặt: ${order.date || order.order_date}\n`;
        details += `Tổng tiền: ${(order.total || order.total_amount || 0).toLocaleString('vi-VN')} VNĐ\n`;
        details += `Trạng thái: ${order.status}\n`;
        if (order.driver || order.driver_name) details += `Tài xế: ${order.driver || order.driver_name}\n`;
        if (order.completedDate || order.completed_at) details += `Hoàn thành: ${order.completedDate || order.completed_at}\n`;
        if (order.cancelReason || order.cancel_reason) details += `Lý do hủy: ${order.cancelReason || order.cancel_reason}\n`;

        alert(details);
    },

    // Search history
    searchHistory(query) {
        // TODO: Implement search with API
        console.log('Search history:', query);
    },

    // Export to Excel
    exportToExcel() {
        // TODO: Implement Excel export
        alert('Xuất dữ liệu ra Excel');
    }
};

// Đăng ký module
AppRouter.registerModule('order-history', OrderHistoryModule);
