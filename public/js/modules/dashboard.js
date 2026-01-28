// ===============================================
// MODULE: TỔNG QUAN (Dashboard Overview)
// ===============================================

const DashboardModule = {
    chart: null,

    // Khởi tạo module
    init() {
        console.log('Dashboard Module initialized');
        this.loadStats();
        this.loadChartData();
        this.loadRecentTransactions();
    },

    // Load thống kê
    async loadStats() {
        try {
            // Gọi API để lấy dữ liệu thống kê thực
            const response = await fetch('/api/reports/dashboard-stats');
            const data = await response.json();

            if (data.error) {
                console.error('Error from API:', data.msg);
                this.loadMockStats();
                return;
            }

            const stats = {
                totalProducts: data.data.totalProducts || 0,
                totalValue: data.data.totalValue ? `${(data.data.totalValue / 1000000000).toFixed(2)} Tỷ VNĐ` : '0 VNĐ',
                lowStock: data.data.lowStock || 0,
                expired: data.data.expired || 0
            };

            this.updateStatsUI(stats);
        } catch (error) {
            console.error('Error loading stats:', error);
            this.loadMockStats();
        }
    },

    // Load mock stats (fallback)
    loadMockStats() {
        const stats = {
            totalProducts: 1250,
            totalValue: '5.75 Tỷ VNĐ',
            lowStock: 15,
            expired: 2
        };
        this.updateStatsUI(stats);
    },

    // Cập nhật UI thống kê
    updateStatsUI(stats) {
        const totalProductsEl = document.getElementById('stat-total-products');
        const totalValueEl = document.getElementById('stat-total-value');
        const lowStockEl = document.getElementById('stat-low-stock');
        const expiredEl = document.getElementById('stat-expired');

        if (totalProductsEl) totalProductsEl.textContent = stats.totalProducts.toLocaleString();
        if (totalValueEl) totalValueEl.textContent = stats.totalValue;
        if (lowStockEl) lowStockEl.textContent = stats.lowStock;
        if (expiredEl) expiredEl.textContent = stats.expired;
    },

    // Load dữ liệu biểu đồ từ orders
    async loadChartData() {
        try {
            const response = await fetch('/api/orders');
            const data = await response.json();

            if (data.error) {
                console.error('Error loading orders:', data.msg);
                this.initChart(); // Use mock data
                return;
            }

            const orders = data.data || [];

            // Tính tổng giá trị đơn hàng theo tháng (7 tháng gần nhất)
            const monthlyData = this.calculateMonthlyOrderValue(orders);
            this.initChart(monthlyData);

        } catch (error) {
            console.error('Error loading chart data:', error);
            this.initChart(); // Use mock data
        }
    },

    // Tính tổng giá trị đơn hàng theo tháng
    calculateMonthlyOrderValue(orders) {
        const now = new Date();
        const monthlyTotals = {};

        // Initialize last 7 months
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyTotals[key] = 0;
        }

        // Sum order values by month
        orders.forEach(order => {
            const orderDate = new Date(order.ngay || order.sale_order_date);
            if (!isNaN(orderDate.getTime())) {
                const key = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
                if (monthlyTotals.hasOwnProperty(key)) {
                    monthlyTotals[key] += Number(order.amount || order.sale_order_amount || 0);
                }
            }
        });

        return Object.values(monthlyTotals);
    },

    // Khởi tạo biểu đồ
    initChart(dataValues = null) {
        const ctx = document.getElementById('inventoryChart');
        if (!ctx) return;

        // Destroy existing chart if any
        if (this.chart) {
            this.chart.destroy();
        }

        // Use provided data or mock data
        const chartData = dataValues || [186000000, 275000000, 230000000, 210000000, 248000000, 265000000, 310000000];

        this.chart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7'],
                datasets: [{
                    label: 'Giá Trị Đơn Hàng',
                    data: chartData,
                    borderColor: '#1890ff',
                    backgroundColor: 'rgba(24, 144, 255, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#1890ff',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 14 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: function (context) {
                                return 'Giá trị: ' + context.parsed.y.toLocaleString('vi-VN') + ' VNĐ';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function (value) {
                                return (value / 1000000).toFixed(0) + 'M';
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    },

    // Load lịch sử giao dịch
    async loadRecentTransactions() {
        try {
            // Gọi API để lấy giao dịch gần đây
            const response = await fetch('/api/warehouse/transactions?limit=5');
            const data = await response.json();

            if (data.error) {
                console.error('Error from API:', data.msg);
                this.loadMockTransactions();
                return;
            }

            this.renderTransactions(data.data.transactions || []);
        } catch (error) {
            console.error('Error loading transactions:', error);
            this.loadMockTransactions();
        }
    },

    // Load mock transactions (fallback)
    loadMockTransactions() {
        const transactions = [
            { id: 'TX001', type: 'Nhập', product: 'Bàn Làm Việc Ergonomic', quantity: 5, date: '2024-07-28' },
            { id: 'TX002', type: 'Xuất', product: 'Ghế Công Thái Học', quantity: 2, date: '2024-07-27' },
            { id: 'TX003', type: 'Nhập', product: 'Màn Hình Cong 34 inch', quantity: 3, date: '2024-07-27' },
            { id: 'TX004', type: 'Xuất', product: 'Bàn Phím Cơ RGB', quantity: 10, date: '2024-07-26' },
            { id: 'TX005', type: 'Nhập', product: 'Chuột Gaming Không Dây', quantity: 8, date: '2024-07-26' }
        ];
        this.renderTransactions(transactions);
    },

    // Render bảng giao dịch
    renderTransactions(transactions) {
        const tbody = document.querySelector('#recentTransactionsTable tbody');
        if (!tbody) return;

        if (transactions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 40px; color: #8c8c8c;">
                        <i class="bi bi-inbox" style="font-size: 48px; display: block; margin-bottom: 12px;"></i>
                        Chưa có giao dịch nào
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = transactions.map(tx => `
            <tr>
                <td>${tx.id || tx.transaction_id || '-'}</td>
                <td><span class="status-badge ${tx.type === 'Nhập' || tx.type === 'IN' ? 'success' : 'danger'}">${tx.type === 'IN' ? 'Nhập' : tx.type === 'OUT' ? 'Xuất' : tx.type}</span></td>
                <td>${tx.product || tx.product_name || '-'}</td>
                <td>${tx.quantity || 0}</td>
                <td>${tx.date || tx.created_at ? new Date(tx.date || tx.created_at).toLocaleDateString('vi-VN') : '-'}</td>
            </tr>
        `).join('');
    }
};

// Đăng ký module
AppRouter.registerModule('dashboard', DashboardModule);

