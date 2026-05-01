-- ===============================================
-- SYSTEM ANNOUNCEMENTS TABLE
-- Admin can push announcements without redeploy
-- Frontend polls every 5 minutes to display banner
-- ===============================================

CREATE TABLE IF NOT EXISTS system_announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message TEXT NOT NULL,                           -- Content to display
    type VARCHAR(20) DEFAULT 'info',                 -- info | warning | danger | success
    is_active BOOLEAN DEFAULT true,                  -- Toggle on/off without deleting
    target_roles TEXT[] DEFAULT '{}',                 -- Empty = ALL roles, or specific roles like {'DRIVER','ADMIN'}
    created_by VARCHAR(100),                         -- Who created
    starts_at TIMESTAMPTZ DEFAULT NOW(),             -- When to start showing
    expires_at TIMESTAMPTZ,                          -- NULL = never expires
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quick lookup for active announcements
CREATE INDEX IF NOT EXISTS idx_announcements_active 
    ON system_announcements(is_active, starts_at, expires_at) 
    WHERE is_active = true;

-- Insert example (optional, remove in production)
-- INSERT INTO system_announcements (message, type, created_by) 
-- VALUES ('Hệ thống sẽ bảo trì lúc 22:00 tối nay.', 'warning', 'ADMIN');
