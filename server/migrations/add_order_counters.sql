-- ============================================
-- ORDER COUNTERS TABLE
-- Tracks sequential order numbers per month
-- Format: PREFIX + YY + MM + SEQ (3 digits)
-- Examples: E2603001, N2603005
-- ============================================

CREATE TABLE IF NOT EXISTS order_counters (
    counter_key TEXT PRIMARY KEY,  -- e.g., "E2603", "N2603"
    current_seq INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed counters for current month (March 2026)
-- Start from existing order count to avoid duplicates
-- Check existing local exports (X* orders) in March 2026
INSERT INTO order_counters (counter_key, current_seq, updated_at)
VALUES ('E2603', 0, NOW())
ON CONFLICT (counter_key) DO NOTHING;

INSERT INTO order_counters (counter_key, current_seq, updated_at)
VALUES ('N2603', 0, NOW())
ON CONFLICT (counter_key) DO NOTHING;

-- For April 2026 (auto-created by code, but prep just in case)
INSERT INTO order_counters (counter_key, current_seq, updated_at)
VALUES ('E2604', 0, NOW())
ON CONFLICT (counter_key) DO NOTHING;

INSERT INTO order_counters (counter_key, current_seq, updated_at)
VALUES ('N2604', 0, NOW())
ON CONFLICT (counter_key) DO NOTHING;
