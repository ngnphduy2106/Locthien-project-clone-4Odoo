// ===============================================
// MODULE: QUẢN LÝ KHO HÀNG (Warehouse Management)
// ===============================================

const WarehouseModule = {
    inventory: [],
    alerts: [],
    currentWarehouse: 'all',

    // Khởi tạo module
    init() {
        console.log('Warehouse Module initialized');
        this.loadWarehouse();
    },

    // Load kho hàng
    async loadWarehouse() {
        try {
            // Load inventory and alerts in parallel
            const [inventoryRes, alertsRes] = await Promise.all([
                fetch(`/api/warehouse/inventory${this.currentWarehouse !== 'all' ? '?warehouseId=' + this.currentWarehouse : ''}`),
                fetch('/api/warehouse/alerts')
            ]);

            const inventoryData = await inventoryRes.json();
            const alertsData = await alertsRes.json();

            if (inventoryData.error) {
                console.error('Error loading inventory:', inventoryData.msg);
                this.loadMockData();
                return;
            }

            this.inventory = inventoryData.data || [];
            this.alerts = alertsData.data || [];

            this.renderWarehouse();

        } catch (error) {
            console.error('Error loading warehouse:', error);
            this.loadMockData();
        }
    },

    // Load mock data
    loadMockData() {
        this.inventory = [
            {
                id: '1',
                name: 'HCl 32%',
                code: 'HCL32',
                qty: 5000,
                warehouse: 'LT1',
                status: 'OK',
                unit: 'Kg'
            },
            {
                id: '2',
                name: 'NaOH 50%',
                code: 'NAOH50',
                qty: 80,
                warehouse: 'LT1',
                status: 'LOW',
                unit: 'Kg'
            },
            {
                id: '3',
                name: 'H2SO4 98%',
                code: 'H2SO4',
                qty: 3000,
                warehouse: 'LT2',
                status: 'OK',
                unit: 'Kg'
            },
            {
                id: '4',
                name: 'Javel 10%',
                code: 'JAVEL10',
                qty: 50,
                warehouse: 'LT2',
                status: 'LOW',
                unit: 'Kg'
            }
        ];

        this.alerts = this.inventory.filter(item => item.qty < 100);
        this.renderWarehouse();
    },

    // Render warehouse
    renderWarehouse() {
        const container = document.getElementById('inventory-list');
        const alertsContainer = document.getElementById('warehouse-alerts');

        if (!container) return;

        // Render alerts
        if (alertsContainer) {
            if (this.alerts.length > 0) {
                alertsContainer.innerHTML = `
                    <div class="alert alert-warning">
                        <strong><i class="bi bi-exclamation-triangle me-2"></i>Cảnh báo tồn kho thấp</strong>
                        <ul class="mb-0 mt-2">
                            ${this.alerts.slice(0, 5).map(item => `
                                <li>${item.name}: <strong>${item.qty} ${item.unit || 'Kg'}</strong></li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            } else {
                alertsContainer.innerHTML = '';
            }
        }

        // Filter by warehouse
        let filteredInventory = this.inventory;
        if (this.currentWarehouse !== 'all') {
            filteredInventory = this.inventory.filter(item =>
                item.warehouse === this.currentWarehouse
            );
        }

        // Render inventory
        if (filteredInventory.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-box-seam"></i>
                    <p>Không có dữ liệu tồn kho</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filteredInventory.map(item => {
            let statusClass = '';
            let qtyClass = 'text-success';

            if (item.qty <= 0) {
                statusClass = 'border-danger';
                qtyClass = 'text-danger';
            } else if (item.qty < 100) {
                statusClass = 'border-warning';
                qtyClass = 'text-warning';
            }

            return `
                <div class="inventory-item ${statusClass}">
                    <div>
                        <h6 class="fw-bold mb-1">${item.name || item.product_name}</h6>
                        <div class="small text-muted">
                            ${item.code || item.product_code || ''} 
                            ${item.warehouse ? '• ' + item.warehouse : ''}
                        </div>
                    </div>
                    <div class="text-end">
                        <div class="fs-4 fw-bold ${qtyClass}">${(item.qty || 0).toLocaleString('vi-VN')}</div>
                        <div class="small text-muted">${item.unit || 'Kg'}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Switch warehouse
    switchWarehouse(warehouseId) {
        this.currentWarehouse = warehouseId;

        // Update active tab
        const tabs = document.querySelectorAll('[data-warehouse]');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-warehouse') === warehouseId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        this.loadWarehouse();
    }
};

// Đăng ký module
AppRouter.registerModule('warehouse', WarehouseModule);
