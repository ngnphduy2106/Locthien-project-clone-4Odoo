// ===============================================
// APP ROUTER - Quản lý điều hướng giữa các modules
// ===============================================

const AppRouter = {
    currentModule: null,
    modules: {},

    // Đăng ký module
    registerModule(name, module) {
        this.modules[name] = module;
    },

    // Chuyển đến module
    navigateTo(moduleName) {
        // Ẩn tất cả modules
        Object.keys(this.modules).forEach(name => {
            const moduleElement = document.getElementById(`module-${name}`);
            if (moduleElement) {
                moduleElement.classList.add('hidden');
            }
        });

        // Hiển thị module được chọn
        const targetModule = document.getElementById(`module-${moduleName}`);
        if (targetModule) {
            targetModule.classList.remove('hidden');
            this.currentModule = moduleName;

            // Cập nhật active menu
            this.updateActiveMenu(moduleName);

            // Gọi hàm init của module nếu có
            if (this.modules[moduleName] && this.modules[moduleName].init) {
                this.modules[moduleName].init();
            }

            // Cập nhật breadcrumb
            this.updateBreadcrumb(moduleName);
        }
    },

    // Cập nhật menu active
    updateActiveMenu(moduleName) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });

        const activeMenuItem = document.querySelector(`[data-module="${moduleName}"]`);
        if (activeMenuItem) {
            activeMenuItem.classList.add('active');
        }
    },

    // Cập nhật breadcrumb
    updateBreadcrumb(moduleName) {
        const breadcrumbTitle = document.querySelector('.breadcrumb-title');
        const moduleNames = {
            'dashboard': 'Tổng quan',
            'orders': 'Quản lý đơn hàng',
            'create-order': 'Quản lý đơn hàng',  // Sub-module của Quản lý đơn hàng
            'dispatch': 'Quản lý đơn hàng',      // Sub-module của Quản lý đơn hàng
            'my-orders': 'Quản lý đơn hàng',     // Sub-module của Quản lý đơn hàng
            'hr': 'Nhân sự',
            'materials': 'Vật tư',               // Thêm Vật tư
            'warehouse': 'Kho hàng',
            'order-history': 'Lịch sử đơn hàng'
        };

        if (breadcrumbTitle) {
            breadcrumbTitle.textContent = moduleNames[moduleName] || 'Tổng quan';
        }
    },

    // Khởi tạo router
    init() {
        // Load module mặc định
        this.navigateTo('dashboard');
    }
};

// Toggle Sidebar (Mobile)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('mobile-open');
}

// Toggle Submenu
function toggleSubmenu(id) {
    const submenu = document.getElementById('submenu-' + id);
    const menuItem = event.currentTarget;

    if (submenu.classList.contains('show')) {
        submenu.classList.remove('show');
        menuItem.classList.remove('expanded');
    } else {
        // Close all other submenus
        document.querySelectorAll('.submenu').forEach(s => s.classList.remove('show'));
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('expanded'));

        submenu.classList.add('show');
        menuItem.classList.add('expanded');
    }
}
