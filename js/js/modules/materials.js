// ===============================================
// MODULE: QUẢN LÝ VẬT TƯ (Materials Management)
// ===============================================

const MaterialsModule = {
    allMaterials: [],
    filteredMaterials: [],
    showAddForm: false,

    // Khởi tạo module
    init() {
        console.log('Materials Module initialized');
        this.renderInterface();
        this.loadMaterials();
    },

    // Render giao diện
    renderInterface() {
        const container = document.getElementById('materials-content');
        if (!container) return;

        container.innerHTML = `
            <style>
                /* Modal Overlay */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(8px);
                    display: none;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    animation: fadeIn 0.3s ease;
                }
                
                .modal-overlay.show {
                    display: flex;
                }
                
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
                
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                /* Modal Content */
                .modal-content {
                    background: #ffffff;
                    border-radius: 20px;
                    padding: 32px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    width: 90%;
                    max-width: 600px;
                    max-height: 90vh;
                    overflow-y: auto;
                    animation: slideUp 0.3s ease;
                    position: relative;
                }
                
                .modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 28px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #f1f5f9;
                }
                
                .modal-title {
                    font-family: 'Inter', sans-serif;
                    font-size: 22px;
                    font-weight: 700;
                    color: #1e293b;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .modal-title-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 20px;
                }
                
                .modal-close {
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    border: none;
                    background: #f1f5f9;
                    color: #64748b;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                }
                
                .modal-close:hover {
                    background: #e2e8f0;
                    color: #334155;
                }
                
                .modern-card {
                    background: #ffffff;
                    border-radius: 16px;
                    padding: 28px;
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
                    transition: all 0.3s ease;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                    margin-bottom: 20px;
                }
                
                .modern-card:hover {
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
                    transform: translateY(-2px);
                }
                
                .btn-add-modern {
                    font-family: 'Inter', sans-serif;
                    font-size: 15px;
                    font-weight: 600;
                    padding: 13px 24px;
                    border: none;
                    border-radius: 10px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                }
                
                .btn-add-modern:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
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
                    width: 100%;
                }
                
                .form-input-modern:focus {
                    border-color: #667eea;
                    background: #ffffff;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
                    outline: none;
                }
                
                .search-box-modern {
                    position: relative;
                    margin-bottom: 24px;
                }
                
                .search-box-modern input {
                    font-family: 'Inter', sans-serif;
                    font-size: 15px;
                    padding: 13px 16px 13px 45px;
                    border: 2px solid #e5e7eb;
                    border-radius: 12px;
                    transition: all 0.2s ease;
                    background: #fafafa;
                    width: 100%;
                }
                
                .search-box-modern input:focus {
                    border-color: #667eea;
                    background: #ffffff;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
                    outline: none;
                }
                
                .search-icon {
                    position: absolute;
                    left: 16px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #9ca3af;
                    font-size: 18px;
                }
                
                .material-card {
                    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 18px;
                    margin-bottom: 12px;
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                }
                
                .material-card::before {
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
                
                .material-card:hover {
                    transform: translateX(4px);
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
                    border-color: #667eea;
                }
                
                .material-card:hover::before {
                    opacity: 1;
                }
                
                .material-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 20px;
                    margin-right: 14px;
                }
                
                .material-name {
                    font-family: 'Inter', sans-serif;
                    font-size: 16px;
                    font-weight: 600;
                    color: #1e293b;
                    margin-bottom: 6px;
                }
                
                .material-meta {
                    font-family: 'Inter', sans-serif;
                    font-size: 13px;
                    color: #64748b;
                }
                
                .category-badge {
                    font-family: 'Inter', sans-serif;
                    font-size: 12px;
                    font-weight: 600;
                    padding: 6px 12px;
                    border-radius: 8px;
                    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
                    color: #0369a1;
                    border: 1px solid #bae6fd;
                }
                
                .price-badge {
                    font-family: 'Inter', sans-serif;
                    font-size: 14px;
                    font-weight: 700;
                    color: #059669;
                    margin-top: 6px;
                }
                
                .category-header {
                    font-family: 'Inter', sans-serif;
                    font-size: 18px;
                    font-weight: 700;
                    color: #667eea;
                    margin: 28px 0 16px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .category-icon {
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
                
                .btn-submit-modern {
                    font-family: 'Inter', sans-serif;
                    font-size: 15px;
                    font-weight: 600;
                    padding: 13px 20px;
                    border: none;
                    border-radius: 10px;
                    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                    color: white;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 12px rgba(17, 153, 142, 0.3);
                }
                
                .btn-submit-modern:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(17, 153, 142, 0.4);
                }
                
                .btn-cancel-modern {
                    font-family: 'Inter', sans-serif;
                    font-size: 15px;
                    font-weight: 600;
                    padding: 13px 20px;
                    border: 2px solid #e5e7eb;
                    border-radius: 10px;
                    background: #ffffff;
                    color: #6b7280;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .btn-cancel-modern:hover {
                    border-color: #d1d5db;
                    background: #f9fafb;
                }
                
                .empty-state-modern {
                    text-align: center;
                    padding: 60px 20px;
                    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                    border-radius: 16px;
                    border: 2px dashed #cbd5e1;
                }
                
                .empty-icon {
                    width: 80px;
                    height: 80px;
                    margin: 0 auto 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0.2;
                }
                
                .empty-icon i {
                    font-size: 40px;
                    color: white;
                }
            </style>
            
            <!-- Header Actions -->
            <div style="margin-bottom: 24px;">
                <button class="btn-add-modern" onclick="MaterialsModule.toggleAddForm()">
                    <i class="bi bi-plus-circle me-2"></i>Thêm Vật Tư
                </button>
            </div>

            <!-- Modal Overlay for Add Material Form -->
            <div id="modal-add-material" class="modal-overlay" onclick="MaterialsModule.closeModalOnOverlay(event)">
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-title">
                            <div class="modal-title-icon">
                                <i class="bi bi-droplet"></i>
                            </div>
                            <span>Thêm Vật Tư Mới</span>
                        </div>
                        <button class="modal-close" onclick="MaterialsModule.toggleAddForm()">
                            <i class="bi bi-x"></i>
                        </button>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label class="form-label-modern">
                            <div class="label-icon"><i class="bi bi-tag"></i></div>
                            Tên vật tư *
                        </label>
                        <input id="mat-name" class="form-input-modern" placeholder="Nhập tên vật tư">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label class="form-label-modern">
                            <div class="label-icon"><i class="bi bi-upc"></i></div>
                            Mã vật tư
                        </label>
                        <input id="mat-code" class="form-input-modern" placeholder="Mã vật tư (tự động nếu để trống)">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label class="form-label-modern">
                            <div class="label-icon"><i class="bi bi-hash"></i></div>
                            CAS Number
                        </label>
                        <input id="mat-cas" class="form-input-modern" placeholder="VD: 7647-01-0">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label class="form-label-modern">
                            <div class="label-icon"><i class="bi bi-folder"></i></div>
                            Danh mục
                        </label>
                        <select id="mat-category" class="form-input-modern">
                            <option value="Acid">Acid (Axit)</option>
                            <option value="Base">Base (Bazơ)</option>
                            <option value="Solvent">Solvent (Dung môi)</option>
                            <option value="Salt">Salt (Muối)</option>
                            <option value="Other">Other (Khác)</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 24px;">
                        <label class="form-label-modern">
                            <div class="label-icon"><i class="bi bi-currency-dollar"></i></div>
                            Giá bán
                        </label>
                        <input id="mat-price" type="number" class="form-input-modern" placeholder="Giá bán (VNĐ)">
                    </div>

                    <div style="display: flex; gap: 12px;">
                        <button class="btn-submit-modern" style="flex: 1;" onclick="MaterialsModule.addMaterial()">
                            <i class="bi bi-check-circle me-2"></i>Thêm
                        </button>
                        <button class="btn-cancel-modern" onclick="MaterialsModule.toggleAddForm()">
                            Hủy
                        </button>
                    </div>
                </div>
            </div>

            <!-- Search Box -->
            <div class="search-box-modern">
                <i class="bi bi-search search-icon"></i>
                <input type="text" id="mat-search" 
                    placeholder="Tìm kiếm vật tư (tên, mã, CAS)..." 
                    oninput="MaterialsModule.searchMaterials()">
            </div>

            <!-- Materials List -->
            <div id="materials-list-container"></div>
        `;
    },

    // Toggle form thêm vật tư (modal)
    toggleAddForm() {
        this.showAddForm = !this.showAddForm;
        const modal = document.getElementById('modal-add-material');
        if (modal) {
            if (this.showAddForm) {
                modal.classList.add('show');
                // Prevent body scroll when modal is open
                document.body.style.overflow = 'hidden';
            } else {
                modal.classList.remove('show');
                // Restore body scroll
                document.body.style.overflow = '';

                // Reset form khi đóng
                document.getElementById('mat-name').value = '';
                document.getElementById('mat-code').value = '';
                document.getElementById('mat-cas').value = '';
                document.getElementById('mat-category').value = 'Acid';
                document.getElementById('mat-price').value = '';
            }
        }
    },

    // Đóng modal khi click vào overlay (không đóng khi click vào content)
    closeModalOnOverlay(event) {
        // Chỉ đóng khi click vào overlay, không đóng khi click vào modal content
        if (event.target.id === 'modal-add-material') {
            this.toggleAddForm();
        }
    },

    // Load danh sách vật tư
    async loadMaterials() {
        const container = document.getElementById('materials-list-container');
        if (!container) return;

        container.innerHTML = '<div class="loading-spinner mx-auto mt-5"></div>';

        try {
            const response = await fetch('/api/materials');
            const data = await response.json();

            if (data.error) {
                console.error('Error from API:', data.msg);
                this.loadMockMaterials();
                return;
            }

            this.allMaterials = data.data || [];
            this.filteredMaterials = this.allMaterials;
            this.renderMaterials();

        } catch (error) {
            console.error('Error loading materials:', error);
            this.loadMockMaterials();
        }
    },

    // Load mock data
    loadMockMaterials() {
        this.allMaterials = [
            {
                id: '1',
                name: 'Hydrochloric Acid 32%',
                code: 'HCL32',
                casNumber: '7647-01-0',
                category: 'Acid',
                salePrice: 15000
            },
            {
                id: '2',
                name: 'Sodium Hydroxide 50%',
                code: 'NAOH50',
                casNumber: '1310-73-2',
                category: 'Base',
                salePrice: 18000
            },
            {
                id: '3',
                name: 'Sulfuric Acid 98%',
                code: 'H2SO4',
                casNumber: '7664-93-9',
                category: 'Acid',
                salePrice: 20000
            },
            {
                id: '4',
                name: 'Sodium Hypochlorite 10%',
                code: 'JAVEL10',
                casNumber: '7681-52-9',
                category: 'Other',
                salePrice: 12000
            }
        ];
        this.filteredMaterials = this.allMaterials;
        this.renderMaterials();
    },

    // Search materials
    searchMaterials() {
        const query = document.getElementById('mat-search').value.toLowerCase().trim();

        if (!query) {
            this.filteredMaterials = this.allMaterials;
        } else {
            this.filteredMaterials = this.allMaterials.filter(m =>
                (m.name && m.name.toLowerCase().includes(query)) ||
                (m.code && m.code.toLowerCase().includes(query)) ||
                (m.casNumber && m.casNumber.toLowerCase().includes(query))
            );
        }

        this.renderMaterials();
    },

    // Render danh sách vật tư
    renderMaterials() {
        const container = document.getElementById('materials-list-container');
        if (!container) return;

        if (this.filteredMaterials.length === 0) {
            container.innerHTML = `
                <div class="empty-state-modern">
                    <div class="empty-icon">
                        <i class="bi bi-droplet"></i>
                    </div>
                    <div style="font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 600; color: #475569; margin-bottom: 8px;">
                        Không tìm thấy vật tư nào
                    </div>
                    <div style="font-family: 'Inter', sans-serif; font-size: 13px; color: #94a3b8;">
                        Thử tìm kiếm với từ khóa khác hoặc thêm vật tư mới
                    </div>
                </div>
            `;
            return;
        }

        // Group by category
        const grouped = {};
        this.filteredMaterials.forEach(mat => {
            const cat = mat.category || 'Other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(mat);
        });

        let html = '';
        Object.keys(grouped).sort().forEach(category => {
            html += `
                <div class="category-header">
                    <div class="category-icon">
                        <i class="bi bi-tag"></i>
                    </div>
                    <span>${this.getCategoryName(category)} (${grouped[category].length})</span>
                </div>
            `;

            html += grouped[category].map(mat => `
                <div class="material-card">
                    <div style="display: flex; align-items: start; justify-content: space-between;">
                        <div style="display: flex; align-items: start; flex: 1;">
                            <div class="material-icon">
                                <i class="bi bi-droplet"></i>
                            </div>
                            <div style="flex: 1;">
                                <div class="material-name">${mat.name}</div>
                                <div class="material-meta">
                                    ${mat.code || 'N/A'} 
                                    ${mat.casNumber ? '• CAS: ' + mat.casNumber : ''}
                                </div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div class="category-badge">${this.getCategoryName(mat.category)}</div>
                            ${mat.salePrice ? `
                                <div class="price-badge">
                                    ${mat.salePrice.toLocaleString('vi-VN')} đ
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('');
        });

        container.innerHTML = html;
    },

    // Get category name
    getCategoryName(category) {
        const categoryMap = {
            'Acid': 'Axit',
            'Base': 'Bazơ',
            'Solvent': 'Dung môi',
            'Salt': 'Muối',
            'Other': 'Khác'
        };
        return categoryMap[category] || category;
    },

    // Thêm vật tư
    async addMaterial() {
        const data = {
            name: document.getElementById('mat-name').value.trim(),
            code: document.getElementById('mat-code').value.trim(),
            casNumber: document.getElementById('mat-cas').value.trim(),
            category: document.getElementById('mat-category').value,
            salePrice: parseInt(document.getElementById('mat-price').value) || 0
        };

        if (!data.name) {
            alert('Vui lòng nhập tên vật tư!');
            return;
        }

        try {
            const response = await fetch('/api/materials', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.error) {
                alert('Lỗi: ' + result.msg);
                return;
            }

            alert('✅ Thêm vật tư thành công!');
            this.toggleAddForm();
            this.loadMaterials();

        } catch (error) {
            console.error('Error adding material:', error);
            alert('Có lỗi xảy ra khi thêm vật tư!');
        }
    }
};

// Đăng ký module
AppRouter.registerModule('materials', MaterialsModule);
