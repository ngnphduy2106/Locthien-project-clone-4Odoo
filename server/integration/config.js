import 'dotenv/config';

/**
 * Config tập trung — đọc từ env một lần duy nhất.
 * Bất kỳ biến required nào thiếu sẽ throw ngay khi khởi động.
 */
function getEnv(name, isRequired = true) {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    if (isRequired) {
      console.warn(`⚠️ Warning: Missing required env: ${name}. Odoo integration might be disabled or fail at runtime.`);
    }
    return '';
  }
  return v.trim();
}

export const config = {
  odoo: {
    url:    getEnv('ODOO_URL').replace(/\/+$/, ''),
    db:     getEnv('ODOO_DB'),
    login:  getEnv('ODOO_LOGIN'),
    apiKey: getEnv('ODOO_API_KEY'),
  },
  webhook: {
    port:   Number.parseInt(process.env.PORT ?? '9000', 10),
    secret: getEnv('WEBHOOK_SECRET'),
  },
  sync: {
    intervalMs: Number.parseInt(process.env.SYNC_INTERVAL_MS ?? '300000', 10),
  },
};
