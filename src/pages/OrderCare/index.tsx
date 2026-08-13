import {
  Button,
  Image,
  Input,
  Pagination,
  Popconfirm,
  Select,
  Tooltip,
  message,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { FiClock, FiRotateCcw } from "react-icons/fi";
import UploadImgButton from "../../components/UploadImgButton";
import { imageUrlCandidates } from "../../lib/imageUrl";
import {
  nextEmployeeCode,
  useCsEmployeeMutations,
  useCsEmployees,
  useOrderMutations,
  useOrders,
  usePendingOrderIdMutations,
  usePendingOrderIds,
  useSellers,
  useStores,
} from "../../hooks/useAdmin";
import { useAdminUser } from "../../hooks/useAdminAuth";
import { PendingOrderId, PodOrder } from "../../models/admin";

const CS_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  "": { label: "Chưa xử lý", color: "#B91C1C", bg: "#FDECEC" },
  waiting: { label: "Chờ khách", color: "#B7791F", bg: "#FEF9E7" },
  done: { label: "Đã xử lý", color: "#15803D", bg: "#E8F7EC" },
};
const CS_TABS = [
  { key: "all", label: "Tất cả" },
  { key: "", label: "Chưa xử lý" },
  { key: "waiting", label: "Chờ khách" },
  { key: "done", label: "Đã xử lý" },
];

/** Ảnh nhỏ có fallback nhiều URL + xem lớn khi bấm. */
function LinkThumb({ url, tag }: { url?: string; tag: string }) {
  const [idx, setIdx] = useState(0);
  const cands = url ? imageUrlCandidates(url) : [];
  if (!url || idx >= cands.length) {
    return (
      <div className="w-[40px] h-[40px] shrink-0 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-[7px] font-bold text-gray-300 tracking-wider">
        {tag}
      </div>
    );
  }
  return (
    <div className="w-[40px] h-[40px] shrink-0 rounded bg-gray-50 border border-gray-200 overflow-hidden">
      <Image
        src={cands[idx]}
        rootClassName="w-full h-full"
        className="object-contain"
        onError={() => setIdx((i) => i + 1)}
        preview={{ mask: false }}
      />
    </div>
  );
}

/** 1 ô link thiết kế: thumbnail + nhãn + ô dán link + nút upload (như client). */
function LinkCell({
  label,
  color,
  value,
  onCommit,
}: {
  label: string;
  color: string;
  value?: string;
  onCommit: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg p-1.5 bg-white w-[210px]">
      <LinkThumb url={value} tag={label} />
      <div className="flex-1 min-w-0">
        <div
          className="text-[9px] font-bold tracking-wider leading-none mb-0.5"
          style={{ color }}
        >
          {label}
        </div>
        <Input
          key={value || ""}
          defaultValue={value || ""}
          bordered={false}
          size="small"
          placeholder="Dán link..."
          className="text-[11px] p-0"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (value || "")) onCommit(v);
          }}
        />
      </div>
      <UploadImgButton size="small" onUploaded={onCommit} />
    </div>
  );
}

export default function OrderCare() {
  const admin = useAdminUser();
  const { orders, isLoading } = useOrders();
  const { sellers } = useSellers();
  const { stores } = useStores();
  const { employees } = useCsEmployees();
  const csEmpMut = useCsEmployeeMutations();
  const orderMut = useOrderMutations();
  const [newEmp, setNewEmp] = useState("");

  const addEmployee = async () => {
    const name = newEmp.trim();
    if (!name) return;
    if (employees.some((e: any) => e.name.toLowerCase() === name.toLowerCase())) {
      message.warning("Nhân viên này đã có");
      setNewEmp("");
      return;
    }
    const code = nextEmployeeCode(employees);
    await csEmpMut.add.mutateAsync({
      name,
      code,
      created: new Date().toISOString(),
    });
    message.success(`Đã tạo nhân viên "${name}" — mã ${code}`);
    setNewEmp("");
  };

  // Nhân viên cũ chưa có mã -> cấp mã tự động (chạy 1 lần cho mỗi người)
  useEffect(() => {
    const missing = employees.filter((e) => !String(e.code || "").trim());
    if (!missing.length) return;
    let seq = employees.reduce((m, e) => {
      const n = Number(String(e.code || "").replace(/\D/g, ""));
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    missing.forEach((e) => {
      seq += 1;
      csEmpMut.update.mutate({
        id: e.id,
        code: `NV${String(seq).padStart(3, "0")}`,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  /* -------- "Add ID": mã đơn khách gửi trước khi đơn được úp lên -------- */
  const { pendingIds } = usePendingOrderIds();
  const pendingMut = usePendingOrderIdMutations();
  const [newPendingId, setNewPendingId] = useState("");
  const [newPendingNote, setNewPendingNote] = useState("");

  const addPendingId = async () => {
    const code = newPendingId.trim();
    if (!code) return;
    if (
      pendingIds.some(
        (p) => p.orderCode.trim().toLowerCase() === code.toLowerCase()
      )
    ) {
      message.warning("ID này đã được add rồi");
      return;
    }
    await pendingMut.add.mutateAsync({
      orderCode: code,
      note: newPendingNote.trim(),
      createdBy: reviewer,
      created: new Date().toISOString(),
      matchedOrderId: "",
      matchedAt: "",
      ackAt: "",
    });
    message.success(`Đã add ID "${code}" — sẽ báo khi đơn thật xuất hiện`);
    setNewPendingId("");
    setNewPendingNote("");
  };

  // Mã đơn (viết thường) -> bản ghi ID đã add, để gắn badge lên dòng đơn
  const pendingByCode = useMemo(() => {
    const m = new Map<string, PendingOrderId>();
    pendingIds.forEach((p) =>
      m.set(String(p.orderCode || "").trim().toLowerCase(), p)
    );
    return m;
  }, [pendingIds]);

  // Đơn thật xuất hiện với ID đã add trước -> ghi nhận thời điểm khớp 1 lần
  useEffect(() => {
    if (!orders.length || !pendingIds.length) return;
    const codes = new Map(
      orders.map((o) => [String(o.orderCode || "").trim().toLowerCase(), o])
    );
    pendingIds
      .filter((p) => !p.matchedOrderId)
      .forEach((p) => {
        const hit = codes.get(String(p.orderCode || "").trim().toLowerCase());
        if (hit)
          pendingMut.update.mutate({
            id: p.id,
            matchedOrderId: hit.id,
            matchedAt: new Date().toISOString(),
          });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, pendingIds]);

  const [statusTab, setStatusTab] = useState("all");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [editorFilter, setEditorFilter] = useState("");
  const [trackFilter, setTrackFilter] = useState("all"); // all | has | none
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const reviewer = admin?.name || admin?.email || "admin";

  // Map userId (seller.id) -> tên seller
  const sellerName = useMemo(() => {
    const m: Record<string, string> = {};
    sellers.forEach((s: any) => (m[s.id] = s.name || s.email || s.id));
    return m;
  }, [sellers]);
  // Map storeId -> userId chủ shop (để tra ĐỐI TÁC đúng theo shop, không dùng
  // userId của đơn vì đó là tài khoản import — có thể import hộ shop khác).
  const storeOwner = useMemo(() => {
    const m: Record<string, string> = {};
    stores.forEach((s: any) => (m[s.id] = s.userId || ""));
    return m;
  }, [stores]);
  // Đối tác của đơn = seller sở hữu shop của đơn.
  const partnerOf = (o: PodOrder) => {
    const owner = (o.storeId && storeOwner[o.storeId]) || o.userId || "";
    return (owner && sellerName[owner]) || "—";
  };

  // Ghi mọi thay đổi kèm nhân viên chỉnh sửa + thời điểm.
  const patchCs = (o: PodOrder, patch: Partial<PodOrder>) =>
    orderMut.update.mutateAsync({
      id: o.id,
      ...patch,
      csEditedBy: reviewer,
      csEditedAt: new Date().toISOString(),
    } as any);

  // Ship lại = tạo MỘT ĐƠN MỚI HOÀN TOÀN (ID mới), copy dữ liệu đơn hiện tại.
  const doReship = async (o: PodOrder) => {
    const { id, created_at, ...rest } = o as any;
    await orderMut.add.mutateAsync({
      ...rest,
      orderCode: `${o.orderCode}-RS`,
      status: "reship",
      tracking: "",
      csStatus: "",
      csAssignee: "",
      csCustomerMsg: "",
      csChangeInfo: "",
      csNote: "",
      csFrontUrl: "",
      csBackUrl: "",
      csMockupUrl: "",
      csAutoReplyAt: "",
      csEditedBy: reviewer,
      csEditedAt: new Date().toISOString(),
      created: new Date().toISOString(),
    });
    message.success(`Đã tạo đơn ship lại mới từ ${o.orderCode} (ID mới)`);
  };

  const assignees = useMemo(
    () =>
      Array.from(new Set(employees.map((e: any) => e.name).filter(Boolean))).sort(),
    [employees]
  );
  const editors = useMemo(
    () =>
      Array.from(
        new Set(orders.map((o) => o.csEditedBy || "").filter(Boolean))
      ).sort(),
    [orders]
  );

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusTab !== "all" && (o.csStatus || "") !== statusTab) return false;
      if (
        assigneeFilter &&
        !(o.csAssignee || "")
          .split(",")
          .map((s) => s.trim())
          .includes(assigneeFilter)
      )
        return false;
      if (editorFilter && (o.csEditedBy || "") !== editorFilter) return false;
      if (trackFilter === "has" && !(o.tracking || "").trim()) return false;
      if (trackFilter === "none" && (o.tracking || "").trim()) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${o.orderCode} ${o.customerName || ""} ${
          o.storeName || ""
        }`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    orders,
    statusTab,
    assigneeFilter,
    editorFilter,
    trackFilter,
    search,
    storeOwner,
    sellerName,
  ]);

  useEffect(() => {
    setPage(1);
  }, [statusTab, assigneeFilter, editorFilter, trackFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": 0, waiting: 0, done: 0 };
    orders.forEach((o) => {
      c[o.csStatus || ""] = (c[o.csStatus || ""] || 0) + 1;
    });
    return c;
  }, [orders]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const stickyTd = (bg: string): React.CSSProperties => ({
    position: "sticky",
    left: 0,
    zIndex: 5,
    background: bg,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#171826]">Quản lý nhân viên</h1>
        <p className="text-gray-400 text-sm mt-1">
          Theo dõi và xử lý từng đơn: nhân viên phụ trách, tin nhắn khách, ship
          lại, refund, trạng thái. Mọi chỉnh sửa tự ghi nhận nhân viên.
        </p>
      </div>

      {/* Tạo nhân viên: danh sách để gán vào cột Nhân viên */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <span className="text-[13px] font-semibold text-[#171826]">
          Tạo nhân viên:
        </span>
        <Input
          placeholder="Tên nhân viên..."
          className="w-[220px]"
          value={newEmp}
          onChange={(e) => setNewEmp(e.target.value)}
          onPressEnter={addEmployee}
        />
        <Button
          type="primary"
          className="bg-[#171826] border-0 font-bold"
          loading={csEmpMut.add.isLoading}
          onClick={addEmployee}
        >
          + Thêm
        </Button>
        {employees.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400">Đã có:</span>
            {employees.map((e: any) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-full pl-2.5 pr-1 py-0.5"
              >
                {e.name}
                {e.code && (
                  <span className="font-mono text-[10px] text-[#4338CA]">
                    ({e.code})
                  </span>
                )}
                <Popconfirm
                  title={`Xóa nhân viên "${e.name}"?`}
                  okText="Xóa"
                  cancelText="Hủy"
                  onConfirm={() => csEmpMut.remove.mutate(e.id)}
                >
                  <button className="w-4 h-4 rounded-full text-gray-400 hover:text-red-500 border-0 bg-transparent cursor-pointer leading-none">
                    ×
                  </button>
                </Popconfirm>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Add ID: mã đơn khách gửi TRƯỚC khi đơn được úp lên hệ thống */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-semibold text-[#171826]">
            Add ID:
          </span>
          <Input
            placeholder="Mã đơn khách gửi trước..."
            className="w-[220px]"
            value={newPendingId}
            onChange={(e) => setNewPendingId(e.target.value)}
            onPressEnter={addPendingId}
          />
          <Input
            placeholder="Ghi chú (không bắt buộc)..."
            className="w-[260px]"
            value={newPendingNote}
            onChange={(e) => setNewPendingNote(e.target.value)}
            onPressEnter={addPendingId}
          />
          <Button
            type="primary"
            className="bg-[#171826] border-0 font-bold"
            loading={pendingMut.add.isLoading}
            onClick={addPendingId}
          >
            + Thêm ID
          </Button>
          <span className="text-xs text-gray-400">
            Khách báo mã đơn trước khi úp lên — khi đơn thật có mã này vào hệ
            thống, dòng đơn sẽ hiện badge đỏ để kiểm tra lại.
          </span>
        </div>
        {pendingIds.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400">Đã add:</span>
            {pendingIds.map((p) => {
              const matched = !!p.matchedOrderId;
              return (
                <Tooltip
                  key={p.id}
                  title={
                    <div className="text-xs leading-5">
                      {p.note && <div>Ghi chú: {p.note}</div>}
                      <div>
                        Thêm bởi {p.createdBy || "—"}
                        {p.created
                          ? ` · ${dayjs(p.created).format("DD/MM/YYYY HH:mm")}`
                          : ""}
                      </div>
                      <div>
                        {matched
                          ? `Đã có đơn thật lúc ${dayjs(p.matchedAt).format(
                              "DD/MM/YYYY HH:mm"
                            )}`
                          : "Chưa có đơn thật với mã này"}
                      </div>
                    </div>
                  }
                >
                  <span
                    className={`inline-flex items-center gap-1 text-xs rounded-full pl-2.5 pr-1 py-0.5 ${
                      matched
                        ? "bg-[#FDECEC] text-[#B91C1C] font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {p.orderCode}
                    {matched ? " · đã có đơn" : " · chờ"}
                    <Popconfirm
                      title={`Xoá ID "${p.orderCode}" khỏi danh sách?`}
                      okText="Xoá"
                      cancelText="Hủy"
                      onConfirm={() => pendingMut.remove.mutate(p.id)}
                    >
                      <button className="w-4 h-4 rounded-full text-gray-400 hover:text-red-500 border-0 bg-transparent cursor-pointer leading-none">
                        ×
                      </button>
                    </Popconfirm>
                  </span>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs trạng thái CS */}
      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 inline-flex gap-1 flex-wrap">
        {CS_TABS.map((t) => (
          <button
            key={t.key || "none"}
            onClick={() => setStatusTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm cursor-pointer border-0 ${
              statusTab === t.key
                ? "bg-[#171826] text-white font-bold"
                : "bg-transparent text-gray-500"
            }`}
          >
            {t.label}
            {t.key !== "all" ? ` (${counts[t.key] || 0})` : ""}
          </button>
        ))}
      </div>

      {/* Bộ lọc */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-[11px] text-gray-400 font-semibold mb-1">
            TÌM ĐƠN / KHÁCH / SHOP
          </div>
          <Input
            allowClear
            placeholder="Nhập mã đơn, tên khách, shop..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[240px]"
          />
        </div>
        <div>
          <div className="text-[11px] text-gray-400 font-semibold mb-1">
            NHÂN VIÊN PHỤ TRÁCH
          </div>
          <Select
            allowClear
            showSearch
            placeholder="Tất cả"
            className="w-[170px]"
            value={assigneeFilter || undefined}
            onChange={(v) => setAssigneeFilter(v || "")}
            options={assignees.map((a) => ({ value: a, label: a }))}
          />
        </div>
        <div>
          <div className="text-[11px] text-gray-400 font-semibold mb-1">
            NHÂN VIÊN CHỈNH SỬA
          </div>
          <Select
            allowClear
            showSearch
            placeholder="Tất cả"
            className="w-[170px]"
            value={editorFilter || undefined}
            onChange={(v) => setEditorFilter(v || "")}
            options={editors.map((a) => ({ value: a, label: a }))}
          />
        </div>
        <div>
          <div className="text-[11px] text-gray-400 font-semibold mb-1">
            TRACK
          </div>
          <Select
            className="w-[150px]"
            value={trackFilter}
            onChange={setTrackFilter}
            options={[
              { value: "all", label: "Tất cả" },
              { value: "has", label: "Đã có track" },
              { value: "none", label: "Chưa có track" },
            ]}
          />
        </div>
        <span className="ml-auto text-xs bg-gray-100 rounded-full px-3 py-1.5 text-gray-600 font-medium">
          {filtered.length} đơn
        </span>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-auto bg-white max-h-[72vh]">
        <table className="w-full text-[13px] border-collapse min-w-[1500px]">
          <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-gray-50">
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
              <th
                className="p-3 font-medium"
                style={{ position: "sticky", left: 0, top: 0, zIndex: 20 }}
              >
                Mã đơn
              </th>
              <th className="p-3 font-medium">Nhân viên</th>
              <th className="p-3 font-medium">Shop</th>
              <th className="p-3 font-medium">Đối tác</th>
              <th className="p-3 font-medium">Track</th>
              <th className="p-3 font-medium">Tin nhắn khách</th>
              <th className="p-3 font-medium">Đổi thông tin</th>
              <th className="p-3 font-medium">Link mặt trước</th>
              <th className="p-3 font-medium">Link mặt sau</th>
              <th className="p-3 font-medium">Mockup</th>
              <th className="p-3 font-medium">Ship lại</th>
              <th className="p-3 font-medium">Refund</th>
              <th className="p-3 font-medium">Trạng thái</th>
              <th className="p-3 font-medium">TG trả lời tự động</th>
              <th className="p-3 font-medium">Ghi chú</th>
              <th className="p-3 font-medium">Nhân viên sửa</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={16} className="p-12 text-center text-gray-400">
                  Đang tải...
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={16} className="p-12 text-center text-gray-400">
                  Không có đơn nào
                </td>
              </tr>
            ) : (
              paged.map((o) => {
                const cs = CS_STATUS[o.csStatus || ""] || CS_STATUS[""];
                const isRefund = o.status === "refund";
                const assigned = (o.csAssignee || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                // Đơn đã có nhân viên xử lý -> tô màu để dễ nhận biết.
                const rowBg = assigned.length ? "#FFF7ED" : "#fff";
                return (
                  <tr
                    key={o.id}
                    className="border-b border-gray-50 align-top"
                    style={{ background: rowBg }}
                  >
                    {/* Mã đơn + Khách (ghim trái) */}
                    <td className="p-3" style={stickyTd(rowBg)}>
                      <div className="font-bold text-[#171826]">
                        {o.orderCode}
                      </div>
                      <div className="text-xs text-gray-400">
                        {o.customerName || "—"}
                      </div>
                      {/* Đơn trùng mã đã "Add ID" trước đó -> báo để kiểm tra */}
                      {(() => {
                        const p = pendingByCode.get(
                          String(o.orderCode || "").trim().toLowerCase()
                        );
                        if (!p || p.ackAt) return null;
                        return (
                          <Tooltip
                            title={
                              <div className="text-xs leading-5">
                                Mã đơn này đã được add trước bởi{" "}
                                {p.createdBy || "—"}
                                {p.created
                                  ? ` (${dayjs(p.created).format(
                                      "DD/MM/YYYY HH:mm"
                                    )})`
                                  : ""}
                                .
                                {p.note && <div>Ghi chú: {p.note}</div>}
                                <div>
                                  Kiểm tra lại xem đơn có đổi ID hay không, rồi
                                  bấm để tắt cảnh báo.
                                </div>
                              </div>
                            }
                          >
                            <button
                              onClick={() =>
                                pendingMut.update.mutate(
                                  {
                                    id: p.id,
                                    ackAt: new Date().toISOString(),
                                  },
                                  {
                                    onSuccess: () => {
                                      message.success(
                                        `Đã xác nhận kiểm tra ID ${o.orderCode}`
                                      );
                                    },
                                  }
                                )
                              }
                              className="mt-1 inline-block text-[10px] font-bold rounded px-1.5 py-0.5 border-0 cursor-pointer bg-[#FDECEC] text-[#B91C1C]"
                            >
                              ID ĐÃ ADD TRƯỚC — KIỂM TRA
                            </button>
                          </Tooltip>
                        );
                      })()}
                    </td>
                    {/* Nhân viên xử lý: chọn nhiều từ danh sách; CHỌN RỒI thì
                        khóa lại (không cho sửa) — hiển thị dạng thẻ. */}
                    <td className="p-3 min-w-[180px]">
                      {assigned.length ? (
                        <div className="flex flex-wrap gap-1">
                          {assigned.map((n) => (
                            <span
                              key={n}
                              className="text-[11px] font-semibold bg-[#EEF0FF] text-[#4338CA] rounded px-2 py-0.5"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <Select
                          mode="multiple"
                          size="small"
                          allowClear
                          placeholder="Chọn NV xử lý..."
                          className="w-[180px]"
                          value={assigned}
                          onChange={(arr: string[]) =>
                            patchCs(o, { csAssignee: arr.join(",") })
                          }
                          options={employees.map((e: any) => ({
                            value: e.name,
                            label: e.name,
                          }))}
                        />
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">{o.storeName || "—"}</td>
                    {/* Đối tác = seller/chủ shop của đơn */}
                    <td className="p-3 whitespace-nowrap font-medium text-[#171826]">
                      {partnerOf(o)}
                    </td>
                    {/* Track */}
                    <td className="p-3 min-w-[150px]">
                      <Input
                        size="small"
                        key={o.tracking || ""}
                        defaultValue={o.tracking || ""}
                        placeholder="Mã track..."
                        className="w-[150px]"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (o.tracking || "")) {
                            patchCs(o, { tracking: v } as any);
                          }
                        }}
                      />
                    </td>
                    {/* Tin nhắn khách */}
                    <td className="p-3 min-w-[180px]">
                      <Input.TextArea
                        size="small"
                        key={o.csCustomerMsg || ""}
                        defaultValue={o.csCustomerMsg || ""}
                        placeholder="Nội dung tin nhắn..."
                        autoSize={{ minRows: 1, maxRows: 3 }}
                        className="w-[180px]"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (o.csCustomerMsg || "")) {
                            patchCs(o, { csCustomerMsg: v });
                          }
                        }}
                      />
                    </td>
                    {/* Đổi thông tin */}
                    <td className="p-3 min-w-[160px]">
                      <Input.TextArea
                        size="small"
                        key={o.csChangeInfo || ""}
                        defaultValue={o.csChangeInfo || ""}
                        placeholder="Địa chỉ/size/màu mới..."
                        autoSize={{ minRows: 1, maxRows: 3 }}
                        className="w-[160px]"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (o.csChangeInfo || "")) {
                            patchCs(o, { csChangeInfo: v });
                          }
                        }}
                      />
                    </td>
                    {/* Link mặt trước / mặt sau / mockup — có thumbnail + upload */}
                    <td className="p-3">
                      <LinkCell
                        label="FRONT"
                        color="#3B82F6"
                        value={o.csFrontUrl}
                        onCommit={(v) => patchCs(o, { csFrontUrl: v })}
                      />
                    </td>
                    <td className="p-3">
                      <LinkCell
                        label="BACK"
                        color="#8B5CF6"
                        value={o.csBackUrl}
                        onCommit={(v) => patchCs(o, { csBackUrl: v })}
                      />
                    </td>
                    <td className="p-3">
                      <LinkCell
                        label="MOCKUP"
                        color="#059669"
                        value={o.csMockupUrl}
                        onCommit={(v) => patchCs(o, { csMockupUrl: v })}
                      />
                    </td>
                    {/* Ship lại = tạo đơn mới hoàn toàn (ID mới) */}
                    <td className="p-3">
                      <Popconfirm
                        title="Tạo đơn ship lại mới?"
                        description="Sẽ tạo MỘT đơn mới hoàn toàn (ID mới) copy từ đơn này."
                        okText="Ship lại"
                        cancelText="Hủy"
                        onConfirm={() => doReship(o)}
                      >
                        <Button
                          size="small"
                          icon={<FiRotateCcw size={12} />}
                          className="rounded-lg"
                        >
                          Ship lại
                        </Button>
                      </Popconfirm>
                    </td>
                    {/* Refund */}
                    <td className="p-3 min-w-[150px]">
                      <div className="flex items-center gap-1">
                        <Input
                          size="small"
                          prefix="$"
                          key={o.refundedAmount ?? ""}
                          defaultValue={
                            o.refundedAmount != null ? String(o.refundedAmount) : ""
                          }
                          placeholder="0"
                          className="w-[80px]"
                          onBlur={(e) => {
                            const raw = e.target.value.replace(/[^0-9.]/g, "");
                            const v = raw === "" ? null : Number(raw);
                            if (v !== (o.refundedAmount ?? null)) {
                              patchCs(o, {
                                refundedAmount: v,
                                status: v ? "refund" : o.status,
                                refundedAt: v ? new Date().toISOString() : "",
                              } as any);
                            }
                          }}
                        />
                        {isRefund && (
                          <span className="text-[10px] font-bold text-rose-600">
                            REFUND
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Trạng thái CS */}
                    <td className="p-3">
                      <Select
                        size="small"
                        className="w-[130px]"
                        value={o.csStatus || ""}
                        onChange={(v) => patchCs(o, { csStatus: v })}
                        options={Object.entries(CS_STATUS).map(([k, v]) => ({
                          value: k,
                          label: v.label,
                        }))}
                      />
                      <div
                        className="mt-1 inline-block text-[10px] font-bold px-2 py-0.5 rounded"
                        style={{ color: cs.color, background: cs.bg }}
                      >
                        {cs.label.toUpperCase()}
                      </div>
                    </td>
                    {/* TG trả lời tự động */}
                    <td className="p-3 whitespace-nowrap min-w-[150px]">
                      <div className="text-xs text-gray-600">
                        {o.csAutoReplyAt
                          ? dayjs(o.csAutoReplyAt).format("DD/MM HH:mm")
                          : "—"}
                      </div>
                      <div className="flex gap-1 mt-1">
                        <Tooltip title="Đặt thời gian trả lời = bây giờ">
                          <Button
                            size="small"
                            icon={<FiClock size={11} />}
                            onClick={() =>
                              patchCs(o, {
                                csAutoReplyAt: new Date().toISOString(),
                              })
                            }
                          >
                            Đặt giờ
                          </Button>
                        </Tooltip>
                        {o.csAutoReplyAt && (
                          <Button
                            size="small"
                            onClick={() => patchCs(o, { csAutoReplyAt: "" })}
                          >
                            Xóa
                          </Button>
                        )}
                      </div>
                    </td>
                    {/* Ghi chú / sticker */}
                    <td className="p-3 min-w-[160px]">
                      <Input.TextArea
                        size="small"
                        key={o.csNote || ""}
                        defaultValue={o.csNote || ""}
                        placeholder="Ghi chú / sticker..."
                        autoSize={{ minRows: 1, maxRows: 3 }}
                        className="w-[160px]"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (o.csNote || "")) patchCs(o, { csNote: v });
                        }}
                      />
                    </td>
                    {/* Nhân viên sửa gần nhất */}
                    <td className="p-3 whitespace-nowrap">
                      {o.csEditedBy ? (
                        <>
                          <div className="text-xs font-semibold text-[#171826]">
                            {o.csEditedBy}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {o.csEditedAt
                              ? dayjs(o.csEditedAt).format("DD/MM HH:mm")
                              : ""}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-gray-500">
            Đang hiện {paged.length} / {filtered.length} đơn · Trang {page}/
            {totalPages}
          </span>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={filtered.length}
            showSizeChanger
            pageSizeOptions={[20, 50, 100, 200]}
            showQuickJumper
            showTotal={(t, [a, b]) => `${a}-${b} / ${t}`}
            onChange={(p, ps) => {
              setPage(ps !== pageSize ? 1 : p);
              setPageSize(ps);
            }}
          />
        </div>
      )}
    </div>
  );
}
