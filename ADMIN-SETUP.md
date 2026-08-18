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

## Tài khoản nhân viên (staff)
Chạy **`../supabase/add_cs_employee_login.sql`** một lần (thêm cột `username`, `password`, `active` cho bảng `csEmployees`).

- Admin vào **Quản lý nhân viên** → nút **Tài khoản đăng nhập** → nhập username + mật khẩu cho từng nhân viên, bật/tắt "Cho đăng nhập". Để trống username = gỡ quyền đăng nhập.
- Nhân viên đăng nhập ở trang `/login` bằng **username + mật khẩu** (cùng ô với email admin).
- Nhân viên chỉ vào được: **Quản lý Seller**, **Quản lý nhân viên**, **Thông báo** — gõ tay URL trang khác sẽ bị đẩy về Quản lý Seller.
- Nhân viên **không thấy** các cột tiền **Giá / Phí / Tổng / Giá đối chiếu** (kể cả trong popup chi tiết đơn, nút Import Giá đối chiếu và file CSV xuất ra). Chỉ Admin thấy.

## Chat nội bộ Admin ↔ Nhân viên
Chạy **`../supabase/add_staff_messages.sql`** một lần (tạo bảng `staffMessages`).

- Menu **Chat nội bộ** (`/app/staff-chat`): admin chọn nhân viên ở cột trái, nhắn vấn đề cần xử lý, gắn kèm mã đơn nếu cần.
- Nhân viên đăng nhập thấy đúng luồng chat của mình, có badge đỏ ở menu khi admin nhắn, bấm **Đã xử lý** trên tin của admin và trả lời lại trực tiếp.
- Admin cũng có badge đỏ khi nhân viên trả lời. Danh sách tự làm mới mỗi 20 giây.
- Bấm chip "Đơn &lt;mã&gt;" trong tin nhắn sẽ mở thẳng đơn đó bên Quản lý Seller.
- **Tin nhắn chỉ giữ 7 ngày**: mỗi lần mở trang Chat nội bộ, tin quá 7 ngày bị xoá hẳn khỏi bảng `staffMessages` (đổi số ngày ở hằng `KEEP_DAYS` trong `src/pages/StaffChat/index.tsx`).

## Kiến trúc
- Dùng chung Supabase với app seller (bảng `employee`, `stores`, `podOrders`, `baseProducts` + 4 bảng admin mới)
- Data layer copy từ app chính (`src/lib/db.ts` — flat mode, không jsonb)
- Login riêng: Admin = `employee.permission = 'Admin'` (email); Nhân viên = `csEmployees.username/password` (role `staff`, quyền hạn chế)
- Logic công nợ: Doanh thu phôi = tổng tiền các đơn đã thanh toán trở đi; Đã thanh toán = tổng ledger; Dư nợ = chênh lệch. Gạch nợ ghi vào `ledgerEntries`, hiện ngay ở tab lịch sử
