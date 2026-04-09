// ===============================================
// MODULE: TẠO ĐƠN NHẬP (Create Order)
// ===============================================

const CreateOrderModule = {
    orderProducts: [],
    suppliers: [],
    customers: [], // Customers from DB
    materials: [], // MISA products with code + name

    // Khởi tạo module
    init() {
        console.log('Create Order Module initialized');
        this.loadSuppliers();
        this.loadCustomers(); // Load customers
        this.loadMaterials(); // Load MISA products
        this.resetForm();
        this.renderForm();
    },

    // Load suppliers from API
    async loadSuppliers() {
        try {
            const response = await fetch('/api/suppliers');
            const data = await response.json();
            if (!data.error && data.data) {
                this.suppliers = data.data;
                this.updateSupplierDatalist();
                console.log(`📦 Loaded ${this.suppliers.length} suppliers`);
            }
        } catch (e) {
            console.error('Failed to load suppliers:', e);
        }
    },

    // Load materials (products from MISA)
    async loadMaterials() {
        try {
            const response = await fetch('/api/materials');
            const data = await response.json();
            if (!data.error && data.data) {
                this.materials = data.data;
                this.updateMaterialsDatalist();
                console.log(`🧪 Loaded ${this.materials.length} materials from MISA`);
            }
        } catch (e) {
            console.error('Failed to load materials:', e);
        }
    },

    // Sync products from MISA CRM
    async syncMisaProducts() {
        try {
            const btn = event?.target;
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Đang đồng bộ...';
            }

            const response = await fetch('/api/materials/sync-misa', { method: 'POST' });
            const data = await response.json();

            if (data.error) {
                alert('❌ Lỗi: ' + data.msg);
            } else {
                alert(`✅ ${data.msg}`);
                await this.loadMaterials(); // Reload materials list
            }
        } catch (e) {
            alert('❌ Lỗi đồng bộ: ' + e.message);
        } finally {
            const btn = document.getElementById('btn-sync-misa');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Sync MISA';
            }
        }
    },

    // Update materials datalist (codes and names)
    updateMaterialsDatalist() {
        const codeList = document.getElementById('material-code-list');
        const nameList = document.getElementById('material-name-list');

        if (codeList) {
            codeList.innerHTML = this.materials.map(m =>
                `<option value="${m.code}">${m.name}</option>`
            ).join('');
        }
        if (nameList) {
            nameList.innerHTML = this.materials.map(m =>
                `<option value="${m.name}">${m.code}</option>`
            ).join('');
        }
    },

    // Autofill: when code selected, fill name
    onProductCodeChange(codeInput) {
        const code = codeInput.value.trim();
        const material = this.materials.find(m => m.code === code);
        if (material) {
            const nameInput = document.getElementById('prod-name');
            if (nameInput) nameInput.value = material.name;
        }
    },

    // Autofill: when name selected, fill code
    onProductNameChange(nameInput) {
        const name = nameInput.value.trim();
        const material = this.materials.find(m => m.name === name);
        if (material) {
            const codeInput = document.getElementById('prod-code');
            if (codeInput) codeInput.value = material.code;
        }
    },

    // Bind event listeners after render
    bindEvents() {
        const self = this;

        // Sync MISA button
        const btnSync = document.getElementById('btn-sync-misa');
        if (btnSync) {
            btnSync.addEventListener('click', () => self.syncMisaProducts());
        }

        // Add product button
        const btnAdd = document.getElementById('btn-add-product');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => self.addProduct());
        }

        // Submit order button
        const btnSubmit = document.getElementById('btn-submit-order');
        if (btnSubmit) {
            btnSubmit.addEventListener('click', () => self.submitOrder());
        }

        console.log('✅ Create Order event listeners bound');
    },

    // Update supplier/customer datalist (combined)
    updateSupplierDatalist() {
        const datalist = document.getElementById('supplier-list');
        if (!datalist) return;

        // Combine suppliers and customers, remove duplicates by name
        const allNames = new Set();

        // Add suppliers first
        this.suppliers.forEach(s => allNames.add(s.name));

        // Add customers
        this.customers.forEach(c => allNames.add(c.name));

        datalist.innerHTML = Array.from(allNames)
            .sort((a, b) => a.localeCompare(b, 'vi'))
            .map(name => `<option value="${name}">${name}</option>`)
            .join('');

        console.log(`📋 Updated datalist: ${allNames.size} suppliers/customers`);
    },

    // Load customers from API
    async loadCustomers() {
        try {
            const response = await fetch('/api/customers');
            const data = await response.json();
            if (!data.error && data.data) {
                this.customers = data.data;
                this.updateSupplierDatalist();
                console.log(`👥 Loaded ${this.customers.length} customers`);
            }
        } catch (e) {
            console.error('Failed to load customers:', e);
        }
    },

    // Reset form
    resetForm() {
        this.orderProducts = [];
        const today = new Date().toISOString().split('T')[0];

        // Set default values
        setTimeout(() => {
            const dateInput = document.getElementById('order-date');
            const customerInput = document.getElementById('order-customer');
            const addressInput = document.getElementById('order-address');

            if (dateInput) dateInput.value = today;
            if (customerInput) customerInput.value = '';
            if (addressInput) addressInput.value = '';

            this.renderProductList();
        }, 100);
    },

    // Render form
    renderForm() {
        const container = document.getElementById('create-order-form');
        if (!container) return;

        container.innerHTML = `
            <style>
                .create-order-card {
                    background: #ffffff;
                    border-radius: 16px;
                    padding: 28px;
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
                    transition: all 0.3s ease;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                }
                
                .create-order-card:hover {
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
                    transform: translateY(-2px);
                }
                
                .section-header {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    font-size: 18px;
                    font-weight: 700;
                    color: #1a1a1a;
                    margin-bottom: 24px;
                    padding-bottom: 16px;
                    border-bottom: 2px solid #f0f0f0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .section-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                
                .section-icon.success {
                    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                }
                
                .form-group-modern {
                    margin-bottom: 24px;
                }
                
                .form-label-modern {
                    font-family: 'Inter', sans-serif;
                    font-size: 14px;
                    font-weight: 600;
                    color: #374151;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .label-icon {
                    width: 20px;
                    height: 20px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                
                .form-input-modern {
                    font-family: 'Inter', sans-serif;
                    font-size: 15px;
                    padding: 13px 16px;
                    border: 2px solid #e5e7eb;
                    border-radius: 10px;
                    transition: all 0.2s ease;
                    background: #fafafa;
                }
                
                .form-input-modern:focus {
                    border-color: #667eea;
                    background: #ffffff;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
                    outline: none;
                }
                
                .info-box {
                    background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
                    border: 1px solid #667eea30;
                    border-radius: 12px;
                    padding: 16px;
                    font-family: 'Inter', sans-serif;
                    font-size: 13px;
                    color: #4b5563;
                    display: flex;
                    align-items: start;
                    gap: 12px;
                }
                
                .info-icon {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    font-size: 14px;
                }
                
                .btn-add-product {
                    font-family: 'Inter', sans-serif;
                    font-size: 15px;
                    font-weight: 600;
                    padding: 13px 20px;
                    border: none;
                    border-radius: 10px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                }
                
                .btn-add-product:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
                }
                
                .btn-submit-order {
                    font-family: 'Inter', sans-serif;
                    font-size: 16px;
                    font-weight: 700;
                    padding: 16px 24px;
                    border: none;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                    color: white;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 6px 20px rgba(17, 153, 142, 0.3);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .btn-submit-order:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 8px 28px rgba(17, 153, 142, 0.4);
                }
            </style>
            
            <div class="row g-4">
                <!-- Left Column: Order Information -->
                <div class="col-lg-5">
                    <div class="create-order-card">
                        <div class="section-header">
                            <div class="section-icon">
                                <i class="bi bi-file-earmark-text"></i>
                            </div>
                            <span>Thông tin đơn hàng</span>
                        </div>

                        <div class="form-group-modern">
                            <label class="form-label-modern">
                                <div class="label-icon">
                                    <i class="bi bi-calendar3"></i>
                                </div>
                                Ngày
                            </label>
                            <input type="date" id="order-date" class="form-control form-input-modern">
                        </div>

                        <div class="form-group-modern">
                            <label class="form-label-modern">
                                <div class="label-icon">
                                    <i class="bi bi-building"></i>
                                </div>
                                Nhà cung cấp / Khách hàng
                            </label>
                            <input type="text" id="order-customer" class="form-control form-input-modern" 
                                placeholder="Tên nhà cung cấp hoặc khách hàng"
                                list="supplier-list"
                                autocomplete="off">
                            <datalist id="supplier-list"></datalist>
                        </div>

                        <div class="form-group-modern">
                            <label class="form-label-modern">
                                <div class="label-icon">
                                    <i class="bi bi-geo-alt"></i>
                                </div>
                                Địa chỉ giao hàng
                            </label>
                            <input type="text" id="order-address" class="form-control form-input-modern" 
                                placeholder="Địa chỉ giao hàng">
                        </div>

                        <div class="form-group-modern">
                            <label class="form-label-modern">
                                <div class="label-icon">
                                    <i class="bi bi-sticky"></i>
                                </div>
                                Ghi chú
                            </label>
                            <textarea id="order-note" class="form-control form-input-modern" rows="3"
                                placeholder="Ghi chú cho đơn hàng (tùy chọn)" style="resize:vertical;"></textarea>
                        </div>

                        <div class="info-box">
                            <div class="info-icon">
                                <i class="bi bi-lightbulb"></i>
                            </div>
                            <div>
                                <strong style="color: #1f2937;">Hướng dẫn:</strong> Nhập thông tin đơn hàng và thêm các sản phẩm cần nhập kho.
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Right Column: Products -->
                <div class="col-lg-7">
                    <div class="create-order-card">
                        <div class="section-header" style="justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="section-icon success">
                                    <i class="bi bi-box-seam"></i>
                                </div>
                                <span>Sản phẩm</span>
                            </div>
                            <button type="button" id="btn-sync-misa" class="btn btn-sm btn-outline-primary" style="font-size: 12px;">
                                <i class="bi bi-arrow-repeat me-1"></i>Sync MISA
                            </button>
                        </div>

                        <!-- Product List -->
                        <div id="order-products-list" class="mb-4" style="max-height: 350px; overflow-y: auto;"></div>

                        <!-- Add Product Form -->
                        <div style="padding-top: 20px; border-top: 2px solid #f0f0f0;">
                            <div class="row g-3">
                                <div class="col-md-5">
                                    <input type="text" id="prod-name" class="form-control form-input-modern" 
                                        placeholder="Tên sản phẩm">
                                </div>
                                <div class="col-md-3">
                                    <input type="number" id="prod-qty" class="form-control form-input-modern" 
                                        placeholder="Số lượng" step="0.01">
                                </div>
                                <div class="col-md-4">
                                    <button id="btn-add-product" class="btn-add-product w-100">
                                        <i class="bi bi-plus-circle me-2"></i>Thêm
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Submit Button -->
            <div class="row mt-4">
                <div class="col-12">
                    <button id="btn-submit-order" class="btn-submit-order w-100">
                        <i class="bi bi-check-circle me-2"></i>Tạo Đơn Nhập
                    </button>
                </div>
            </div>
        `;

        // Bind event listeners after DOM is rendered
        this.bindEvents();
        this.resetForm();
    },

    // Thêm sản phẩm
    addProduct() {
        const codeInput = document.getElementById('prod-code');
        const nameInput = document.getElementById('prod-name');
        const qtyInput = document.getElementById('prod-qty');

        const code = codeInput?.value?.trim() || '';
        const name = nameInput.value.trim();
        const qty = parseFloat(qtyInput.value);

        if (!name || !qty || qty <= 0) {
            alert('Vui lòng nhập đầy đủ tên sản phẩm và số lượng hợp lệ!');
            return;
        }

        this.orderProducts.push({
            code: code,
            name: name,
            qty: qty,
            unit: 'Kg'
        });

        // Clear inputs
        if (codeInput) codeInput.value = '';
        nameInput.value = '';
        qtyInput.value = '';
        if (codeInput) codeInput.focus();
        else nameInput.focus();

        this.renderProductList();
    },

    // Xóa sản phẩm
    removeProduct(index) {
        this.orderProducts.splice(index, 1);
        this.renderProductList();
    },

    // Render danh sách sản phẩm
    renderProductList() {
        const container = document.getElementById('order-products-list');
        if (!container) return;

        if (this.orderProducts.length === 0) {
            container.innerHTML = `
                <div style="
                    text-align: center; 
                    padding: 60px 20px; 
                    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                    border-radius: 16px;
                    border: 2px dashed #cbd5e1;
                ">
                    <div style="
                        width: 80px;
                        height: 80px;
                        margin: 0 auto 20px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        opacity: 0.2;
                    ">
                        <i class="bi bi-inbox" style="font-size: 40px; color: white;"></i>
                    </div>
                    <div style="
                        font-family: 'Inter', sans-serif;
                        font-size: 16px;
                        font-weight: 600;
                        color: #475569;
                        margin-bottom: 8px;
                    ">Chưa có sản phẩm nào</div>
                    <div style="
                        font-family: 'Inter', sans-serif;
                        font-size: 13px;
                        color: #94a3b8;
                    ">Nhập thông tin sản phẩm bên dưới để thêm vào đơn hàng</div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <style>
                .product-card {
                    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 18px;
                    margin-bottom: 12px;
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                }
                
                .product-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 4px;
                    height: 100%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                
                .product-card:hover {
                    transform: translateX(4px);
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
                    border-color: #667eea;
                }
                
                .product-card:hover::before {
                    opacity: 1;
                }
                
                .product-name {
                    font-family: 'Inter', sans-serif;
                    font-size: 15px;
                    font-weight: 600;
                    color: #1e293b;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .product-icon {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 16px;
                }
                
                .product-badge {
                    font-family: 'Inter', sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    padding: 6px 14px;
                    border-radius: 8px;
                    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                    color: white;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .btn-delete-product {
                    font-family: 'Inter', sans-serif;
                    font-size: 13px;
                    padding: 8px 14px;
                    border: 2px solid #fee2e2;
                    border-radius: 8px;
                    background: #fef2f2;
                    color: #dc2626;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-weight: 600;
                }
                
                .btn-delete-product:hover {
                    background: #dc2626;
                    color: white;
                    border-color: #dc2626;
                    transform: scale(1.05);
                }
                
                .products-summary {
                    font-family: 'Inter', sans-serif;
                    padding: 14px 18px;
                    background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
                    border-radius: 10px;
                    margin-bottom: 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .summary-text {
                    font-size: 13px;
                    color: #64748b;
                    font-weight: 500;
                }
                
                .summary-badge {
                    font-size: 14px;
                    font-weight: 700;
                    padding: 6px 16px;
                    border-radius: 8px;
                    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                    color: white;
                }
            </style>
            
            <div class="products-summary">
                <span class="summary-text">
                    <i class="bi bi-list-check me-1"></i>
                    ${this.orderProducts.length} sản phẩm
                </span>
                <span class="summary-badge">
                    Tổng: ${this.orderProducts.reduce((sum, p) => sum + p.qty, 0).toFixed(2)} Kg
                </span>
            </div>
            
            ${this.orderProducts.map((product, index) => `
                <div class="product-card">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex-grow: 1;">
                            <div class="product-name">
                                <div class="product-icon">
                                    <i class="bi bi-box"></i>
                                </div>
                                <span>${product.name}</span>
                                ${product.code ? `<span style="background:#e0e7ff; color:#4338ca; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:500; margin-left:8px;">${product.code}</span>` : ''}
                            </div>
                            <div class="product-badge">
                                <i class="bi bi-speedometer2"></i>
                                ${product.qty} ${product.unit}
                            </div>
                        </div>
                        <button class="btn-delete-product" 
                                onclick="CreateOrderModule.removeProduct(${index})"
                                title="Xóa sản phẩm">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        `;
    },

    // Submit đơn hàng — show confirmation modal first
    async submitOrder() {
        if (this.orderProducts.length === 0) {
            alert('Vui lòng thêm ít nhất 1 sản phẩm!');
            return;
        }

        const date = document.getElementById('order-date').value;
        const customer = document.getElementById('order-customer').value.trim();
        const address = document.getElementById('order-address').value.trim();
        const note = document.getElementById('order-note')?.value?.trim() || '';

        if (!customer) {
            alert('Vui lòng nhập tên nhà cung cấp/khách hàng!');
            return;
        }

        // Show confirmation modal instead of submitting directly
        this.showConfirmModal({ date, customer, address, note });
    },

    // Show confirmation modal with order summary
    showConfirmModal({ date, customer, address, note }) {
        // Remove existing modal if any
        let modal = document.getElementById('order-confirm-modal');
        if (modal) modal.remove();

        const formattedDate = date ? new Date(date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
        const totalQty = this.orderProducts.reduce((sum, p) => sum + p.qty, 0);

        modal = document.createElement('div');
        modal.id = 'order-confirm-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);animation:fadeIn 0.2s ease;';
        modal.innerHTML = `
            <style>
                @keyframes slideUp { from { opacity:0; transform:translateY(40px); } to { opacity:1; transform:translateY(0); } }
                @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
                .confirm-modal-card {
                    background:white; border-radius:20px; width:100%; max-width:600px; max-height:90vh;
                    display:flex; flex-direction:column; box-shadow:0 25px 60px rgba(0,0,0,0.3);
                    animation:slideUp 0.3s ease;
                }
                .confirm-header {
                    background:linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                    color:white; padding:20px 24px; border-radius:20px 20px 0 0;
                    display:flex; justify-content:space-between; align-items:center;
                }
                .confirm-body { padding:24px; overflow-y:auto; flex:1; }
                .confirm-info-row {
                    display:flex; justify-content:space-between; padding:10px 0;
                    border-bottom:1px solid #f0f0f0; font-size:14px;
                }
                .confirm-info-label { color:#6B7280; font-weight:500; display:flex; align-items:center; gap:6px; }
                .confirm-info-value { color:#1f2937; font-weight:600; text-align:right; max-width:60%; }
                .confirm-product-item {
                    display:flex; align-items:center; gap:10px; padding:12px 14px;
                    background:#f9fafb; border-radius:10px; margin-bottom:8px;
                    border:1px solid #e5e7eb; transition:all 0.2s;
                }
                .confirm-product-item:hover { border-color:#11998e; background:#f0fdf4; }
                .confirm-product-num {
                    width:28px; height:28px; border-radius:8px;
                    background:linear-gradient(135deg, #667eea, #764ba2);
                    color:white; display:flex; align-items:center; justify-content:center;
                    font-size:12px; font-weight:700; flex-shrink:0;
                }
                .confirm-product-name { flex:1; font-weight:600; font-size:13px; color:#1e293b; }
                .confirm-product-qty-input {
                    width:80px; border:1px solid #d1d5db; border-radius:6px; padding:4px 8px;
                    font-size:13px; text-align:right; font-weight:600; background:white;
                }
                .confirm-product-qty-input:focus { border-color:#11998e; outline:none; box-shadow:0 0 0 2px rgba(17,153,142,0.15); }
                .confirm-product-unit { color:#6b7280; font-size:12px; font-weight:500; width:30px; }
                .confirm-product-del {
                    width:28px; height:28px; border-radius:6px; border:none;
                    background:#fee2e2; color:#ef4444; cursor:pointer; font-size:14px;
                    display:flex; align-items:center; justify-content:center; flex-shrink:0;
                    transition:all 0.2s;
                }
                .confirm-product-del:hover { background:#ef4444; color:white; }
                .confirm-footer {
                    padding:16px 24px; border-top:1px solid #e5e7eb;
                    display:flex; gap:12px; border-radius:0 0 20px 20px; background:#fafafa;
                }
                .confirm-total-bar {
                    display:flex; justify-content:space-between; align-items:center;
                    padding:12px 16px; background:linear-gradient(135deg, #11998e15, #38ef7d15);
                    border-radius:10px; margin-top:8px; border:1px solid #11998e30;
                }
            </style>
            <div class="confirm-modal-card" onclick="event.stopPropagation()">
                <div class="confirm-header">
                    <div>
                        <div style="font-size:17px;font-weight:700;">📋 Xác nhận đơn hàng</div>
                        <div style="font-size:12px;opacity:0.9;">Kiểm tra thông tin trước khi tạo</div>
                    </div>
                    <button onclick="document.getElementById('order-confirm-modal').remove()"
                        style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:18px;font-weight:bold;transition:background 0.2s;"
                        onmouseover="this.style.background='rgba(255,0,0,0.4)'"
                        onmouseout="this.style.background='rgba(255,255,255,0.2)'">✕</button>
                </div>
                <div class="confirm-body">
                    <!-- Order Info -->
                    <div style="margin-bottom:20px;">
                        <div class="confirm-info-row">
                            <span class="confirm-info-label"><i class="bi bi-calendar3"></i> Ngày</span>
                            <span class="confirm-info-value">${formattedDate}</span>
                        </div>
                        <div class="confirm-info-row">
                            <span class="confirm-info-label"><i class="bi bi-building"></i> NCC/Khách hàng</span>
                            <span class="confirm-info-value">${this._escHtml(customer)}</span>
                        </div>
                        ${address ? `<div class="confirm-info-row">
                            <span class="confirm-info-label"><i class="bi bi-geo-alt"></i> Địa chỉ</span>
                            <span class="confirm-info-value">${this._escHtml(address)}</span>
                        </div>` : ''}
                        ${note ? `<div class="confirm-info-row" style="border-bottom:none;">
                            <span class="confirm-info-label"><i class="bi bi-sticky"></i> Ghi chú</span>
                            <span class="confirm-info-value">${this._escHtml(note)}</span>
                        </div>` : ''}
                    </div>

                    <!-- Products -->
                    <div style="font-size:14px;font-weight:700;color:#374151;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
                        <i class="bi bi-box-seam" style="color:#11998e;"></i> Sản phẩm
                        <span style="background:#e0e7ff;color:#4338ca;padding:1px 8px;border-radius:8px;font-size:11px;font-weight:600;">${this.orderProducts.length}</span>
                    </div>
                    <div id="confirm-products-list">
                        ${this._renderConfirmProducts()}
                    </div>
                    <div class="confirm-total-bar" id="confirm-total-bar">
                        <span style="font-size:13px;color:#374151;font-weight:600;">Tổng cộng</span>
                        <span style="font-size:16px;font-weight:700;color:#11998e;" id="confirm-total-qty">${Number(totalQty).toLocaleString('vi-VN')} Kg</span>
                    </div>
                </div>
                <div class="confirm-footer">
                    <button onclick="document.getElementById('order-confirm-modal').remove()"
                        style="flex:1;padding:14px;border:2px solid #e5e7eb;border-radius:12px;background:white;color:#374151;font-weight:600;font-size:14px;cursor:pointer;transition:all 0.2s;"
                        onmouseover="this.style.borderColor='#9ca3af';this.style.background='#f9fafb'"
                        onmouseout="this.style.borderColor='#e5e7eb';this.style.background='white'">
                        <i class="bi bi-pencil-square"></i> Quay lại sửa
                    </button>
                    <button id="btn-confirm-submit" onclick="CreateOrderModule.confirmAndSubmit()"
                        style="flex:2;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#11998e,#38ef7d);color:white;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 4px 16px rgba(17,153,142,0.3);transition:all 0.2s;text-transform:uppercase;letter-spacing:0.5px;"
                        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(17,153,142,0.4)'"
                        onmouseout="this.style.transform='';this.style.boxShadow='0 4px 16px rgba(17,153,142,0.3)'">
                        <i class="bi bi-check-circle"></i> Xác nhận tạo đơn
                    </button>
                </div>
            </div>
        `;

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        // Close on Escape
        const escHandler = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); } };
        document.addEventListener('keydown', escHandler);

        document.body.appendChild(modal);
    },

    // Render products in confirmation modal
    _renderConfirmProducts() {
        return this.orderProducts.map((p, i) => `
            <div class="confirm-product-item" data-idx="${i}">
                <div class="confirm-product-num">${i + 1}</div>
                <div class="confirm-product-name">
                    ${this._escHtml(p.name)}
                    ${p.code ? `<div style="font-size:11px;color:#6b7280;font-weight:400;margin-top:1px;">${this._escHtml(p.code)}</div>` : ''}
                </div>
                <input type="number" class="confirm-product-qty-input" value="${p.qty}" step="0.01" min="0.01"
                    onchange="CreateOrderModule.editConfirmProduct(${i}, this.value)">
                <span class="confirm-product-unit">${p.unit}</span>
                <button class="confirm-product-del" title="Xóa" onclick="CreateOrderModule.removeConfirmProduct(${i})">
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
        `).join('');
    },

    // Edit product qty in confirm modal
    editConfirmProduct(index, newQty) {
        const qty = parseFloat(newQty);
        if (isNaN(qty) || qty <= 0) return;
        this.orderProducts[index].qty = qty;
        this._updateConfirmTotal();
        this.renderProductList(); // sync main form too
    },

    // Remove product from confirm modal
    removeConfirmProduct(index) {
        this.orderProducts.splice(index, 1);
        // If no products left, close modal
        if (this.orderProducts.length === 0) {
            document.getElementById('order-confirm-modal')?.remove();
            alert('Đã xóa hết sản phẩm. Vui lòng thêm lại.');
            this.renderProductList();
            return;
        }
        // Re-render products in modal
        const list = document.getElementById('confirm-products-list');
        if (list) list.innerHTML = this._renderConfirmProducts();
        this._updateConfirmTotal();
        this.renderProductList(); // sync main form
    },

    // Update total in confirm modal
    _updateConfirmTotal() {
        const totalEl = document.getElementById('confirm-total-qty');
        if (totalEl) {
            const total = this.orderProducts.reduce((sum, p) => sum + p.qty, 0);
            totalEl.textContent = Number(total).toLocaleString('vi-VN') + ' Kg';
        }
    },

    // Escape HTML helper
    _escHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    // Final submit after confirmation
    async confirmAndSubmit() {
        const date = document.getElementById('order-date').value;
        const customer = document.getElementById('order-customer').value.trim();
        const address = document.getElementById('order-address').value.trim();
        const note = document.getElementById('order-note')?.value?.trim() || '';

        // Show loading on confirm button
        const submitBtn = document.getElementById('btn-confirm-submit');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Đang xử lý...';
        }

        try {
            const response = await fetch('/api/orders/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: date,
                    customer: customer,
                    address: address,
                    products: this.orderProducts,
                    type: 'IMPORT',
                    note: note
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.msg || 'Có lỗi xảy ra khi tạo đơn');
            }

            // Close modal
            document.getElementById('order-confirm-modal')?.remove();

            alert('✅ Tạo đơn nhập thành công!');

            // Reset form
            this.resetForm();

            // Navigate back to dashboard
            AppRouter.navigateTo('dashboard');

        } catch (error) {
            console.error('Error creating order:', error);
            alert('❌ Lỗi: ' + error.message);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="bi bi-check-circle"></i> Xác nhận tạo đơn';
            }
        }
    }
};

// Đăng ký module
AppRouter.registerModule('create-order', CreateOrderModule);

// Export to window for onclick handlers in HTML
window.CreateOrderModule = CreateOrderModule;
