-- Cập nhật bảng users thêm cột telegram_username
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(255);
