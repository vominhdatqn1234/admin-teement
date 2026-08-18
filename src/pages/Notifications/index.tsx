/**
 * Thông báo — đơn KHÁCH ĐÃ GỬI THANH TOÁN.
 *
 * Nguồn dữ liệu: podOrders có `datePaid` (seller bấm Pay). Đơn mới hơn mốc
 * "đã xem" (lưu ở localStorage của máy admin) được coi là CHƯA ĐỌC và hiện
 * badge đỏ ở menu.
 */
import { Button, Empty, Pagination, Tooltip, message } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiBell, FiCheckCircle, FiExternalLink } from "react-icons/fi";
import { useOrders, useSellers, useStores } from "../../hooks/useAdmin";
import { useIsAdmin } from "../../hooks/useAdminAuth";
import { ORDER_STATUS } from "../../models/admin";

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

/** Đơn khách đã gửi thanh toán, mới nhất trước */
export function paidOrders(orders: any[]) {
  return orders
    .filter((o) => String(o.datePaid || "").trim())
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

function money(n: number) {
  return `$${(n || 0).toFixed(2)}`;
}

export default function Notifications() {
  const navigate = useNavigate();
  // Nhân viên không được xem cột tiền
  const canSeeMoney = useIsAdmin();
  const { orders, isLoading } = useOrders();
  const { stores } = useStores();
  const { sellers } = useSellers();
  const [notif, setNotif] = useState<NotifReadState>(getNotifState);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const list = useMemo(() => paidOrders(orders), [orders]);
  const unread = list.filter((o) => isUnreadNotif(o, notif));

  /** Bấm vào 1 thông báo: đánh dấu đã đọc rồi mở đơn bên Quản lý Seller */
  const openNotif = (o: any) => {
    if (isUnreadNotif(o, notif)) {
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
            Các đơn khách đã gửi thanh toán. Đơn có nền vàng là chưa đọc.
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

      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Đang tải...</div>
        ) : !list.length ? (
          <div className="p-12">
            <Empty description="Chưa có đơn nào khách gửi thanh toán" />
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
                    const isNew = isUnreadNotif(o, notif);
                    const st = ORDER_STATUS[o.status];
                    return (
                      <tr
                        key={o.id}
                        onClick={() => openNotif(o)}
                        title="Bấm để đánh dấu đã đọc và mở đơn"
                        className={`border-b border-gray-50 cursor-pointer hover:bg-[#F8FAFC] ${
                          isNew ? "bg-[#FEF9E7]" : ""
                        }`}
                      >
                        <td className="p-3 font-bold text-gray-900 whitespace-nowrap">
                          {isNew && (
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
