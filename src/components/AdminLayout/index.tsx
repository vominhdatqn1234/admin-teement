import { Dropdown, Tooltip } from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  FiDollarSign,
  FiUsers,
  FiFileText,
  FiBox,
  FiDroplet,
  FiTag,
  FiTruck,
  FiNavigation,
  FiPenTool,
  FiPrinter,
  FiSettings,
  FiSearch,
  FiSidebar,
  FiInbox,
  FiHeadphones,
  FiBell,
  FiUserCheck,
  FiHash,
  FiMessageSquare,
} from "react-icons/fi";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  STAFF_PATHS,
  homePathOf,
  roleOf,
  useAdminAuth,
} from "../../hooks/useAdminAuth";
import {
  useImportQueue,
  useLedger,
  useOrders,
  usePendingOrderIds,
  useSellers,
  useStaffMessages,
  useStores,
} from "../../hooks/useAdmin";
import {
  unreadForAdmin,
  unreadForStaff,
} from "../../pages/StaffChat";
import { PAID_STATUSES } from "../../models/admin";
import { getNotifState, unreadPaidCount } from "../../pages/Notifications";

const EXTENSIONS = [
  { to: "/app/finance", label: "Tài chính & Công nợ", icon: <FiDollarSign /> },
  { to: "/app/sellers", label: "Quản lý Seller", icon: <FiUsers /> },
  { to: "/app/order-care", label: "Quản lý nhân viên", icon: <FiHeadphones /> },
  { to: "/app/staff", label: "Nhân viên & Tài khoản", icon: <FiUserCheck /> },
  { to: "/app/pending-ids", label: "Quản lý Add ID", icon: <FiHash /> },
  { to: "/app/staff-chat", label: "Chat nội bộ", icon: <FiMessageSquare /> },
  { to: "/app/notifications", label: "Thông báo", icon: <FiBell /> },
  { to: "/app/import-queue", label: "Hàng đợi import PDF", icon: <FiInbox /> },
  { to: "/app/services", label: "Dịch vụ mở rộng", icon: <FiFileText /> },
  { to: "/app/blanks", label: "Kho Phôi POD", icon: <FiBox /> },
  { to: "/app/colors", label: "Mã màu phôi", icon: <FiDroplet /> },
  { to: "/app/pod-prices", label: "Bảng giá POD", icon: <FiTag /> },
  { to: "/app/shipping-prices", label: "Bảng giá Vận chuyển", icon: <FiTruck /> },
  { to: "/app/design-orders", label: "Đơn Thiết Kế", icon: <FiPenTool /> },
  { to: "/app/print-house", label: "Nhà In", icon: <FiPrinter /> },
  { to: "/app/tracking", label: "Quản lý Tracking", icon: <FiNavigation /> },
];

export default function AdminLayout() {
  const { adminUser, logout } = useAdminAuth();
  const location = useLocation();
  const isStaff = roleOf(adminUser) === "staff";
  // Nhân viên chỉ thấy các trang trong STAFF_PATHS
  const menus = isStaff
    ? EXTENSIONS.filter((m) => STAFF_PATHS.includes(m.to))
    : EXTENSIONS;
  const [collapsed, setCollapsed] = useState(false);
  // Số đơn khách báo ĐỔI THÔNG TIN (đã có đơn thật, chưa bấm đã xử lý)
  const { pendingIds } = usePendingOrderIds();
  const changeCount = pendingIds.filter(
    (p) => p.matchedOrderId && !p.ackAt
  ).length;
  // Số lô import PDF đang chờ admin duyệt
  const { batches } = useImportQueue();
  const queueCount = batches.filter((b) => b.status === "pending").length;

  // Đơn đang chờ admin duyệt
  const { orders } = useOrders();
  const approvalCount = orders.filter(
    (o) => o.status === "pending_approval"
  ).length;

  /* Số SHOP còn nợ (doanh thu đơn đã thanh toán − đã gạch nợ > 0) */
  const { sellers } = useSellers();
  const { stores } = useStores();
  const { entries } = useLedger();
  const debtShopCount = useMemo(() => {
    const sellerIds = new Set(
      sellers.filter((s) => s.permission !== "Admin").map((s) => s.id)
    );
    return stores.filter((store) => {
      if (store.userId && !sellerIds.has(store.userId)) return false;
      const seller = sellers.find((s) => s.id === store.userId);
      const extraPerOrder =
        (seller?.markup || 0) +
        (seller?.perOrderFee || 0) -
        (seller?.discount || 0);
      const storeOrders = orders.filter(
        (o) => o.storeId === store.id && PAID_STATUSES.includes(o.status)
      );
      const revenue =
        storeOrders.reduce((s, o) => s + (o.total || 0), 0) +
        extraPerOrder * storeOrders.length;
      const matched = entries
        .filter((e) => e.storeId === store.id)
        .reduce((s, e) => s + (e.amount || 0), 0);
      return revenue - matched > 0.005;
    }).length;
  }, [sellers, stores, orders, entries]);

  /* Chat nội bộ: admin đếm tin nhân viên rep, nhân viên đếm tin admin gửi */
  const { messages: staffMsgs } = useStaffMessages();
  const chatCount = isStaff
    ? unreadForStaff(staffMsgs, adminUser?.id || "")
    : unreadForAdmin(staffMsgs);

  /* Thông báo: đơn khách gửi thanh toán sau mốc admin đã xem */
  const [notifState, setNotifState] = useState(getNotifState);
  useEffect(() => {
    const sync = () => setNotifState(getNotifState());
    window.addEventListener("adm-notif-seen", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("adm-notif-seen", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  const notifCount = useMemo(
    () => unreadPaidCount(orders, notifState),
    [orders, notifState]
  );

  /** Số hiện badge đỏ cho từng menu */
  const badgeOf = (to: string) =>
    to === "/app/staff-chat"
      ? chatCount
      : to === "/app/pending-ids"
      ? changeCount
      : to === "/app/import-queue"
      ? queueCount
      : to === "/app/sellers"
      ? approvalCount
      : to === "/app/finance"
      ? debtShopCount
      : to === "/app/notifications"
      ? notifCount
      : 0;

  if (!adminUser) return <Navigate to="/login" />;
  // Nhân viên gõ tay URL trang không được phép -> đưa về trang mặc định
  if (
    isStaff &&
    !STAFF_PATHS.some((p) => location.pathname.startsWith(p))
  )
    return <Navigate to={homePathOf(adminUser)} replace />;

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar kiểu Medusa */}
      <aside
        className={`${
          collapsed ? "w-[64px]" : "w-[220px]"
        } shrink-0 bg-[#FAFAFA] border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-20 transition-[width] duration-200`}
      >
        <div
          className={`px-3 py-4 flex items-center border-b border-gray-100 ${
            collapsed ? "justify-center" : "gap-2"
          }`}
        >
          <span className="w-6 h-6 shrink-0 rounded bg-[#171826] text-white text-xs font-bold flex items-center justify-center">
            T
          </span>
          {!collapsed && (
            <>
              <span className="font-semibold text-sm text-gray-800">
                Teement Admin
              </span>
              <Tooltip title="Thu gọn menu" placement="right">
                <button
                  onClick={() => setCollapsed(true)}
                  className="ml-auto w-6 h-6 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center bg-transparent border-0 cursor-pointer"
                >
                  <FiSidebar size={15} />
                </button>
              </Tooltip>
            </>
          )}
        </div>

        {collapsed && (
          <Tooltip title="Mở rộng menu" placement="right">
            <button
              onClick={() => setCollapsed(false)}
              className="mx-auto mt-3 w-8 h-8 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 flex items-center justify-center bg-white border border-gray-200 cursor-pointer"
            >
              <FiSidebar size={15} />
            </button>
          </Tooltip>
        )}

        <div className="px-3 pt-3">
          {collapsed ? (
            <Tooltip title="Tìm kiếm" placement="right">
              <div className="w-8 h-8 mx-auto rounded-md text-gray-400 border border-gray-200 bg-white flex items-center justify-center cursor-pointer">
                <FiSearch size={14} />
              </div>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-gray-400 text-sm border border-gray-200 bg-white">
              <FiSearch size={13} />
              Search
            </div>
          )}
        </div>

        <div className="px-3 pt-4">
          {!collapsed && (
            <div className="text-[11px] font-medium text-gray-400 px-2 mb-1 flex items-center justify-between">
              Extensions
            </div>
          )}
          <nav className="space-y-0.5">
            {menus.map((m) => {
              const link = (
                <NavLink
                  key={m.to}
                  to={m.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] no-underline hover:no-underline transition-colors ${
                      collapsed ? "justify-center" : ""
                    } ${
                      isActive
                        ? "bg-white border border-gray-200 shadow-sm text-gray-900 font-medium"
                        : "text-gray-600 hover:bg-gray-100 border border-transparent"
                    }`
                  }
                >
                  <span className="text-gray-400 relative">
                    {m.icon}
                    {/* Badge đỏ khi thu gọn menu (không có chỗ cho số bên phải) */}
                    {collapsed && badgeOf(m.to) > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[#DC2626] text-white text-[9px] font-bold flex items-center justify-center">
                        {badgeOf(m.to)}
                      </span>
                    )}
                  </span>
                  {!collapsed && m.label}
                  {!collapsed && badgeOf(m.to) > 0 && (
                    <span
                      title={
                        m.to === "/app/staff-chat"
                          ? `${chatCount} tin nhắn nội bộ chưa đọc`
                          : m.to === "/app/pending-ids"
                          ? `${changeCount} mã đã add đã có đơn thật — cần kiểm tra`
                          : m.to === "/app/sellers"
                          ? `${approvalCount} đơn đang chờ duyệt`
                          : m.to === "/app/finance"
                          ? `${debtShopCount} shop chưa gạch nợ`
                          : m.to === "/app/notifications"
                          ? `${notifCount} đơn khách gửi thanh toán chưa đọc`
                          : `${queueCount} lô import PDF đang chờ duyệt`
                      }
                      className="ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center"
                    >
                      {badgeOf(m.to)}
                    </span>
                  )}
                </NavLink>
              );
              return collapsed ? (
                <Tooltip
                  key={m.to}
                  title={
                    badgeOf(m.to) > 0
                      ? `${m.label} · ${badgeOf(m.to)} việc cần xử lý`
                      : m.label
                  }
                  placement="right"
                >
                  {link}
                </Tooltip>
              ) : (
                link
              );
            })}
          </nav>
        </div>

        <div className="mt-auto px-3 pb-3 space-y-0.5">
          {collapsed ? (
            <Tooltip title="Settings" placement="right">
              <div className="w-8 h-8 mx-auto rounded-md text-gray-500 hover:bg-gray-100 flex items-center justify-center cursor-pointer">
                <FiSettings size={15} />
              </div>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] text-gray-600 hover:bg-gray-100 cursor-pointer">
              <FiSettings className="text-gray-400" size={14} />
              Settings
            </div>
          )}
          <Dropdown
            menu={{
              items: [
                {
                  key: "logout",
                  label: <span className="text-red-500">Đăng xuất</span>,
                },
              ],
              onClick: ({ key }) => {
                if (key === "logout") {
                  logout();
                  window.location.href = "/login";
                }
              },
            }}
          >
            <div
              className={`flex items-center px-2 py-2 rounded-md hover:bg-gray-100 cursor-pointer border-t border-gray-100 ${
                collapsed ? "justify-center" : "gap-2"
              }`}
            >
              <span className="w-6 h-6 shrink-0 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold flex items-center justify-center">
                {(adminUser.name || "A").charAt(0).toUpperCase()}
              </span>
              {!collapsed && (
                <span className="min-w-0">
                  <span className="block text-[12px] text-gray-600 truncate">
                    {adminUser.email}
                  </span>
                  <span
                    className={`inline-block mt-0.5 text-[9px] font-bold tracking-wider rounded px-1.5 py-[1px] ${
                      isStaff
                        ? "bg-[#EEF0FF] text-[#4338CA]"
                        : "bg-[#E8F7EC] text-[#15803D]"
                    }`}
                  >
                    {isStaff
                      ? `NHÂN VIÊN${adminUser.code ? ` · ${adminUser.code}` : ""}`
                      : "ADMIN"}
                  </span>
                </span>
              )}
            </div>
          </Dropdown>
        </div>
      </aside>

      {/* Main */}
      <main
        className={`flex-1 min-w-0 p-8 transition-[margin] duration-200 ${
          collapsed ? "ml-[64px]" : "ml-[220px]"
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
