-- =============================================
-- TEST ACCOUNTS FOR ALL ROLES
-- Password: test123 (plain text - hashed by app)
-- =============================================

INSERT INTO users (id, username, password, fullname, role, status, phone, basesalary, createdat)
VALUES
  -- 1. ADMIN - Full access: manage orders, users, HR, reports, confirm/approve
  ('TEST_ADMIN', 'test_admin', 'test123', 'Test Admin', 'ADMIN', 'ACTIVE', '0900000001', 0, NOW()),

  -- 2. SALES - Create/edit orders, confirm delivery, view reports (no HR)
  ('TEST_SALES', 'test_sales', 'test123', 'Test Sales', 'SALES', 'ACTIVE', '0900000002', 0, NOW()),

  -- 3. DRIVER - View assigned orders, complete delivery, upload proof images
  ('TEST_DRIVER', 'test_driver', 'test123', 'Test Tài Xế', 'DRIVER', 'ACTIVE', '0900000003', 0, NOW()),

  -- 4. DISPATCHER - Like admin but can't see money/prices
  ('TEST_DISPATCHER', 'test_dispatcher', 'test123', 'Test Điều Phối', 'DISPATCHER', 'ACTIVE', '0900000004', 0, NOW()),

  -- 5. ASSISTANT (Phụ xe) - Same as driver, assigned as helper
  ('TEST_ASSISTANT', 'test_assistant', 'test123', 'Test Phụ Xe', 'ASSISTANT', 'ACTIVE', '0900000005', 0, NOW())

ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  password = EXCLUDED.password,
  fullname = EXCLUDED.fullname,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  phone = EXCLUDED.phone;
