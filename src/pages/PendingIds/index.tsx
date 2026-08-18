/**
 * Trang "Quản lý Add ID" — mã đơn khách báo TRƯỚC khi đơn được úp lên hệ thống.
 * Khi đơn thật có mã này vào hệ thống, dòng đơn bên Quản lý nhân viên sẽ hiện
 * badge đỏ để kiểm tra lại; kiểm tra xong bấm "Đã kiểm tra" để tắt badge.
 */
import { Button, Input, Popconfirm, Tooltip, message } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiCheck,
  FiPlus,
  FiSearch,
  FiTrash2,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  useOrders,
  usePendingOrderIdMutations,
  usePendingOrderIds,
} from "../../hooks/useAdmin";
import { useAdminUser } from "../../hooks/useAdminAuth";
import { PendingOrderId } from "../../models/admin";

const TABS = [
  { key: "all", label: "Tất cả" },
  { key: "waiting", label: "Chờ đơn thật" },
  { key: "matched", label: "Đã có đơn — cần kiểm tra" },
  { key: "done", label: "Đã kiểm tra" },
];

export default function PendingIds() {
  const navigate = useNavigate();
  const admin = useAdminUser();
  const reviewer = admin?.name || admin?.email || "admin";
  const { pendingIds } = usePendingOrderIds();
  const { orders } = useOrders();
  const mut = usePendingOrderIdMutations();

  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  /** Mã đơn thật (viết thường) -> đơn, để tra nhanh khách/shop của mã đã add */
  const orderByCode = useMemo(() => {
    const m = new Map<string, any>();
    orders.forEach((o) =>
      m.set(String(o.orderCode || "").trim().toLowerCase(), o)
    );
    return m;
  }, [orders]);

  const stateOf = (p: PendingOrderId) =>
    !p.matchedOrderId ? "waiting" : p.ackAt ? "done" : "matched";

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: pendingIds.length,
      waiting: 0,
      matched: 0,
      done: 0,
    };
    pendingIds.forEach((p) => (c[stateOf(p)] += 1));
    return c;
  }, [pendingIds]);

  const list = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return pendingIds.filter((p) => {
      if (tab !== "all" && stateOf(p) !== tab) return false;
      if (!kw) return true;
      return (
        String(p.orderCode || "").toLowerCase().includes(kw) ||
        String(p.note || "").toLowerCase().includes(kw) ||
        String(p.createdBy || "").toLowerCase().includes(kw)
      );
    });
  }, [pendingIds, search, tab]);

  const add = async () => {
    const c = code.trim();
    if (!c) return message.warning("Nhập mã đơn khách gửi trước");
    if (
      pendingIds.some(
        (p) => p.orderCode.trim().toLowerCase() === c.toLowerCase()
      )
    )
      return message.warning("ID này đã được add rồi");
    await mut.add.mutateAsync({
      orderCode: c,
      note: note.trim(),
      createdBy: reviewer,
      created: new Date().toISOString(),
      matchedOrderId: "",
      matchedAt: "",
      ackAt: "",
    });
    message.success(`Đã add ID "${c}" — sẽ báo khi đơn thật xuất hiện`);
    setCode("");
    setNote("");
  };

  const ack = (p: PendingOrderId) =>
    mut.update.mutate(
      { id: p.id, ackAt: new Date().toISOString() },
      {
        onSuccess: () => {
          message.success(`Đã xác nhận kiểm tra ID ${p.orderCode}`);
        },
      }
    );

  const unack = (p: PendingOrderId) =>
    mut.update.mutate(
      { id: p.id, ackAt: "" },
      {
        onSuccess: () => {
          message.success(`Đã mở lại cảnh báo ${p.orderCode}`);
        },
      }
    );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate("/app/order-care")}
          className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 bg-transparent border-0 p-0 mb-2 cursor-pointer hover:text-gray-800"
        >
          <FiArrowLeft size={14} /> Về Quản lý nhân viên (đơn)
        </button>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-[#171826] m-0 flex items-center gap-3">
              Quản lý Add ID
              <span className="text-xs font-bold bg-[#FDECEC] text-[#B91C1C] rounded-full px-2.5 py-1">
                {counts.matched} cần kiểm tra / {counts.all} mã
              </span>
            </h1>
            <p className="text-gray-500 m-0 mt-1 max-w-2xl text-sm">
              Khách báo mã đơn <b>trước</b> khi đơn được úp lên hệ thống. Khi đơn
              thật có mã này vào hệ thống, dòng đơn bên Quản lý nhân viên sẽ hiện
              badge đỏ — kiểm tra xem khách có đổi ID không rồi bấm{" "}
              <b>Đã kiểm tra</b> để tắt cảnh báo.
            </p>
          </div>
          <Input
            prefix={<FiSearch className="text-gray-400" />}
            placeholder="Tìm mã đơn / ghi chú / người add..."
            className="w-full sm:w-[280px] rounded-lg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </div>
      </div>

      {/* Thêm ID mới */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="text-[11px] font-bold tracking-widest text-gray-400 mb-3">
          THÊM MÃ ĐƠN KHÁCH GỬI TRƯỚC
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <div className="text-xs text-gray-500 mb-1.5">Mã đơn *</div>
            <Input
              size="large"
              placeholder="Vd: 4144583869"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onPressEnter={add}
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1.5">
              Ghi chú (không bắt buộc)
            </div>
            <Input
              size="large"
              placeholder="Vd: đổi màu / đổi size / thay đổi địa chỉ"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onPressEnter={add}
            />
          </div>
          <Button
            type="primary"
            size="large"
            icon={<FiPlus />}
            loading={mut.add.isLoading}
            onClick={add}
            className="bg-[#171826] border-0 font-bold"
          >
            Thêm ID
          </Button>
        </div>
      </div>

      {/* Tabs trạng thái */}
      <div className="inline-flex bg-gray-100 rounded-xl p-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-[13px] border-0 cursor-pointer transition-colors ${
              tab === t.key
                ? "bg-[#171826] text-white font-bold"
                : "bg-transparent text-gray-600"
            }`}
          >
            {t.label} ({counts[t.key] ?? 0})
          </button>
        ))}
      </div>

      {/* Danh sách */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="text-left text-[11px] tracking-widest text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="p-4">MÃ ĐƠN</th>
              <th className="p-4">GHI CHÚ</th>
              <th className="p-4">TRẠNG THÁI</th>
              <th className="p-4">ĐƠN THẬT</th>
              <th className="p-4">NGƯỜI ADD</th>
              <th className="p-4">NGÀY ADD</th>
              <th className="p-4 text-right">THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const st = stateOf(p);
              const order = orderByCode.get(
                String(p.orderCode || "").trim().toLowerCase()
              );
              return (
                <tr
                  key={p.id}
                  className={`border-b border-gray-50 align-top ${
                    st === "matched" ? "bg-[#FFF7F7]" : "hover:bg-gray-50/60"
                  }`}
                >
                  <td className="p-4 font-bold text-[#171826] whitespace-nowrap">
                    {p.orderCode}
                  </td>
                  <td className="p-4 text-gray-600">{p.note || "—"}</td>
                  <td className="p-4 whitespace-nowrap">
                    <span
                      className={`text-[10px] font-bold rounded px-2 py-1 ${
                        st === "waiting"
                          ? "bg-gray-100 text-gray-500"
                          : st === "matched"
                          ? "bg-[#FDECEC] text-[#B91C1C]"
                          : "bg-[#E8F7EC] text-[#15803D]"
                      }`}
                    >
                      {st === "waiting"
                        ? "CHỜ ĐƠN THẬT"
                        : st === "matched"
                        ? "ĐÃ CÓ ĐƠN — CẦN KIỂM TRA"
                        : "ĐÃ KIỂM TRA"}
                    </span>
                    {p.matchedAt && (
                      <div className="text-[11px] text-gray-400 mt-1">
                        Khớp {dayjs(p.matchedAt).format("DD/MM/YYYY HH:mm")}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-gray-600">
                    {order ? (
                      <div>
                        <div className="text-[13px]">
                          {order.customerName || "—"}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {order.storeName || "—"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-300">Chưa có</span>
                    )}
                  </td>
                  <td className="p-4 text-gray-600 whitespace-nowrap">
                    {p.createdBy || "—"}
                  </td>
                  <td className="p-4 text-gray-500 whitespace-nowrap">
                    {p.created
                      ? dayjs(p.created).format("DD/MM/YYYY HH:mm")
                      : "—"}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {st === "matched" && (
                        <Button
                          icon={<FiCheck />}
                          type="primary"
                          className="bg-[#171826] border-0"
                          loading={mut.update.isLoading}
                          onClick={() => ack(p)}
                        >
                          Đã kiểm tra
                        </Button>
                      )}
                      {st === "done" && (
                        <Button onClick={() => unack(p)}>Mở lại cảnh báo</Button>
                      )}
                      <Popconfirm
                        title={`Xoá ID "${p.orderCode}" khỏi danh sách?`}
                        okText="Xoá"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => mut.remove.mutate(p.id)}
                      >
                        <Tooltip title="Xoá ID">
                          <button className="w-9 h-9 rounded-lg border border-red-100 bg-red-50 text-red-500 flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white transition-colors">
                            <FiTrash2 size={15} />
                          </button>
                        </Tooltip>
                      </Popconfirm>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={7} className="p-16 text-center text-gray-400">
                  {search.trim() || tab !== "all"
                    ? "Không có mã nào khớp"
                    : "Chưa add mã đơn nào — thêm ở khung phía trên"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
