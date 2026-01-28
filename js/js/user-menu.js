// ===============================================
// USER MENU FUNCTIONS
// ===============================================

// Toggle user menu
function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    const overlay = document.getElementById('user-menu-overlay');

    if (menu.classList.contains('show')) {
        menu.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
    } else {
        menu.classList.add('show');
        if (overlay) overlay.classList.add('show');

        // Load user info from localStorage
        loadUserInfo();
        
        // Rebind menu items to ensure events work
        bindMenuItems();
    }
}

// Close user menu when clicking outside
document.addEventListener('click', function (event) {
    const userDropdown = document.querySelector('.user-dropdown');
    const menu = document.getElementById('user-menu');
    const menuItems = document.querySelectorAll('.user-menu-item');

    // Kiểm tra xem click có phải vào menu item không
    let isMenuItemClick = false;
    menuItems.forEach(item => {
        if (item.contains(event.target)) {
            isMenuItemClick = true;
        }
    });

    // Chỉ đóng menu nếu click bên ngoài dropdown VÀ không phải click vào menu item
    if (userDropdown && !userDropdown.contains(event.target) && !isMenuItemClick) {
        if (menu && menu.classList.contains('show')) {
            menu.classList.remove('show');
            const overlay = document.getElementById('user-menu-overlay');
            if (overlay) overlay.classList.remove('show');
        }
    }
});

// Load user info from localStorage
function loadUserInfo() {
    try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);

            // Update display name
            const nameEl = document.getElementById('user-display-name');
            if (nameEl) {
                nameEl.textContent = user.name || user.fullName || 'User';
            }

            // Update role
            const roleEl = document.getElementById('user-display-role');
            if (roleEl) {
                const roleMap = {
                    'ADMIN': 'Quản trị viên',
                    'DRIVER': 'Tài xế',
                    'WAREHOUSE': 'Nhân viên kho',
                    'SALES': 'Kinh doanh',
                    'MANAGER': 'Quản lý'
                };
                roleEl.textContent = roleMap[user.role] || user.role || 'Nhân viên';
            }
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Show profile page
function showProfile(event) {
    console.log('🔵 showProfile() được gọi');
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    alert('Tính năng "Thông tin cá nhân" đang được phát triển!');
    toggleUserMenu();
}

// Show settings page
function showSettings(event) {
    console.log('🔵 showSettings() được gọi');
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    alert('Tính năng "Cài đặt" đang được phát triển!');
    toggleUserMenu();
}

// Handle sign out - WITH CONFIRM DIALOG
function handleSignOut(event) {
    console.log('🔴 handleSignOut() được gọi');
    
    // Ngăn event propagation để không trigger close menu
    if (event) {
        event.preventDefault();
        event.stopPropagation();
        console.log('✅ Event đã được preventDefault và stopPropagation');
    } else {
        console.warn('⚠️ Không có event object được truyền vào');
    }
    
    // Close menu first
    const menu = document.getElementById('user-menu');
    const overlay = document.getElementById('user-menu-overlay');
    if (menu) {
        menu.classList.remove('show');
        console.log('✅ Menu đã được đóng');
    }
    if (overlay) {
        overlay.classList.remove('show');
        console.log('✅ Overlay đã được đóng');
    }
    
    // Show confirm dialog
    console.log('📋 Hiển thị confirm dialog...');
    if (!confirm('Bạn có chắc chắn muốn đăng xuất?')) {
        console.log('❌ User đã hủy logout');
        return; // User cancelled, do nothing
    }
    
    console.log('✅ User đã xác nhận logout');
    
    try {
        // Clear all localStorage
        localStorage.clear();
        console.log('✅ localStorage đã được xóa');

        // Also clear sessionStorage if any
        sessionStorage.clear();
        console.log('✅ sessionStorage đã được xóa');

        // Show login page instead of redirecting
        console.log('🔄 Hiển thị lại trang login...');
        if (typeof showLogin === 'function') {
            showLogin();
        } else {
            // Fallback: redirect if showLogin function doesn't exist
            window.location.replace('/dashboard.html');
        }
    } catch (error) {
        console.error('❌ Error during sign out:', error);
        // Fallback: redirect if there's an error
        window.location.replace('/dashboard.html');
    }
}

// Initialize user menu on page load
document.addEventListener('DOMContentLoaded', function () {
    console.log('📋 User menu đang được khởi tạo...');
    
    // Create overlay element if not exists
    if (!document.getElementById('user-menu-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'user-menu-overlay';
        overlay.className = 'user-menu-overlay';
        overlay.onclick = toggleUserMenu;
        document.body.appendChild(overlay);
        console.log('✅ Overlay element đã được tạo');
    } else {
        console.log('ℹ️ Overlay element đã tồn tại');
    }

    // Load user info initially
    loadUserInfo();
    
    // Bind event listeners to menu items
    bindMenuItems();
    
    console.log('✅ User menu đã được khởi tạo thành công');
    
    // Kiểm tra xem các functions có tồn tại không
    console.log('🔍 Kiểm tra functions:');
    console.log('  - toggleUserMenu:', typeof toggleUserMenu);
    console.log('  - showProfile:', typeof showProfile);
    console.log('  - showSettings:', typeof showSettings);
    console.log('  - handleSignOut:', typeof handleSignOut);
    console.log('  - loadUserInfo:', typeof loadUserInfo);
});

// Store bound state to avoid duplicate listeners
let menuItemsBound = false;

// Bind event listeners to menu items
function bindMenuItems() {
    // Only bind once
    if (menuItemsBound) {
        console.log('ℹ️ Menu items đã được bind rồi, bỏ qua');
        return;
    }
    
    console.log('🔗 Đang bind event listeners cho menu items...');
    
    // Find menu items by data-action attribute
    const profileItem = document.querySelector('.user-menu-item[data-action="profile"]');
    const settingsItem = document.querySelector('.user-menu-item[data-action="settings"]');
    const logoutItem = document.querySelector('.user-menu-item[data-action="logout"]');
    
    // Bind profile item
    if (profileItem) {
        profileItem.addEventListener('click', function(event) {
            console.log('🖱️ Click vào "Thông tin cá nhân"');
            event.preventDefault();
            event.stopPropagation();
            showProfile(event);
        });
        console.log('✅ Đã bind event cho "Thông tin cá nhân"');
    } else {
        console.warn('⚠️ Không tìm thấy menu item "Thông tin cá nhân"');
    }
    
    // Bind settings item
    if (settingsItem) {
        settingsItem.addEventListener('click', function(event) {
            console.log('🖱️ Click vào "Cài đặt"');
            event.preventDefault();
            event.stopPropagation();
            showSettings(event);
        });
        console.log('✅ Đã bind event cho "Cài đặt"');
    } else {
        console.warn('⚠️ Không tìm thấy menu item "Cài đặt"');
    }
    
    // Bind logout item
    if (logoutItem) {
        logoutItem.addEventListener('click', function(event) {
            console.log('🖱️ Click vào "Đăng xuất"');
            event.preventDefault();
            event.stopPropagation();
            handleSignOut(event);
        });
        console.log('✅ Đã bind event cho "Đăng xuất"');
    } else {
        console.warn('⚠️ Không tìm thấy menu item "Đăng xuất"');
    }
    
    menuItemsBound = true;
    console.log('✅ Tất cả menu items đã được bind event listeners');
}
