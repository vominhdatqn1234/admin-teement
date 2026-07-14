# Teement Admin Portal — Hướng dẫn chạy

Project admin **riêng biệt** nằm trong `admin-portal/`, quản lý seller của portal chính. Dùng chung `node_modules` của project cha nên **không cần cài đặt gì thêm**.

## Các bước

### 1. Tạo bảng admin trên Supabase
SQL Editor → dán **`../supabase/admin_schema.sql`** → Run. File này:
- Thêm cột phí cho seller: `markup`, `perOrderFee`, `discount` (bảng employee)
- Tạo 4 bảng: `ledgerEntries` (sổ cái gạch nợ), `shippingPrices`, `designRequests`, `services`
- Tạo tài khoản admin mặc định: **admin@teementpod.com / Admin@123** (đổi mật khẩu sau)

### 2. Chạy admin portal
```bash
cd admin-portal
npm start
```
Chạy ở **http://localhost:3001** (app seller vẫn ở :3000, chạy song song được). Đăng nhập bằng tài khoản Admin ở trên → vào `/app/finance`.

## Các trang (giống api.teementpod.us/app)

| Trang | Chức năng |
|---|---|
| **Tài chính & Công nợ** | Sổ cái theo seller: Doanh thu phôi / Đã thanh toán / Dư nợ (badge Đủ hoặc đỏ), expand "Xem chi tiết vệ tinh" → bảng từng shop (đơn thành công, đã khớp nợ, nợ hiện tại) + nút **Gạch nợ** (modal số tiền + ghi chú, sinh Txn ID); tab **Lịch sử duyệt gạch nợ toàn cục** |
| **Quản lý Seller** | Trung tâm điều hành POD: danh sách seller + sửa Phí markup / Phí xử lý đơn / Ưu đãi, khóa/xóa shop; bảng duyệt đơn toàn hệ thống theo tab trạng thái (50 đơn/trang), duyệt đơn theo luồng Chờ duyệt → Sản xuất → Giao hàng → Hoàn thành; bộ lọc seller/shop/mã đơn/ngày; **Import Tracking CSV** (cột `Order ID`, `Tracking` → tự điền tracking + chuyển Đang giao hàng); Xuất CSV |
| **Dịch vụ mở rộng** | CRUD dịch vụ hiển thị bên seller (tiêu đề, mô tả, tags, nhãn HOT, bật/tắt) |
| **Kho Phôi POD** | CRUD danh mục phôi (tên, SKU, danh mục, ảnh, còn hàng) — đồng bộ thẳng với catalog seller |
| **Bảng giá POD** | Sửa Base Cost từng phôi inline |
| **Bảng giá Vận chuyển** | CRUD cước ship theo khu vực/phương thức (món đầu, món thêm, thời gian dự kiến) |
| **Đơn Thiết Kế** | Quản lý yêu cầu design theo seller: trạng thái Chờ xử lý → Đang thiết kế → Hoàn thành, link tham khảo/kết quả |

## Kiến trúc
- Dùng chung Supabase với app seller (bảng `employee`, `stores`, `podOrders`, `baseProducts` + 4 bảng admin mới)
- Data layer copy từ app chính (`src/lib/db.ts` — flat mode, không jsonb)
- Login riêng: chỉ tài khoản `permission = 'Admin'` vào được
- Logic công nợ: Doanh thu phôi = tổng tiền các đơn đã thanh toán trở đi; Đã thanh toán = tổng ledger; Dư nợ = chênh lệch. Gạch nợ ghi vào `ledgerEntries`, hiện ngay ở tab lịch sử
