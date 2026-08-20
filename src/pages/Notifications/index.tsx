/**
 * Thông báo — đơn KHÁCH ĐÃ GỬI THANH TOÁN.
 *
 * Nguồn dữ liệu: podOrders có `datePaid` (seller bấm Pay). Đơn mới hơn mốc
 * "đã xem" (lưu ở localStorage của máy admin) được coi là CHƯA ĐỌC và hiện
 * badge đỏ ở menu.
 *
 * Tự dọn sau 7 ngày: thông báo cũ hơn 7 ngày không còn hiển thị/đếm badge nữa
 * (đơn vẫn nguyên trong podOrders — chỉ thông báo hết hạn), đồng thời xoá hẳn
 * tin nhắn nội bộ quá hạn khỏi DB và cắt bớt danh sách id đã đọc trong
 * localStorage để không phình dữ liệu.
 */
import { Button, Empty, Pagination, Tooltip, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "react-query";
import { useNavigate } from "react-router-dom";
import {
  FiBell,
  FiCheckCircle,
  FiExternalLink,
  FiMessageSquare,
  FiUser,
} from "react-icons/fi";
import {
  useOrders,
  useSellers,
  useStaffMessages,
  useStores,
} from "../../hooks/useAdmin";
import { isAdminRole, useAdminUser } from "../../hooks/useAdminAuth";
import { sbDeleteMany } from "../../lib/supabase";
import { isFreshMsg } from "../StaffChat";
import { ORDER_STATUS } from "../../models/admin";

/** Thông báo chỉ giữ 7 ngày, cũ hơn thì tự biến mất khỏi tab Thông báo */
export const NOTIF_KEEP_DAYS = 7;

/** Mốc thời gian: thông báo trước mốc này coi như đã hết hạn */
export function notifCutoff() {
  return dayjs().subtract(NOTIF_KEEP_DAYS, "day");
}

/* Trạng thái đã đọc lưu ở localStorage của máy admin:
 *  - seenAt : mốc "đánh dấu đã đọc tất cả"
 *  - ids    : các đơn đã đọc lẻ (bấm vào từng thông báo)  */
export const NOTIF_SEEN_KEY = "adm-notif-seen-at";
export const NOTIF_READ_IDS_KEY = "adm-notif-read-ids";

export interface NotifReadState {
  seenAt: string;
  ids: string[];
}

export function getNotifState(): NotifReadState {
  try {
    return {
      seenAt: localStorage.getItem(NOTIF_SEEN_KEY) || "",
      ids: JSON.parse(localStorage.getItem(NOTIF_READ_IDS_KEY) || "[]"),
    };
  } catch {
    return { seenAt: "", ids: [] };
  }
}

/** Ghi lại trạng thái + báo cho sidebar cập nhật badge ngay */
export function setNotifState(st: NotifReadState) {
  try {
    localStorage.setItem(NOTIF_SEEN_KEY, st.seenAt);
    // Chỉ giữ 500 id gần nhất cho gọn
    localStorage.setItem(
      NOTIF_READ_IDS_KEY,
      JSON.stringify(st.ids.slice(-500))
    );
  } catch {
    /* trình duyệt chặn localStorage -> chỉ đánh dấu trong phiên này */
  }
  window.dispatchEvent(new Event("adm-notif-seen"));
}

/** Thông báo còn trong hạn 7 ngày (tính theo ngày thanh toán / ngày tạo đơn) */
export function isFreshNotif(o: any): boolean {
  const t = orderTime(o);
  return t > 0 && t > +notifCutoff();
}

/** Đơn khách đã gửi thanh toán trong 7 ngày gần nhất, mới nhất trước */
export function paidOrders(orders: any[]) {
  return orders
    .filter((o) => String(o.datePaid || "").trim() && isFreshNotif(o))
    .sort((a, b) => +new Date(b.datePaid) - +new Date(a.datePaid));
}

/** 1 thông báo là CHƯA ĐỌC khi: sau mốc đọc-tất-cả và chưa bấm vào riêng nó */
export function isUnreadNotif(o: any, st: NotifReadState): boolean {
  const seen = st.seenAt ? +new Date(st.seenAt) : 0;
  return +new Date(o.datePaid) > seen && !st.ids.includes(o.id);
}

export function unreadPaidCount(orders: any[], st: NotifReadState): number {
  return paidOrders(orders).filter((o) => isUnreadNotif(o, st)).length;
}

/* --------------------------- Thông báo cho nhân viên --------------------- */

/** Mốc thời gian của 1 đơn dùng để xét mới/cũ (ưu tiên ngày thanh toán) */
function orderTime(o: any): number {
  const t = o.datePaid || o.created || "";
  const ms = +new Date(t);
  return Number.isFinite(ms) ? ms : 0;
}

/** Đơn đang được giao cho nhân viên này trong 7 ngày (cột "Nhân viên xử lý") */
export function assignedOrders(orders: any[], staffName?: string): any[] {
  const me = String(staffName || "").trim().toLowerCase();
  if (!me) return [];
  return orders
    .filter(
      (o) =>
        isFreshNotif(o) &&
        String(o.csAssignee || "")
          .split(",")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean)
          .includes(me)
    )
    .sort((a, b) => orderTime(b) - orderTime(a));
}

/** Đơn được giao mà nhân viên chưa đọc */
export function isUnreadAssigned(o: any, st: NotifReadState): boolean {
  const seen = st.seenAt ? +new Date(st.seenAt) : 0;
  return orderTime(o) > seen && !st.ids.includes(o.id);
}

export function unreadAssignedCount(
  orders: any[],
  staffName: string | undefined,
  st: NotifReadState
): number {
  return assignedOrders(orders, staffName).filter((o) =>
    isUnreadAssigned(o, st)
  ).length;
}

function money(n: number) {
  return `$${(n || 0).toFixed(2)}`;
}

export default function Notifications() {
  const navigate = useNavigate();
  const admin = useAdminUser();
  // Nhân viên không được xem cột tiền
  const canSeeMoney = isAdminRole(admin);
  const isStaff = !canSeeMoney;
  const { orders, isLoading } = useOrders();
  const { stores } = useStores();
  const { sellers } = useSellers();
  const [notif, setNotif] = useState<NotifReadState>(getNotifState);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  /**
   * Admin: mọi đơn khách đã gửi thanh toán.
   * Nhân viên: CHỈ những đơn đang được giao cho chính mình (cột Nhân viên xử lý)
   * — tin nhắn từ admin hiển thị ở khối riêng bên trên.
   */
  const list = useMemo(
    () =>
      isStaff ? assignedOrders(orders, admin?.name) : paidOrders(orders),
    [isStaff, orders, admin]
  );
  const isNew = (o: any) =>
    isStaff ? isUnreadAssigned(o, notif) : isUnreadNotif(o, notif);
  const unread = list.filter(isNew);

  /* Tin nhắn admin gửi cho nhân viên này (7 ngày gần nhất) */
  const { messages: allMsgs } = useStaffMessages();
  const myMsgs = useMemo(() => {
    if (!isStaff) return [];
    return allMsgs
      .filter(
        (m) =>
          m.staffId === admin?.id && m.senderRole !== "staff" && isFreshMsg(m)
      )
      .sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  }, [isStaff, allMsgs, admin]);
  const unreadMsgs = myMsgs.filter((m) => !m.readByStaff);

  /* -------- Tự dọn sau 7 ngày (mở trang là chạy, không cần bấm gì) -------- */

  const qc = useQueryClient();
  const cleaning = useRef(false);

  /** Xoá hẳn tin nhắn nội bộ quá 7 ngày khỏi DB cho nhẹ database */
  useEffect(() => {
    if (cleaning.current) return;
    const expired = allMsgs.filter((m) => !isFreshMsg(m)).map((m) => m.id);
    if (!expired.length) return;
    cleaning.current = true;
    sbDeleteMany("staffMessages", expired)
      .then(() => qc.invalidateQueries(["adm-staff-messages"]))
      .catch(() => {
        /* lỗi mạng thì để lần mở sau dọn tiếp */
      })
      .finally(() => {
        cleaning.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMsgs]);

  /** Cắt bớt id "đã đọc" trong localStorage: chỉ giữ thông báo còn trong hạn */
  useEffect(() => {
    // Chờ tải xong đơn rồi mới dọn, tránh xoá nhầm khi danh sách còn rỗng
    if (isLoading || !orders.length || !notif.ids.length) return;
    const alive = new Set(list.map((o) => o.id));
    const kept = notif.ids.filter((id) => alive.has(id));
    if (kept.length === notif.ids.length) return;
    const next = { ...notif, ids: kept };
    setNotif(next);
    setNotifState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  /** Bấm vào 1 thông báo: đánh dấu đã đọc rồi mở đơn bên Quản lý Seller */
  const openNotif = (o: any) => {
    if (isNew(o)) {
      const next = { ...notif, ids: [...notif.ids, o.id] };
      setNotif(next);
      setNotifState(next);
    }
    navigate(`/app/sellers?code=${encodeURIComponent(o.orderCode)}`);
  };

  const sellerName = (o: any) => {
    const store = stores.find((st) => st.id === o.storeId);
    const sl = sellers.find((s) => s.id === (store?.userId || o.userId));
    return sl?.name || sl?.email || "—";
  };

  const markAllRead = () => {
    const next = { seenAt: new Date().toISOString(), ids: [] as string[] };
    setNotif(next);
    setNotifState(next);
    message.success("Đã đánh dấu tất cả là đã đọc");
  };

  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 m-0 flex items-center gap-2">
            <FiBell /> Thông báo
          </h1>
          <p className="text-gray-400 text-sm mt-1 mb-0">
            {isStaff
              ? `Tin nhắn từ admin và các đơn đang giao cho bạn trong ${NOTIF_KEEP_DAYS} ngày gần nhất. Dòng nền vàng là chưa đọc.`
              : `Các đơn khách đã gửi thanh toán trong ${NOTIF_KEEP_DAYS} ngày gần nhất (cũ hơn sẽ tự xoá khỏi thông báo). Đơn có nền vàng là chưa đọc.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-gray-100 rounded-full px-3 py-1 text-gray-600 font-medium">
            {unread.length} chưa đọc / {list.length} thông báo
          </span>
          <Button
            icon={<FiCheckCircle />}
            disabled={!unread.length}
            onClick={markAllRead}
          >
            Đánh dấu đã đọc tất cả
          </Button>
        </div>
      </div>

      {/* Tin nhắn từ admin — chỉ hiện với tài khoản nhân viên */}
      {isStaff && (
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <FiMessageSquare className="text-gray-400" />
            <span className="font-semibold text-gray-800 text-sm">
              Tin nhắn từ admin
            </span>
            {unreadMsgs.length > 0 && (
              <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center">
                {unreadMsgs.length}
              </span>
            )}
            <button
              onClick={() => navigate("/app/staff-chat")}
              className="ml-auto text-[12px] text-[#2563EB] bg-transparent border-0 cursor-pointer"
            >
              Mở chat nội bộ →
            </button>
          </div>
          {!myMsgs.length ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              Chưa có tin nhắn nào từ admin
            </div>
          ) : (
            myMsgs.slice(0, 5).map((m) => (
              <button
                key={m.id}
                onClick={() => navigate("/app/staff-chat")}
                className={`w-full text-left px-4 py-3 border-0 border-b border-gray-50 cursor-pointer flex items-start gap-3 ${
                  m.readByStaff ? "bg-white" : "bg-[#FEF9E7]"
                } hover:bg-[#F8FAFC]`}
              >
                {!m.readByStaff && (
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-[#DC2626] shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-gray-800 truncate">
                    {m.content}
                  </span>
                  <span className="block text-[11px] text-gray-400 mt-0.5">
                    {m.senderName || "Admin"}
                    {m.created
                      ? ` · ${dayjs(m.created).format("DD/MM/YYYY HH:mm")}`
                      : ""}
                    {m.orderCode ? ` · Đơn ${m.orderCode}` : ""}
                    {m.doneAt ? " · đã xử lý" : ""}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        {isStaff && (
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <FiUser className="text-gray-400" />
            <span className="font-semibold text-gray-800 text-sm">
              Đơn đang giao cho bạn
            </span>
          </div>
        )}
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Đang tải...</div>
        ) : !list.length ? (
          <div className="p-12">
            <Empty
              description={
                isStaff
                  ? "Chưa có đơn nào được giao cho bạn"
                  : "Chưa có đơn nào khách gửi thanh toán"
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
                    <th className="p-3 font-medium">Mã đơn</th>
                    <th className="p-3 font-medium">Shop / Seller</th>
                    <th className="p-3 font-medium">Khách hàng</th>
                    <th className="p-3 font-medium">Thanh toán lúc</th>
                    <th className="p-3 font-medium">Trạng thái</th>
                    {canSeeMoney && (
                      <th className="p-3 font-medium text-right">Số tiền</th>
                    )}
                    <th className="p-3 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((o) => {
                    const rowNew = isNew(o);
                    const st = ORDER_STATUS[o.status];
                    return (
                      <tr
                        key={o.id}
                        onClick={() => openNotif(o)}
                        title="Bấm để đánh dấu đã đọc và mở đơn"
                        className={`border-b border-gray-50 cursor-pointer hover:bg-[#F8FAFC] ${
                          rowNew ? "bg-[#FEF9E7]" : ""
                        }`}
                      >
                        <td className="p-3 font-bold text-gray-900 whitespace-nowrap">
                          {rowNew && (
                            <span className="inline-block w-2 h-2 rounded-full bg-[#DC2626] mr-2 align-middle" />
                          )}
                          {o.orderCode}
                        </td>
                        <td className="p-3">
                          <div className="text-gray-800">
                            {o.storeName || "—"}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {sellerName(o)}
                          </div>
                        </td>
                        <td className="p-3 text-gray-600">
                          {o.customerName || "—"}
                        </td>
                        <td className="p-3 whitespace-nowrap text-gray-600">
                          {dayjs(o.datePaid as string).format("DD/MM/YYYY HH:mm")}
                        </td>
                        <td className="p-3">
                          <span
                            className="inline-block text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap"
                            style={{
                              color: st?.color || "#666",
                              background: st?.bg || "#eee",
                            }}
                          >
                            {st?.label || o.status}
                          </span>
                        </td>
                        {canSeeMoney && (
                          <td className="p-3 text-right font-semibold whitespace-nowrap">
                            {money(o.total)}
                          </td>
                        )}
                        <td className="p-3">
                          <Tooltip title="Mở đơn bên Quản lý Seller">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openNotif(o);
                              }}
                              className="w-7 h-7 rounded-md border border-gray-200 bg-white text-gray-500 inline-flex items-center justify-center cursor-pointer hover:text-[#2563EB] hover:border-[#C7D7FE]"
                            >
                              <FiExternalLink size={13} />
                            </button>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {list.length > PAGE_SIZE && (
              <div className="flex justify-end p-3 border-t border-gray-100">
                <Pagination
                  current={page}
                  pageSize={PAGE_SIZE}
                  total={list.length}
                  showSizeChanger={false}
                  onChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
