-- ===============================================
-- INSERT USER ACCOUNTS FOR LỘC THIÊN SCM
-- Run Date: 2026-02-05
-- ASSISTANT role = like DRIVER but no plate
-- ===============================================

-- First, clear existing users (optional - uncomment if needed)
-- DELETE FROM users;

-- Insert all accounts
INSERT INTO users (id, username, password, fullname, role, plate, status, phone, basesalary) VALUES
  -- ADMINS
  ('admin', 'admin', '123456', 'Quản Trị Viên', 'ADMIN', NULL, 'ACTIVE', 'admin', 20000000),
  ('0946290290', '0946290290', '123456', 'Nguyễn Hà My', 'ADMIN', '51LD-197.09', 'ACTIVE', '0946290290', 20000000),
  ('0941222840', '0941222840', '123456', 'Đức Anh', 'ADMIN', NULL, 'ACTIVE', '0941222840', 20000000),
  ('0979891929', '0979891929', '123456', 'Không', 'ADMIN', NULL, 'ACTIVE', '0979891929', 20000000),

  -- ASSISTANTS (like drivers but no plate)
  ('0377252109', '0377252109', '123456', 'Trần Trọng Nghĩa', 'ASSISTANT', NULL, 'ACTIVE', '0377252109', 12000000),
  ('0343979151', '0343979151', '123456', 'Nguyễn Thái Hoà', 'ASSISTANT', NULL, 'ACTIVE', '0343979151', 12000000),
  ('0372403361', '0372403361', '123456', 'Lê Kim Công', 'ASSISTANT', NULL, 'ACTIVE', '0372403361', 12000000),
  ('0899585319', '0899585319', '123456', 'Phạm Hồng Hà', 'ASSISTANT', NULL, 'ACTIVE', '0899585319', 12000000),
  ('0921024038', '0921024038', '123456', 'Lê Văn Chiến', 'ASSISTANT', NULL, 'ACTIVE', '0921024038', 12000000),
  ('0336073637', '0336073637', '123456', 'Nguyễn Tấn Duy', 'ASSISTANT', NULL, 'ACTIVE', '0336073637', 12000000),
  ('0931226811', '0931226811', '123456', 'Trần Duy Tâm', 'ASSISTANT', NULL, 'ACTIVE', '0931226811', 12000000),

  -- DRIVERS (with plate)
  ('0961418261', '0961418261', '123456', 'Phan Đình Phi', 'DRIVER', '51D-991.03', 'ACTIVE', '0961418261', 15000000),
  ('0898463398', '0898463398', '123456', 'Trương Quang Hiền', 'DRIVER', '51L-697.62', 'ACTIVE', '0898463398', 15000000),
  ('0982180337', '0982180337', '123456', 'Ngô Đình Chiến', 'DRIVER', '51M-440.53', 'ACTIVE', '0982180337', 15000000),
  ('0967411763', '0967411763', '123456', 'Đoàn Văn Báu', 'DRIVER', '50H-260.87', 'ACTIVE', '0967411763', 15000000),
  ('0364666337', '0364666337', '123456', 'Ngô Quang Đạt', 'DRIVER', '51C-96.997', 'ACTIVE', '0364666337', 15000000),
  ('0342709036', '0342709036', '123456', 'Nguyễn Quốc Phụng', 'DRIVER', '51D-398.74', 'ACTIVE', '0342709036', 15000000),
  ('0383086910', '0383086910', '123456', 'Đoàn Văn Quý', 'DRIVER', '50H-232.92', 'ACTIVE', '0383086910', 15000000),
  ('0911614444', '0911614444', '123456', 'Khác', 'DRIVER', NULL, 'ACTIVE', '0911614444', 15000000),

  -- TESTERS
  ('0946329329', '0946329329', '123456', 'Lê Kim Chức', 'TESTER', NULL, 'ACTIVE', '0946329329', 10000000),
  ('974088973', '974088973', '123456', 'Huỳnh Hương', 'TESTER', NULL, 'ACTIVE', '974088973', 10000000),
  ('0936351147', '0936351147', '123456', 'Cầm Tiên', 'TESTER', NULL, 'ACTIVE', '0936351147', 10000000)

ON CONFLICT (id) DO UPDATE SET
  fullname = EXCLUDED.fullname,
  role = EXCLUDED.role,
  plate = EXCLUDED.plate,
  status = EXCLUDED.status;

-- Verify counts by role
SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role;
