# 🏭 LỘC THIÊN ERP - Hệ Thống Quản Lý Kho Vận Hóa Chất

> **Version 2.0** | Node.js + Express + Supabase + MISA CRM Integration

Hệ thống ERP toàn diện quản lý kho vận cho công ty kinh doanh hóa chất công nghiệp Lộc Thiên.

---

## 📋 Mục Lục

- [Tổng Quan Hệ Thống](#-tổng-quan-hệ-thống)
- [Danh Sách Chức Năng](#-danh-sách-chức-năng)
- [Tech Stack](#️-tech-stack)
- [Cài Đặt & Khởi Động](#-cài-đặt--khởi-động)
- [Cấu Trúc Dự Án](#-cấu-trúc-dự-án)
- [API Endpoints](#-api-endpoints)
- [Tài Khoản Demo](#-tài-khoản-demo)

---

## 🎯 Tổng Quan Hệ Thống

Lộc Thiên ERP là giải pháp quản lý toàn diện cho ngành kinh doanh hóa chất, với các module chính:

| Module | Mô tả |
|--------|-------|
| **Dashboard** | Tổng quan thương mại, biểu đồ thống kê, Top sản phẩm/khách hàng |
| **Điều phối đơn hàng** | Quản lý đơn xuất/nhập, gán tài xế, theo dõi trạng thái |
| **Tài xế** | App mobile-first cho tài xế, nhận/giao đơn |
| **Chat & Thông báo** | Chat realtime theo đơn hàng, push notifications |
| **Nhân sự** | Quản lý nhân viên, tài khoản hệ thống |
| **Kho hàng** | Quản lý vật tư, tồn kho |
| **Tích hợp MISA** | Đồng bộ 2 chiều với MISA CRM |

---

## 🚀 Danh Sách Chức Năng

### 1. 📊 Dashboard (Tổng Quan)
- ✅ Thống kê số lượng đơn hàng theo thời gian (hôm nay, tuần, tháng, năm, tất cả)
- ✅ Biểu đồ số lượng đơn hàng theo thời gian
- ✅ Biểu đồ giá trị đơn hàng theo thời gian
- ✅ Top 5 sản phẩm bán chạy
- ✅ Top 5 khách hàng
- ✅ Top 5 tài xế
- ✅ Thống kê đơn chờ xử lý, đang giao, hoàn thành

### 2. 📦 Quản Lý Đơn Hàng Xuất (Export Orders)
- ✅ **Đồng bộ MISA CRM**: Tự động sync đơn hàng từ MISA
- ✅ **Danh sách đơn hàng**: Filter theo trạng thái (Chờ xử lý, Đang giao, Hoàn thành)
- ✅ **Tìm kiếm đơn hàng**: Theo mã đơn, tên khách hàng, địa chỉ
- ✅ **Lọc theo ngày**: Filter đơn hàng theo ngày cụ thể
- ✅ **Chi tiết đơn hàng**: Xem thông tin khách hàng, sản phẩm, giá trị
- ✅ **Gán tài xế**: Chọn tài xế giao hàng cho đơn
- ✅ **Chỉnh sửa số lượng**: Điều chỉnh số lượng sản phẩm thực tế
- ✅ **Vật phẩm cục bộ**: Thêm vỏ can/phuy/tank (không sync MISA)
- ✅ **Hủy đơn**: Đánh dấu đơn hàng bị hủy (soft delete)
- ✅ **Ảnh chứng minh giao hàng**: Upload và xem ảnh proof delivery
- ✅ **Xóa ảnh chứng minh**: Admin có thể xóa ảnh đã upload

### 3. 📥 Quản Lý Đơn Hàng Nhập (Import Tickets)
- ✅ **Tạo phiếu nhập**: Nhập hàng từ nhà cung cấp
- ✅ **Danh sách phiếu nhập**: Xem tất cả phiếu theo trạng thái
- ✅ **Gán tài xế**: Phân công tài xế lấy hàng
- ✅ **Bắt đầu vận chuyển**: Tài xế bắt đầu lấy hàng
- ✅ **Hoàn thành phiếu**: Xác nhận đã nhận hàng với số lượng thực tế
- ✅ **Tính giá/VAT**: Tự động tính thành tiền và thuế VAT
- ✅ **Ảnh chứng minh**: Upload ảnh xác nhận nhận hàng
- ✅ **Xóa ảnh chứng minh**: Admin xóa ảnh (có xác nhận)

### 4. 🚚 Tài Xế (Driver App)
- ✅ **Đơn của tôi**: Xem danh sách đơn được gán
- ✅ **Nhận đơn**: Xác nhận bắt đầu giao hàng
- ✅ **Hoàn thành đơn**: Xác nhận giao hàng thành công với số lượng thực tế
- ✅ **Upload ảnh**: Chụp ảnh chứng minh giao hàng
- ✅ **Badge đơn mới**: Thông báo số đơn chờ nhận
- ✅ **Giới hạn menu**: Chỉ hiển thị menu cần thiết cho tài xế

### 5. 💬 Chat & Thông Báo
- ✅ **Chat theo đơn hàng**: Nhắn tin realtime trong từng đơn
- ✅ **Chat phiếu nhập**: Nhắn tin cho phiếu nhập
- ✅ **Gửi hình ảnh**: Upload ảnh trong chat
- ✅ **Badge tin chưa đọc**: Hiển thị số tin nhắn mới
- ✅ **Đánh dấu đã đọc**: Tự động đánh dấu khi xem chat
- ✅ **Push Notifications**: Thông báo đẩy cho tài xế khi có đơn mới (Firebase)
- ✅ **Telegram Alerts**: Thông báo tự động qua Telegram Bot

### 6. 📜 Lịch Sử Đơn Hàng
- ✅ **Xem lịch sử**: Danh sách tất cả đơn hàng đã hoàn thành/hủy
- ✅ **Toggle View**: Chuyển đổi giữa Card view và Table view
- ✅ **Phân trang**: Pagination cho danh sách dài
- ✅ **Tìm kiếm**: Tìm kiếm trong lịch sử
- ✅ **Lọc theo ngày**: Filter theo ngày cụ thể
- ✅ **Chi tiết đơn**: Xem chi tiết đơn hàng cũ

### 7. 👥 Quản Lý Tài Khoản (Admin Only)
- ✅ **Danh sách tài khoản**: Xem tất cả user trong hệ thống
- ✅ **Tạo tài khoản**: Thêm nhân viên/tài xế mới
- ✅ **Chỉnh sửa tài khoản**: Cập nhật thông tin, role, biển số xe
- ✅ **Đổi mật khẩu**: Reset password cho user
- ✅ **Thống kê**: Số lượng theo vai trò (Admin, Driver, Staff)

### 8. 🏢 Quản Lý Nhân Sự
- ✅ **Danh sách nhân viên**: Xem tất cả nhân viên
- ✅ **Thêm nhân viên**: Tạo hồ sơ nhân viên mới
- ✅ **Cập nhật nhân viên**: Chỉnh sửa thông tin

### 9. 📦 Quản Lý Vật Tư
- ✅ **Danh sách vật tư**: Xem tất cả sản phẩm/vật tư
- ✅ **Thêm vật tư**: Tạo sản phẩm mới
- ✅ **Cập nhật vật tư**: Chỉnh sửa thông tin sản phẩm
- ✅ **Đơn vị tính**: Hỗ trợ Kg, Lít, Can, Phuy, Tank, Tấn

### 10. 🏭 Quản Lý Kho Hàng
- ✅ **Danh sách kho**: Xem các kho hàng
- ✅ **Tồn kho**: Xem số lượng tồn theo kho
- ✅ **Cảnh báo**: Thông báo sản phẩm sắp hết
- ✅ **Chuyển kho**: Chuyển hàng giữa các kho

### 11. 📊 Báo Cáo
- ✅ **Báo cáo tồn kho**: Thống kê tồn kho
- ✅ **Báo cáo tổng hợp**: Summary các chỉ số
- ✅ **Dashboard stats**: Dữ liệu cho dashboard

### 12. 🔗 Tích Hợp
- ✅ **MISA CRM**: Đồng bộ 2 chiều đơn hàng, cập nhật trạng thái
- ✅ **Supabase**: Database realtime
- ✅ **Firebase**: Push notifications
- ✅ **Telegram Bot**: Thông báo tự động
- ✅ **Netlify Functions**: Serverless deployment

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript, Bootstrap Icons |
| **Backend** | Node.js, Express.js |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Custom authentication với phone number |
| **CRM** | MISA CRM API Integration |
| **Notifications** | Firebase Cloud Messaging, Telegram Bot |
| **Hosting** | Netlify (Serverless Functions) |

---

## 📦 Cài Đặt & Khởi Động

### Prerequisites
- Node.js v18+
- npm hoặc yarn
- Supabase account
- MISA CRM API credentials (optional)

### Installation

```bash
# Clone repository
git clone https://gitlab.com/locthien-group/Locthien-project.git
cd Locthien-project

# Cài đặt dependencies
npm install

# Copy environment file
cp .env.example .env
# Chỉnh sửa .env với credentials của bạn

# Chạy development server
npm run dev

# Mở browser: http://localhost:3000
```

### Environment Variables

```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
SUPABASE_SERVICE_KEY=your_service_key

# MISA CRM
MISA_API_URL=your_misa_api_url
MISA_ACCESS_CODE=your_access_code
MISA_COMPANY_CODE=your_company_code

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Firebase
FIREBASE_PROJECT_ID=your_project_id
```

---

## 📁 Cấu Trúc Dự Án

```
loc-thien-scm/
├── package.json                    # Dependencies
├── .env.example                    # Environment template
├── server/                         # ⚙️ Backend (Express.js)
│   ├── index.js                    # Server entry point
│   ├── config.js                   # Configuration
│   ├── db/
│   │   ├── index.js                # Database abstraction
│   │   ├── supabase.js             # Supabase client
│   │   └── firebase.js             # Firebase config
│   ├── routes/
│   │   ├── auth.js                 # Authentication API
│   │   ├── orders.js               # Orders (Export) API
│   │   ├── imports.js              # Import Tickets API
│   │   ├── chat.js                 # Chat/Messaging API
│   │   ├── hr.js                   # HR API
│   │   ├── materials.js            # Materials API
│   │   ├── warehouse.js            # Warehouse API
│   │   ├── reports.js              # Reports API
│   │   └── webhooks.js             # Webhook handlers
│   ├── services/
│   │   ├── misa.js                 # MISA CRM integration
│   │   ├── telegram.js             # Telegram notifications
│   │   └── firebase.js             # Push notifications
│   └── migrations/                 # SQL migrations
├── public/                         # 🎨 Frontend (Static files)
│   ├── index.html                  # Single-page app
│   ├── css/
│   │   └── styles.css              # Custom styles
│   └── js/
│       ├── core.js                 # Core utilities
│       ├── api.js                  # API client
│       ├── app.js                  # Main application
│       ├── app-router.js           # SPA router
│       ├── notifications.js        # Push notification handler
│       └── modules/
│           ├── dispatch.js         # Order dispatch module
│           ├── my-orders.js        # Driver orders module
│           └── order-history.js    # Order history module
├── functions/                      # Netlify serverless functions
└── src/                            # (Legacy) Google Apps Script code
```

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/register` | Tạo tài khoản |
| GET | `/api/auth/users` | Danh sách tài khoản |
| PUT | `/api/auth/users/:id` | Cập nhật tài khoản |

### Orders (Export)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | Danh sách đơn hàng |
| GET | `/api/orders/:id` | Chi tiết đơn hàng |
| GET | `/api/orders/my/:driverName` | Đơn của tài xế |
| PUT | `/api/orders/:id` | Cập nhật đơn hàng |
| PUT | `/api/orders/:id/assign` | Gán tài xế |
| PUT | `/api/orders/:id/start` | Bắt đầu giao |
| PUT | `/api/orders/:id/complete` | Hoàn thành đơn |
| PUT | `/api/orders/:id/cancel` | Hủy đơn |
| POST | `/api/orders/:id/proof-images` | Upload ảnh chứng minh |
| DELETE | `/api/orders/:id/proof-images/:imgId` | Xóa ảnh |
| POST | `/api/orders/sync-misa` | Force sync MISA |

### Import Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/imports` | Danh sách phiếu nhập |
| POST | `/api/imports` | Tạo phiếu nhập |
| PUT | `/api/imports/:id` | Cập nhật phiếu |
| PUT | `/api/imports/:id/assign` | Gán tài xế |
| PUT | `/api/imports/:id/start` | Bắt đầu lấy hàng |
| PUT | `/api/imports/:id/complete` | Hoàn thành phiếu |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/:id/messages` | Lấy tin nhắn |
| POST | `/api/chat/:id/messages` | Gửi tin nhắn |
| GET | `/api/chat/unread-counts` | Số tin chưa đọc |
| POST | `/api/chat/:id/mark-read` | Đánh dấu đã đọc |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/dashboard` | Dashboard stats |
| GET | `/api/reports/inventory` | Báo cáo tồn kho |
| GET | `/api/reports/summary` | Báo cáo tổng hợp |

---

## 🔑 Tài Khoản Demo

| Username | Password | Role | Mô tả |
|----------|----------|------|-------|
| 0901234567 | 234567 | ADMIN | Quản trị viên |
| 0909876543 | 876543 | DRIVER | Tài xế |
| 0905555555 | 555555 | STAFF | Nhân viên |

---

## 📝 Changelog

### v2.1.0 (2026-01-31)
- ✨ Thêm toggle Card/Table view cho Lịch sử đơn hàng
- ✨ Thêm chức năng xóa ảnh chứng minh
- ✨ Thêm ảnh chứng minh cho Phiếu nhập
- 🐛 Fix hiển thị user trong quản lý tài khoản

### v2.0.0 (2026-01)
- 🚀 Chuyển đổi từ Google Apps Script sang Node.js
- ✨ Thêm Push Notifications (Firebase)
- ✨ Thêm Telegram alerts
- ✨ Tích hợp MISA CRM 2 chiều
- ✨ Thêm Chat realtime

### v1.0.0 (2025)
- 🎉 Initial release với Google Apps Script

---

## 👥 Team

**Lộc Thiên Dev Team** - 2025-2026

---

## 📄 License

MIT License - Copyright © 2026 Lộc Thiên Chemical Company
