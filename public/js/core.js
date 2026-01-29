// ===============================================
// CORE.JS - Global Utilities & State
// ===============================================

// === DOM Helpers ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// === Show/Hide Helpers ===
function show(el) {
    if (typeof el === 'string') el = $(el);
    if (el) el.classList.remove('hidden');
}

function hide(el) {
    if (typeof el === 'string') el = $(el);
    if (el) el.classList.add('hidden');
}

// === Loading Overlay ===
function showLoading(text = 'Đang xử lý...') {
    const loading = $('#loading');
    const loadTxt = $('#load-txt');
    if (loading) {
        loading.classList.remove('hidden');
        if (loadTxt) loadTxt.textContent = text;
    }
}

function hideLoading() {
    const loading = $('#loading');
    if (loading) loading.classList.add('hidden');
}

// === Toast Notification ===
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <i class="bi ${type === 'success' ? 'bi-check-circle' : type === 'error' ? 'bi-x-circle' : 'bi-info-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// === Number Formatting ===
function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return '0';
    return Number(num).toLocaleString('vi-VN');
}

// === Mobile Menu Functions ===
function toggleMobileMenu() {
    const sidebar = $('.sidebar');
    const overlay = $('.sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

function closeMobileMenu() {
    const sidebar = $('.sidebar');
    const overlay = $('.sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
}

// === Export to Window ===
window.$ = $;
window.$$ = $$;
window.show = show;
window.hide = hide;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showToast = showToast;
window.formatNumber = formatNumber;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;


console.log('✅ Core.js loaded');
