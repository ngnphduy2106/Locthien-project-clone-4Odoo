// ===============================================
// CUSTOMERS MODULE (Quản lý Khách hàng)
// ===============================================

const CustomersModule = {
    customers: [],
    filteredCustomers: [],

    // Initialize module
    init() {
        console.log('👥 CustomersModule initialized');
    },

    // Load customers from API
    // Check if current user is admin
    _isAdmin() {
        const role = (window.currentUser?.role || '').toLowerCase();
        return role === 'admin' || role === 'quản trị viên' || role === 'quản lý';
    },

    async loadCustomers() {
        try {
            const tbody = document.getElementById('customers-table-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;"><i class="bi bi-hourglass-split"></i> Đang tải...</td></tr>';
            }

            // Hide add/import buttons for non-admin
            const addBtn = document.querySelector('[onclick*="CustomersModule.showAddModal"]');
            const importBtn = document.querySelector('[onclick*="CustomersModule.importFromSheet"]');
            if (!this._isAdmin()) {
                if (addBtn) addBtn.style.display = 'none';
                if (importBtn) importBtn.style.display = 'none';
            }

            const res = await api.getCustomers();
            this.customers = res.data || [];
            this.filteredCustomers = [...this.customers];
            this.renderTable();

            // Update stats
            const stats = document.getElementById('customers-stats');
            if (stats) {
                stats.textContent = `Tổng cộng: ${this.customers.length} khách hàng`;
            }

            console.log(`✅ Loaded ${this.customers.length} customers`);
        } catch (e) {
            console.error('Load customers error:', e);
            showToast('Không thể tải danh sách khách hàng', 'error');
        }
    },

    // Render table
    renderTable() {
        const tbody = document.getElementById('customers-table-body');
        if (!tbody) return;

        if (this.filteredCustomers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:40px; color:#6B7280;">
                        <i class="bi bi-people" style="font-size:32px; display:block; margin-bottom:8px;"></i>
                        Chưa có khách hàng nào
                    </td>
                </tr>
            `;
            return;
        }

        const isAdmin = this._isAdmin();
        tbody.innerHTML = this.filteredCustomers.map((c, i) => `
            <tr>
                <td style="text-align:center; color:#6B7280;">${i + 1}</td>
                <td>
                    <div style="font-weight:600; color:var(--text-primary);">${this.escapeHtml(c.name)}</div>
                    ${c.note ? `<div style="font-size:12px; color:#6B7280;">${this.escapeHtml(c.note)}</div>` : ''}
                </td>
                <td style="color:#6B7280;">${c.address || '-'}</td>
                <td style="color:#6B7280;">${c.phone || '-'}</td>
                <td style="color:#6B7280;">${c.email || '-'}</td>
                ${isAdmin ? `<td style="text-align:center;">
                    <button class="btn-icon" onclick="CustomersModule.showEditModal('${c.id}')" title="Sửa" style="color:#3B82F6;">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn-icon" onclick="CustomersModule.confirmDelete('${c.id}', '${this.escapeHtml(c.name)}')" title="Xóa" style="color:#EF4444;">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>` : ''}
            </tr>
        `).join('');
    },

    // Filter customers
    filterCustomers() {
        const search = document.getElementById('customer-search')?.value?.toLowerCase() || '';

        this.filteredCustomers = this.customers.filter(c => {
            return c.name?.toLowerCase().includes(search) ||
                c.address?.toLowerCase().includes(search) ||
                c.phone?.includes(search) ||
                c.email?.toLowerCase().includes(search);
        });

        this.renderTable();
    },

    // Show add modal
    showAddModal() {
        if (!this._isAdmin()) { alert('Chỉ Admin mới được thêm khách hàng!'); return; }
        document.getElementById('customer-modal-title').textContent = 'Thêm Khách hàng';
        document.getElementById('customer-id').value = '';
        document.getElementById('customer-name').value = '';
        document.getElementById('customer-address').value = '';
        document.getElementById('customer-phone').value = '';
        document.getElementById('customer-email').value = '';
        document.getElementById('customer-note').value = '';

        document.getElementById('modal-customer').classList.remove('hidden');
    },

    // Show edit modal
    showEditModal(id) {
        if (!this._isAdmin()) { alert('Chỉ Admin mới được sửa khách hàng!'); return; }
        const customer = this.customers.find(c => c.id === id);
        if (!customer) {
            showToast('Không tìm thấy khách hàng', 'error');
            return;
        }

        document.getElementById('customer-modal-title').textContent = 'Sửa Khách hàng';
        document.getElementById('customer-id').value = customer.id;
        document.getElementById('customer-name').value = customer.name || '';
        document.getElementById('customer-address').value = customer.address || '';
        document.getElementById('customer-phone').value = customer.phone || '';
        document.getElementById('customer-email').value = customer.email || '';
        document.getElementById('customer-note').value = customer.note || '';

        document.getElementById('modal-customer').classList.remove('hidden');
    },

    // Close modal
    closeModal() {
        document.getElementById('modal-customer').classList.add('hidden');
    },

    // Save customer (create or update)
    async saveCustomer() {
        const id = document.getElementById('customer-id').value;
        const name = document.getElementById('customer-name').value.trim();
        const address = document.getElementById('customer-address').value.trim();
        const phone = document.getElementById('customer-phone').value.trim();
        const email = document.getElementById('customer-email').value.trim();
        const note = document.getElementById('customer-note').value.trim();

        if (!name) {
            showToast('Vui lòng nhập tên khách hàng', 'warning');
            document.getElementById('customer-name').focus();
            return;
        }

        try {
            showLoading('Đang lưu...');

            const data = { name, address, phone, email, note };
            let res;

            if (id) {
                // Update
                res = await api.updateCustomer(id, data);
            } else {
                // Create
                res = await api.createCustomer(data);
            }

            hideLoading();

            if (res.error) {
                showToast(res.message || 'Có lỗi xảy ra', 'error');
                return;
            }

            showToast(res.message || 'Lưu thành công!', 'success');
            this.closeModal();
            this.loadCustomers();

        } catch (e) {
            hideLoading();
            console.error('Save customer error:', e);
            showToast('Không thể lưu khách hàng', 'error');
        }
    },

    // Confirm delete
    confirmDelete(id, name) {
        if (!this._isAdmin()) { alert('Chỉ Admin mới được xóa khách hàng!'); return; }
        if (confirm(`Bạn có chắc muốn xóa khách hàng "${name}"?`)) {
            this.deleteCustomer(id);
        }
    },

    // Delete customer
    async deleteCustomer(id) {
        try {
            showLoading('Đang xóa...');

            const res = await api.deleteCustomer(id);

            hideLoading();

            if (res.error) {
                showToast(res.message || 'Không thể xóa', 'error');
                return;
            }

            showToast('Xóa thành công!', 'success');
            this.loadCustomers();

        } catch (e) {
            hideLoading();
            console.error('Delete customer error:', e);
            showToast('Không thể xóa khách hàng', 'error');
        }
    },

    // Import from Google Sheet
    async importFromSheet() {
        if (!confirm('Bạn có chắc muốn import khách hàng từ Google Sheet?\n\nCác khách hàng mới sẽ được thêm vào danh sách.')) {
            return;
        }

        try {
            showLoading('Đang import từ Google Sheet...');

            const res = await api.importCustomersFromSheet();

            hideLoading();

            if (res.error) {
                showToast(res.message || 'Không thể import', 'error');
                return;
            }

            showToast(res.message || 'Import thành công!', 'success');
            this.loadCustomers();

        } catch (e) {
            hideLoading();
            console.error('Import customers error:', e);
            showToast('Không thể import khách hàng', 'error');
        }
    },

    // Escape HTML
    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};

// Make globally available
window.CustomersModule = CustomersModule;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    CustomersModule.init();
});
