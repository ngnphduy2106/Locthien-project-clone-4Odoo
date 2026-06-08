import 'dotenv/config';

/**
 * Config tập trung — đọc từ env một lần duy nhất.
 * Bất kỳ biến required nào thiếu sẽ throw ngay khi khởi động.
 */
function required(name) {
  const v = process.env[name];
  if (!v || v.trim() === '') throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

export const config = {
  odoo: {
    url:    required('ODOO_URL').replace(/\/+$/, ''),
    db:     required('ODOO_DB'),
    login:  required('ODOO_LOGIN'),
    apiKey: required('ODOO_API_KEY'),
  },
  webhook: {
    port:   Number.parseInt(process.env.PORT ?? '9000', 10),
    secret: required('WEBHOOK_SECRET'),
  },
  sync: {
    intervalMs: Number.parseInt(process.env.SYNC_INTERVAL_MS ?? '300000', 10),
  },
};
