import {
  Button,
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
import {
  useCsEmployeeMutations,
  useCsEmployees,
  useOrderMutations,
  useOrders,
  useSellers,
  useStores,
} from "../../hooks/useAdmin";
import { useAdminUser } from "../../hooks/useAdminAuth";
import { PodOrder } from "../../models/admin";

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
    await csEmpMut.add.mutateAsync({ name, created: new Date().toISOString() });
    message.success(`Đã tạo nhân viên "${name}"`);
    setNewEmp("");
  };

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
                <td colSpan={13} className="p-12 text-center text-gray-400">
                  Đang tải...
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-12 text-center text-gray-400">
                  Không có đơn nào
                </td>
              </tr>
            ) : (
              paged.map((o) => {
                const cs = CS_STATUS[o.csStatus || ""] || CS_STATUS[""];
                const isReship = o.status === "reship";
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
                    </td>
                    {/* Nhân viên xử lý: để trống, chọn nhiều từ danh sách đã tạo */}
                    <td className="p-3 min-w-[180px]">
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
                    {/* Ship lại */}
                    <td className="p-3">
                      <Button
                        size="small"
                        icon={<FiRotateCcw size={12} />}
                        className={`rounded-lg ${
                          isReship
                            ? "bg-indigo-600 text-white border-0"
                            : ""
                        }`}
                        onClick={() =>
                          patchCs(o, {
                            status: isReship ? "in_production" : "reship",
                          } as any).then(() =>
                            message.success(
                              isReship ? "Bỏ đánh dấu reship" : "Đã đánh dấu Ship lại"
                            )
                          )
                        }
                      >
                        {isReship ? "Reship ✓" : "Ship lại"}
                      </Button>
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
