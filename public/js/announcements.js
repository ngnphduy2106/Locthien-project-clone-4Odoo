// ===============================================
// SYSTEM ANNOUNCEMENTS MODULE
// Polls server every 5 minutes for announcements
// Displays banner at top of app (no redeploy needed)
// ===============================================

const AnnouncementModule = {
    _pollInterval: null,
    _dismissedIds: new Set(), // Track dismissed announcements per session
    _lastFetchedIds: '',      // Detect changes to avoid unnecessary DOM updates

    /**
     * Start polling for announcements
     * Called after login
     */
    start() {
        // Initial fetch immediately
        this.fetch();

        // Poll every 5 minutes (300,000 ms)
        if (this._pollInterval) clearInterval(this._pollInterval);
        this._pollInterval = setInterval(() => this.fetch(), 5 * 60 * 1000);

        console.log('📢 Announcement polling started (every 5 min)');
    },

    /**
     * Stop polling
     */
    stop() {
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
        this.hide();
    },

    /**
     * Fetch active announcements from API
     */
    async fetch() {
        try {
            const session = JSON.parse(localStorage.getItem('LT_SESSION') || '{}');
            const role = session?.user?.role || '';

            const res = await fetch(`/api/system/announcement?role=${encodeURIComponent(role)}`, {
                cache: 'no-cache' // Bypass service worker cache
            });
            const data = await res.json();

            if (!data.error && data.announcements && data.announcements.length > 0) {
                // Filter out dismissed ones
                const visible = data.announcements.filter(a => !this._dismissedIds.has(a.id));

                if (visible.length > 0) {
                    // Check if content changed to avoid unnecessary re-renders
                    const newIds = visible.map(a => a.id).join(',');
                    if (newIds !== this._lastFetchedIds) {
                        this.render(visible);
                        this._lastFetchedIds = newIds;
                    }
                } else {
                    this.hide();
                }
            } else {
                this.hide();
            }
        } catch (e) {
            // Silently fail — don't disrupt the app
            console.log('📢 Announcement fetch skipped:', e.message);
        }
    },

    /**
     * Render announcement banners
     */
    render(announcements) {
        const container = document.getElementById('system-announcement-bar');
        if (!container) return;

        const typeConfig = {
            info: { icon: 'bi-info-circle-fill', bg: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff' },
            warning: { icon: 'bi-exclamation-triangle-fill', bg: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff' },
            danger: { icon: 'bi-exclamation-octagon-fill', bg: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff' },
            success: { icon: 'bi-check-circle-fill', bg: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }
        };

        container.innerHTML = announcements.map(a => {
            const cfg = typeConfig[a.type] || typeConfig.info;
            return `
                <div class="system-announcement" data-id="${a.id}" 
                     style="background:${cfg.bg}; color:${cfg.color}; padding:10px 16px; display:flex; align-items:center; gap:10px; font-size:14px; position:relative; animation: slideDown 0.3s ease;">
                    <i class="bi ${cfg.icon}" style="font-size:18px; flex-shrink:0;"></i>
                    <span style="flex:1; line-height:1.4;">${this._escapeHtml(a.message)}</span>
                    <button onclick="AnnouncementModule.dismiss('${a.id}')" 
                            style="background:none; border:none; color:${cfg.color}; opacity:0.8; cursor:pointer; padding:4px 8px; font-size:18px; flex-shrink:0;"
                            title="Đóng">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            `;
        }).join('');

        container.style.display = 'block';
    },

    /**
     * Dismiss a specific announcement (per session)
     */
    dismiss(id) {
        this._dismissedIds.add(id);

        // Remove the specific banner from DOM
        const banner = document.querySelector(`.system-announcement[data-id="${id}"]`);
        if (banner) {
            banner.style.animation = 'slideUp 0.3s ease forwards';
            setTimeout(() => {
                banner.remove();
                // Hide container if no more announcements
                const container = document.getElementById('system-announcement-bar');
                if (container && container.children.length === 0) {
                    container.style.display = 'none';
                }
            }, 300);
        }

        this._lastFetchedIds = ''; // Reset to allow re-render if admin re-enables
    },

    /**
     * Hide announcement bar
     */
    hide() {
        const container = document.getElementById('system-announcement-bar');
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
        this._lastFetchedIds = '';
    },

    /**
     * Escape HTML to prevent XSS
     */
    _escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
    }
};

// Add CSS animations via JS (avoids touching main CSS file)
(function() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { transform: translateY(-100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(0); opacity: 1; }
            to { transform: translateY(-100%); opacity: 0; }
        }
        .system-announcement + .system-announcement {
            border-top: 1px solid rgba(255,255,255,0.2);
        }
    `;
    document.head.appendChild(style);
})();

// Auto-start after login
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const session = localStorage.getItem('LT_SESSION');
        if (session) {
            AnnouncementModule.start();
        }
    }, 3000); // Delay 3s to not compete with critical app load
});

// Export globally
window.AnnouncementModule = AnnouncementModule;
