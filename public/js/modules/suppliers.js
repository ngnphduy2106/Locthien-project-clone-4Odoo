// ===============================================
// SUPPLIERS MODULE (Quản lý Nhà cung cấp)
// ===============================================

const SuppliersModule = {
    suppliers: [],
    filteredSuppliers: [],

    // Initialize module
    init() {
        console.log('📦 SuppliersModule initialized');
    },

    // Load suppliers from API
    // Check if current user is admin
    _isAdmin() {
        const role = (window.currentUser?.role || '').toLowerCase();
        return role === 'admin' || role === 'quản trị viên' || role === 'quản lý';
    },

    async loadSuppliers() {
        try {
            const tbody = document.getElementById('suppliers-table-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;"><i class="bi bi-hourglass-split"></i> Đang tải...</td></tr>';
            }

            // Hide add/import buttons for non-admin
            const addBtn = document.querySelector('[onclick*="SuppliersModule.showAddModal"]');
            const importBtn = document.querySelector('[onclick*="SuppliersModule.importFromSheet"]');
            if (!this._isAdmin()) {
                if (addBtn) addBtn.style.display = 'none';
                if (importBtn) importBtn.style.display = 'none';
            }

            const res = await api.getSuppliers();
            this.suppliers = res.data || [];
            this.filteredSuppliers = [...this.suppliers];
            this.renderTable();

            // Update stats
            const stats = document.getElementById('suppliers-stats');
            if (stats) {
                stats.textContent = `Tổng cộng: ${this.suppliers.length} nhà cung cấp`;
            }

            console.log(`✅ Loaded ${this.suppliers.length} suppliers`);
        } catch (e) {
            console.error('Load suppliers error:', e);
            showToast('Không thể tải danh sách nhà cung cấp', 'error');
        }
    },

    // Render table
    renderTable() {
        const tbody = document.getElementById('suppliers-table-body');
        if (!tbody) return;

        if (this.filteredSuppliers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:40px; color:#6B7280;">
                        <i class="bi bi-building" style="font-size:32px; display:block; margin-bottom:8px;"></i>
                        Chưa có nhà cung cấp nào
                    </td>
                </tr>
            `;
            return;
        }

        const isAdmin = this._isAdmin();
        tbody.innerHTML = this.filteredSuppliers.map((s, i) => `
            <tr>
                <td style="text-align:center; color:#6B7280;">${i + 1}</td>
                <td>
                    <div style="font-weight:600; color:var(--text-primary);">${this.escapeHtml(s.name)}</div>
                    ${s.note ? `<div style="font-size:12px; color:#6B7280;">${this.escapeHtml(s.note)}</div>` : ''}
                </td>
                <td style="color:#6B7280;">${s.address || '-'}</td>
                <td style="color:#6B7280;">${s.phone || '-'}</td>
                <td style="color:#6B7280;">${s.email || '-'}</td>
                ${isAdmin ? `<td style="text-align:center;">
                    <button class="btn-icon" onclick="SuppliersModule.showEditModal('${s.id}')" title="Sửa" style="color:#3B82F6;">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn-icon" onclick="SuppliersModule.confirmDelete('${s.id}', '${this.escapeHtml(s.name)}')" title="Xóa" style="color:#EF4444;">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>` : ''}
            </tr>
        `).join('');
    },

    // Filter suppliers
    filterSuppliers() {
        const search = document.getElementById('supplier-search')?.value?.toLowerCase() || '';

        this.filteredSuppliers = this.suppliers.filter(s => {
            return s.name?.toLowerCase().includes(search) ||
                s.address?.toLowerCase().includes(search) ||
                s.phone?.includes(search) ||
                s.email?.toLowerCase().includes(search);
        });

        this.renderTable();
    },

    // Show add modal
    showAddModal() {
        if (!this._isAdmin()) { alert('Chỉ Admin mới được thêm NCC!'); return; }
        document.getElementById('supplier-modal-title').textContent = 'Thêm Nhà cung cấp';
        document.getElementById('supplier-id').value = '';
        document.getElementById('supplier-name').value = '';
        document.getElementById('supplier-address').value = '';
        document.getElementById('supplier-phone').value = '';
        document.getElementById('supplier-email').value = '';
        document.getElementById('supplier-note').value = '';

        document.getElementById('modal-supplier').classList.remove('hidden');
    },

    // Show edit modal
    showEditModal(id) {
        if (!this._isAdmin()) { alert('Chỉ Admin mới được sửa NCC!'); return; }
        const supplier = this.suppliers.find(s => s.id === id);
        if (!supplier) {
            showToast('Không tìm thấy nhà cung cấp', 'error');
            return;
        }

        document.getElementById('supplier-modal-title').textContent = 'Sửa Nhà cung cấp';
        document.getElementById('supplier-id').value = supplier.id;
        document.getElementById('supplier-name').value = supplier.name || '';
        document.getElementById('supplier-address').value = supplier.address || '';
        document.getElementById('supplier-phone').value = supplier.phone || '';
        document.getElementById('supplier-email').value = supplier.email || '';
        document.getElementById('supplier-note').value = supplier.note || '';

        document.getElementById('modal-supplier').classList.remove('hidden');
    },

    // Close modal
    closeModal() {
        document.getElementById('modal-supplier').classList.add('hidden');
    },

    // Save supplier (create or update)
    async saveSupplier() {
        const id = document.getElementById('supplier-id').value;
        const name = document.getElementById('supplier-name').value.trim();
        const address = document.getElementById('supplier-address').value.trim();
        const phone = document.getElementById('supplier-phone').value.trim();
        const email = document.getElementById('supplier-email').value.trim();
        const note = document.getElementById('supplier-note').value.trim();

        if (!name) {
            showToast('Vui lòng nhập tên nhà cung cấp', 'warning');
            document.getElementById('supplier-name').focus();
            return;
        }

        try {
            showLoading('Đang lưu...');

            const data = { name, address, phone, email, note };
            let res;

            if (id) {
                // Update
                res = await api.updateSupplier(id, data);
            } else {
                // Create
                res = await api.createSupplier(data);
            }

            hideLoading();

            if (res.error) {
                showToast(res.message || 'Có lỗi xảy ra', 'error');
                return;
            }

            showToast(res.message || 'Lưu thành công!', 'success');
            this.closeModal();
            this.loadSuppliers();

        } catch (e) {
            hideLoading();
            console.error('Save supplier error:', e);
            showToast('Không thể lưu nhà cung cấp', 'error');
        }
    },

    // Confirm delete
    confirmDelete(id, name) {
        if (!this._isAdmin()) { alert('Chỉ Admin mới được xóa NCC!'); return; }
        if (confirm(`Bạn có chắc muốn xóa nhà cung cấp "${name}"?`)) {
            this.deleteSupplier(id);
        }
    },

    // Delete supplier
    async deleteSupplier(id) {
        try {
            showLoading('Đang xóa...');

            const res = await api.deleteSupplier(id);

            hideLoading();

            if (res.error) {
                showToast(res.message || 'Không thể xóa', 'error');
                return;
            }

            showToast('Xóa thành công!', 'success');
            this.loadSuppliers();

        } catch (e) {
            hideLoading();
            console.error('Delete supplier error:', e);
            showToast('Không thể xóa nhà cung cấp', 'error');
        }
    },

    // Import from Google Sheet
    async importFromSheet() {
        if (!confirm('Import nhà cung cấp từ Google Sheet?\n\nLưu ý: Các NCC trùng tên sẽ được bỏ qua.')) {
            return;
        }

        try {
            showLoading('Đang import...');

            const res = await api.importSuppliersFromSheet();

            hideLoading();

            if (res.error) {
                showToast(res.message || 'Lỗi khi import', 'error');
                return;
            }

            showToast(res.message || 'Import thành công!', 'success');
            this.loadSuppliers();

        } catch (e) {
            hideLoading();
            console.error('Import error:', e);
            showToast('Không thể import từ Sheet', 'error');
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
window.SuppliersModule = SuppliersModule;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    SuppliersModule.init();
});
