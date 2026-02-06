// ===============================================
// MODULE: QUẢN LÝ NHÂN SỰ (HR Management) - REDESIGNED
// ===============================================

const HRModule = {
    employees: [],
    showAddForm: false,

    // Khởi tạo module
    init() {
        console.log('HR Module initialized');
        this.renderInterface();
        this.loadEmployees();
    },

    // Render giao diện
    renderInterface() {
        const container = document.getElementById('employees-list');
        if (!container) return;

        container.innerHTML = `
            <style>
                /* Modal Overlay */
                .hr-modal-overlay {
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
                
                .hr-modal-overlay.show {
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
                .hr-modal-content {
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
                
                .hr-modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 28px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #f1f5f9;
                }
                
                .hr-modal-title {
                    font-family: 'Inter', sans-serif;
                    font-size: 22px;
                    font-weight: 700;
                    color: #1e293b;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .hr-modal-title-icon {
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
                
                .hr-modal-close {
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
                
                .hr-modal-close:hover {
                    background: #e2e8f0;
                    color: #334155;
                }
                
                .hr-modern-card {
                    background: #ffffff;
                    border-radius: 16px;
                    padding: 28px;
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
                    transition: all 0.3s ease;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                    margin-bottom: 20px;
                }
                
                .hr-modern-card:hover {
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
                    transform: translateY(-2px);
                }
                
                .btn-add-hr {
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
                
                .btn-add-hr:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
                }
                
                .hr-form-label {
                    font-family: 'Inter', sans-serif;
                    font-size: 14px;
                    font-weight: 600;
                    color: #374151;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .hr-label-icon {
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
                
                .hr-form-input {
                    font-family: 'Inter', sans-serif;
                    font-size: 15px;
                    padding: 13px 16px;
                    border: 2px solid #e5e7eb;
                    border-radius: 10px;
                    transition: all 0.2s ease;
                    background: #fafafa;
                    width: 100%;
                }
                
                .hr-form-input:focus {
                    border-color: #667eea;
                    background: #ffffff;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
                    outline: none;
                }
                
                .employee-card {
                    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 12px;
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                }
                
                .employee-card::before {
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
                
                .employee-card:hover {
                    transform: translateX(4px);
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
                    border-color: #667eea;
                }
                
                .employee-card:hover::before {
                    opacity: 1;
                }
                
                .employee-avatar {
                    width: 56px;
                    height: 56px;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 24px;
                    margin-right: 16px;
                    flex-shrink: 0;
                }
                
                .employee-name {
                    font-family: 'Inter', sans-serif;
                    font-size: 17px;
                    font-weight: 700;
                    color: #1e293b;
                    margin-bottom: 6px;
                }
                
                .employee-role {
                    font-family: 'Inter', sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    padding: 4px 10px;
                    border-radius: 6px;
                    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
                    color: #0369a1;
                    border: 1px solid #bae6fd;
                    display: inline-block;
                    margin-bottom: 8px;
                }
                
                .employee-meta {
                    font-family: 'Inter', sans-serif;
                    font-size: 13px;
                    color: #64748b;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                
                .employee-salary {
                    font-family: 'Inter', sans-serif;
                    font-size: 15px;
                    font-weight: 700;
                    color: #059669;
                    margin-top: 8px;
                }
                
                .status-badge {
                    font-family: 'Inter', sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    padding: 6px 14px;
                    border-radius: 8px;
                    background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
                    color: #065f46;
                    border: 1px solid #6ee7b7;
                }
                
                .status-badge.inactive {
                    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                    color: #991b1b;
                    border: 1px solid #fca5a5;
                }
                
                .btn-submit-hr {
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
                
                .btn-submit-hr:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(17, 153, 142, 0.4);
                }
                
                .btn-cancel-hr {
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
                
                .btn-cancel-hr:hover {
                    border-color: #d1d5db;
                    background: #f9fafb;
                }
                
                .empty-state-hr {
                    text-align: center;
                    padding: 60px 20px;
                    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                    border-radius: 16px;
                    border: 2px dashed #cbd5e1;
                }
                
                .empty-icon-hr {
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
                
                .empty-icon-hr i {
                    font-size: 40px;
                    color: white;
                }
            </style>
            
            <!-- Add Employee Button -->
            <div style="margin-bottom: 24px;">
                <button class="btn-add-hr" onclick="HRModule.toggleAddForm()">
                    <i class="bi bi-person-plus me-2"></i>Thêm Nhân Viên
                </button>
            </div>

            <!-- Modal Overlay for Add Employee Form -->
            <div id="modal-add-employee" class="hr-modal-overlay" onclick="HRModule.closeModalOnOverlay(event)">
                <div class="hr-modal-content">
                    <div class="hr-modal-header">
                        <div class="hr-modal-title">
                            <div class="hr-modal-title-icon">
                                <i class="bi bi-people"></i>
                            </div>
                            <span>Thêm Nhân Viên Mới</span>
                        </div>
                        <button class="hr-modal-close" onclick="HRModule.toggleAddForm()">
                            <i class="bi bi-x"></i>
                        </button>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label class="hr-form-label">
                            <div class="hr-label-icon"><i class="bi bi-person"></i></div>
                            Họ tên *
                        </label>
                        <input id="emp-name" class="hr-form-input" placeholder="Nhập họ tên nhân viên">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label class="hr-form-label">
                            <div class="hr-label-icon"><i class="bi bi-telephone"></i></div>
                            Số điện thoại *
                        </label>
                        <input id="emp-phone" class="hr-form-input" placeholder="Nhập số điện thoại">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label class="hr-form-label">
                            <div class="hr-label-icon"><i class="bi bi-briefcase"></i></div>
                            Chức vụ
                        </label>
                        <select id="emp-role" class="hr-form-input">
                            <option value="DRIVER">Tài xế</option>
                            <option value="ASSISTANT">Trợ lý</option>
                            <option value="WAREHOUSE">Nhân viên kho</option>
                            <option value="SALES">Kinh doanh</option>
                            <option value="DISPATCHER">Điều phối</option>
                            <option value="ADMIN">Quản trị</option>
                            <option value="TESTER">Kiểm thử</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label class="hr-form-label">
                            <div class="hr-label-icon"><i class="bi bi-truck"></i></div>
                            Biển số xe (nếu là tài xế)
                        </label>
                        <input id="emp-plate" class="hr-form-input" placeholder="VD: 51C-12345">
                    </div>

                    <div style="margin-bottom: 24px;">
                        <label class="hr-form-label">
                            <div class="hr-label-icon"><i class="bi bi-currency-dollar"></i></div>
                            Lương cơ bản
                        </label>
                        <input id="emp-salary" type="number" class="hr-form-input" placeholder="Nhập lương cơ bản">
                    </div>

                    <div style="display: flex; gap: 12px;">
                        <button class="btn-submit-hr" style="flex: 1;" onclick="HRModule.addEmployee()">
                            <i class="bi bi-check-circle me-2"></i>Thêm
                        </button>
                        <button class="btn-cancel-hr" onclick="HRModule.toggleAddForm()">
                            Hủy
                        </button>
                    </div>
                </div>
            </div>

            <!-- Employee List -->
            <div id="hr-list-container"></div>
        `;
    },

    // Toggle form thêm nhân viên (modal)
    toggleAddForm() {
        this.showAddForm = !this.showAddForm;
        const modal = document.getElementById('modal-add-employee');
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
                document.getElementById('emp-name').value = '';
                document.getElementById('emp-phone').value = '';
                document.getElementById('emp-role').value = 'DRIVER';
                document.getElementById('emp-plate').value = '';
                document.getElementById('emp-salary').value = '';
            }
        }
    },

    // Đóng modal khi click vào overlay (không đóng khi click vào content)
    closeModalOnOverlay(event) {
        // Chỉ đóng khi click vào overlay, không đóng khi click vào modal content
        if (event.target.id === 'modal-add-employee') {
            this.toggleAddForm();
        }
    },

    // Load danh sách nhân viên
    async loadEmployees() {
        const container = document.getElementById('hr-list-container');
        if (!container) return;

        container.innerHTML = '<div class="loading-spinner mx-auto mt-5"></div>';

        try {
            const response = await fetch('/api/hr/employees');
            const data = await response.json();

            if (data.error) {
                console.error('Error from API:', data.msg);
                this.loadMockEmployees();
                return;
            }

            this.employees = data.data || [];
            this.renderEmployeeList();

        } catch (error) {
            console.error('Error loading employees:', error);
            this.loadMockEmployees();
        }
    },

    // Load mock data
    loadMockEmployees() {
        this.employees = [
            {
                id: '1',
                fullName: 'Admin Test',
                phone: '0901234567',
                role: 'ADMIN',
                plate: '',
                status: 'ACTIVE',
                baseSalary: 15000000
            },
            {
                id: '2',
                fullName: 'Tài Xế A',
                phone: '0909876543',
                role: 'DRIVER',
                plate: '51C-12345',
                status: 'ACTIVE',
                baseSalary: 10000000
            },
            {
                id: '3',
                fullName: 'Nhân Viên Kho',
                phone: '0905555555',
                role: 'WAREHOUSE',
                plate: '',
                status: 'ACTIVE',
                baseSalary: 8000000
            }
        ];
        this.renderEmployeeList();
    },

    // Render danh sách nhân viên
    renderEmployeeList() {
        const container = document.getElementById('hr-list-container');
        if (!container) return;

        if (this.employees.length === 0) {
            container.innerHTML = `
                <div class="empty-state-hr">
                    <div class="empty-icon-hr">
                        <i class="bi bi-people"></i>
                    </div>
                    <div style="font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 600; color: #475569; margin-bottom: 8px;">
                        Chưa có nhân viên nào
                    </div>
                    <div style="font-family: 'Inter', sans-serif; font-size: 13px; color: #94a3b8;">
                        Thêm nhân viên mới để bắt đầu quản lý
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.employees.map(emp => `
            <div class="employee-card">
                <div style="display: flex; align-items: start; justify-content: space-between;">
                    <div style="display: flex; align-items: start; flex: 1;">
                        <div class="employee-avatar">
                            <i class="bi bi-person-fill"></i>
                        </div>
                        <div style="flex: 1;">
                            <div class="employee-name">${emp.fullName || emp.fullname}</div>
                            <div class="employee-role">${this.getRoleText(emp.role)}</div>
                            <div class="employee-meta">
                                <span><i class="bi bi-telephone"></i> ${emp.phone || 'N/A'}</span>
                                ${emp.plate ? `<span><i class="bi bi-truck"></i> ${emp.plate}</span>` : ''}
                            </div>
                            ${emp.baseSalary || emp.basesalary ? `
                                <div class="employee-salary">
                                    <i class="bi bi-cash"></i> ${(emp.baseSalary || emp.basesalary).toLocaleString('vi-VN')} VNĐ
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div>
                        <span class="status-badge ${emp.status === 'ACTIVE' ? '' : 'inactive'}">
                            ${emp.status === 'ACTIVE' ? '✓ Hoạt động' : '✕ Ngừng'}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    // Get role text
    getRoleText(role) {
        const roleMap = {
            'ADMIN': 'Quản trị',
            'DISPATCHER': 'Điều phối',
            'DRIVER': 'Tài xế',
            'ASSISTANT': 'Trợ lý',
            'WAREHOUSE': 'Nhân viên kho',
            'SALES': 'Kinh doanh',
            'MANAGER': 'Quản lý',
            'TESTER': 'Kiểm thử'
        };
        return roleMap[role] || role;
    },

    // Thêm nhân viên
    async addEmployee() {
        const data = {
            fullName: document.getElementById('emp-name').value.trim(),
            phone: document.getElementById('emp-phone').value.trim(),
            role: document.getElementById('emp-role').value,
            plate: document.getElementById('emp-plate').value.trim(),
            baseSalary: parseInt(document.getElementById('emp-salary').value) || 0
        };

        if (!data.fullName || !data.phone) {
            alert('Vui lòng nhập đầy đủ họ tên và số điện thoại!');
            return;
        }

        try {
            const response = await fetch('/api/hr/employees', {
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

            alert('✅ Thêm nhân viên thành công!');
            this.toggleAddForm();
            this.loadEmployees();

        } catch (error) {
            console.error('Error adding employee:', error);
            alert('Có lỗi xảy ra khi thêm nhân viên!');
        }
    }
};

// Đăng ký module
AppRouter.registerModule('hr', HRModule);
