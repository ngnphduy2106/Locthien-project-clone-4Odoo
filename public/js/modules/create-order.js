// ===============================================
// MODULE: TẠO ĐƠN NHẬP (Create Order)
// ===============================================

const CreateOrderModule = {
    orderProducts: [],
    suppliers: [],
    materials: [], // MISA products with code + name

    // Khởi tạo module
    init() {
        console.log('Create Order Module initialized');
        this.loadSuppliers();
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

    // Update supplier datalist
    updateSupplierDatalist() {
        const datalist = document.getElementById('supplier-list');
        if (!datalist) return;

        datalist.innerHTML = this.suppliers.map(s =>
            `<option value="${s.name}">${s.name}</option>`
        ).join('');
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

    // Submit đơn hàng
    async submitOrder() {
        if (this.orderProducts.length === 0) {
            alert('Vui lòng thêm ít nhất 1 sản phẩm!');
            return;
        }

        const date = document.getElementById('order-date').value;
        const customer = document.getElementById('order-customer').value.trim();
        const address = document.getElementById('order-address').value.trim();

        if (!customer) {
            alert('Vui lòng nhập tên nhà cung cấp/khách hàng!');
            return;
        }

        // Show loading
        const submitBtn = event.target;
        const originalHTML = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Đang xử lý...';

        try {
            const response = await fetch('/api/orders/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    date: date,
                    customer: customer,
                    address: address,
                    products: this.orderProducts,
                    type: 'IMPORT'
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.msg || 'Có lỗi xảy ra khi tạo đơn');
            }

            alert('✅ Tạo đơn nhập thành công!');

            // Reset form
            this.resetForm();

            // Navigate back to dashboard
            AppRouter.navigateTo('dashboard');

        } catch (error) {
            console.error('Error creating order:', error);
            alert('❌ Lỗi: ' + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHTML;
        }
    }
};

// Đăng ký module
AppRouter.registerModule('create-order', CreateOrderModule);

// Export to window for onclick handlers in HTML
window.CreateOrderModule = CreateOrderModule;
