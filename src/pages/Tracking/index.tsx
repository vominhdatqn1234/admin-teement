/**
 * Quản lý Tracking vận chuyển — theo file "Trackking.csv":
 * Order ID, Track, Nhà vận chuyển.
 * CRUD + Import CSV (tự áp tracking vào đơn hàng trùng Order ID,
 * chuyển đơn sang Đang giao hàng) + Export CSV + chọn nhiều + phân trang.
 */
import {
  Button,
  Checkbox,
  Input,
  Pagination,
  Popconfirm,
  message,
} from "antd";
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "react-query";
import { FiDownload, FiPlus, FiTrash2, FiUpload } from "react-icons/fi";
import {
  useOrderMutations,
  useOrders,
  useTrackingMutations,
  useTrackings,
} from "../../hooks/useAdmin";
import { downloadCSV, parseCSV, toCSV } from "../../lib/csvPod";
import { sbUpsert } from "../../lib/supabase";
import { TrackingRow } from "../../models/admin";

function genId(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 20; i++)
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

// Chấp nhận cả header gõ thiếu chữ ("Oder ID") lẫn chuẩn
const col = (r: Record<string, string>, ...names: string[]) => {
  for (const n of names) if (r[n]) return r[n].trim();
  return "";
};

export default function Tracking() {
  const { trackings } = useTrackings();
  const { update, removeMany } = useTrackingMutations();
  const { orders } = useOrders();
  const orderMut = useOrderMutations();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ orderId: "", tracking: "", carrier: "" });
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return trackings;
    return trackings.filter((t) =>
      [t.orderId, t.tracking, t.carrier]
        .map((x) => (x || "").toLowerCase())
        .some((x) => x.includes(s))
    );
  }, [trackings, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = paged.map((t) => t.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  // Áp tracking vào đơn hàng trùng Order ID (orderCode) -> Đang giao hàng
  const applyToOrders = async (
    rows: { orderId: string; tracking: string }[]
  ) => {
    let applied = 0;
    for (const r of rows) {
      const order = orders.find((o) => o.orderCode === r.orderId);
      if (!order || !r.tracking || order.tracking === r.tracking) continue;
      await orderMut.update.mutateAsync({
        id: order.id,
        tracking: r.tracking,
        status: "shipping",
      });
      applied++;
    }
    return applied;
  };

  /* ---------- Import: upsert theo Order ID + tự áp vào đơn ---------- */
  const handleImport = async (file: File) => {
    const rows = parseCSV(await file.text());
    if (!rows.length) return message.error("File CSV trống");
    const byOrder = new Map(
      trackings.map((t) => [(t.orderId || "").trim(), t.id])
    );
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const upserts: any[] = [];
    for (const r of rows) {
      const orderId = col(r, "Order ID", "Oder ID", "orderId", "Mã đơn");
      const tracking = col(r, "Track", "Tracking", "tracking");
      if (!orderId || seen.has(orderId)) continue;
      seen.add(orderId);
      upserts.push({
        id: byOrder.get(orderId) || genId(),
        orderId,
        tracking,
        carrier: col(r, "Nhà vận chuyển", "Carrier", "carrier"),
        created: now,
      });
    }
    if (!upserts.length)
      return message.error('Không thấy cột "Order ID"/"Oder ID" — sai định dạng');
    setImporting(true);
    try {
      await sbUpsert("trackings", upserts);
      qc.invalidateQueries(["adm-trackings"]);
      message.success(`Đã import ${upserts.length} tracking`);
      // Có Order ID trùng đơn hàng -> tự thêm tracking vào đơn luôn
      const applied = await applyToOrders(upserts);
      if (applied)
        message.success(
          `Đã tự áp tracking vào ${applied} đơn hàng (chuyển Đang giao hàng)`
        );
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    if (!filtered.length) return message.warning("Không có dòng nào để xuất");
    downloadCSV(
      "tracking.csv",
      toCSV(
        ["Order ID", "Track", "Nhà vận chuyển"],
        filtered.map((t) => [t.orderId || "", t.tracking || "", t.carrier || ""])
      )
    );
    message.success(`Đã xuất ${filtered.length} dòng`);
  };

  const addRow = async () => {
    const orderId = draft.orderId.trim();
    if (!orderId) return message.warning("Nhập Order ID");
    if (trackings.some((t) => (t.orderId || "").trim() === orderId))
      return message.warning(`Order ID ${orderId} đã có tracking`);
    await sbUpsert("trackings", [
      {
        id: genId(),
        orderId,
        tracking: draft.tracking.trim(),
        carrier: draft.carrier.trim(),
        created: new Date().toISOString(),
      },
    ]);
    qc.invalidateQueries(["adm-trackings"]);
    const applied = await applyToOrders([
      { orderId, tracking: draft.tracking.trim() },
    ]);
    message.success(
      `Đã thêm tracking cho ${orderId}${applied ? " — áp vào đơn hàng luôn" : ""}`
    );
    setDraft({ orderId: "", tracking: "", carrier: "" });
    setAddOpen(false);
  };

  const saveField = (t: TrackingRow, field: string, value: string) => {
    update.mutate({ id: t.id, [field]: value } as any);
    // Sửa tracking -> đồng bộ vào đơn nếu trùng Order ID
    if (field === "tracking" && value)
      applyToOrders([{ orderId: (t.orderId || "").trim(), tracking: value }]);
  };

  const handleBulkDelete = async () => {
    await removeMany.mutateAsync(selectedIds as any);
    message.success(`Đã xóa ${selectedIds.length} tracking`);
    setSelectedIds([]);
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 m-0">
        Quản lý Tracking
      </h1>
      <p className="text-gray-500 text-sm mt-1">
        Import file tracking — Order ID trùng với đơn hàng sẽ tự thêm tracking
        vào đơn và chuyển sang Đang giao hàng.
      </p>

      {/* Thanh công cụ */}
      <div className="border border-gray-200 rounded-xl p-4 mt-4 bg-white flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            TÌM KIẾM
          </div>
          <Input
            className="w-[240px]"
            placeholder="Order ID / tracking / nhà vận chuyển..."
            allowClear
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button icon={<FiPlus />} onClick={() => setAddOpen((v) => !v)}>
          Thêm tracking
        </Button>
        <Button
          icon={<FiUpload />}
          loading={importing}
          onClick={() => fileRef.current?.click()}
        >
          Import CSV
        </Button>
        <Button icon={<FiDownload />} onClick={handleExport}>
          Export CSV
        </Button>
        {selectedIds.length > 0 && (
          <Popconfirm
            title={`Xóa ${selectedIds.length} tracking đã chọn?`}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={handleBulkDelete}
          >
            <Button danger icon={<FiTrash2 />}>
              Xóa đã chọn ({selectedIds.length})
            </Button>
          </Popconfirm>
        )}
        <span className="ml-auto text-xs bg-gray-100 rounded-full px-3 py-1 text-gray-600 font-medium">
          {filtered.length} tracking
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* Form thêm nhanh */}
      {addOpen && (
        <div className="border border-[#EADFC8] bg-[#FBF6EC] rounded-xl p-4 mt-3 flex items-end gap-2 flex-wrap">
          <Input
            className="w-[180px]"
            placeholder="Order ID *"
            value={draft.orderId}
            onChange={(e) => setDraft((d) => ({ ...d, orderId: e.target.value }))}
          />
          <Input
            className="w-[280px]"
            placeholder="Mã tracking"
            value={draft.tracking}
            onChange={(e) =>
              setDraft((d) => ({ ...d, tracking: e.target.value }))
            }
          />
          <Input
            className="w-[140px]"
            placeholder="Nhà vận chuyển"
            value={draft.carrier}
            onChange={(e) => setDraft((d) => ({ ...d, carrier: e.target.value }))}
          />
          <Button type="primary" className="bg-[#171826]" onClick={addRow}>
            Lưu
          </Button>
        </div>
      )}

      {/* Bảng */}
      <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white mt-4">
        <table className="w-full text-[13px] border-collapse min-w-[760px]">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-2.5 w-9">
                <Checkbox
                  checked={allPageSelected}
                  indeterminate={
                    !allPageSelected &&
                    pageIds.some((id) => selectedIds.includes(id))
                  }
                  onChange={(e) =>
                    setSelectedIds((prev) =>
                      e.target.checked
                        ? Array.from(new Set([...prev, ...pageIds]))
                        : prev.filter((id) => !pageIds.includes(id))
                    )
                  }
                />
              </th>
              <th className="p-2.5 font-medium">Order ID</th>
              <th className="p-2.5 font-medium">Tracking</th>
              <th className="p-2.5 font-medium">Nhà vận chuyển</th>
              <th className="p-2.5 font-medium">Khớp đơn hàng</th>
              <th className="p-2.5 font-medium w-14"></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((t) => {
              const matched = orders.find(
                (o) => o.orderCode === (t.orderId || "").trim()
              );
              return (
                <tr
                  key={t.id}
                  className={`border-b border-gray-50 ${
                    selectedIds.includes(t.id) ? "bg-[#EFF4FF]" : ""
                  }`}
                >
                  <td className="p-2.5">
                    <Checkbox
                      checked={selectedIds.includes(t.id)}
                      onChange={(e) =>
                        setSelectedIds((prev) =>
                          e.target.checked
                            ? [...prev, t.id]
                            : prev.filter((x) => x !== t.id)
                        )
                      }
                    />
                  </td>
                  <td className="p-2.5 font-semibold text-gray-900">
                    {t.orderId}
                  </td>
                  <td className="p-1.5">
                    <Input
                      key={t.tracking || ""}
                      size="small"
                      className="w-[240px] font-mono text-xs"
                      defaultValue={t.tracking || ""}
                      placeholder="Mã tracking..."
                      onPressEnter={(e) =>
                        (e.target as HTMLInputElement).blur()
                      }
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (t.tracking || ""))
                          saveField(t, "tracking", v);
                      }}
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      key={t.carrier || ""}
                      size="small"
                      className="w-[120px]"
                      defaultValue={t.carrier || ""}
                      placeholder="USPS..."
                      onPressEnter={(e) =>
                        (e.target as HTMLInputElement).blur()
                      }
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (t.carrier || "")) saveField(t, "carrier", v);
                      }}
                    />
                  </td>
                  <td className="p-2.5">
                    {matched ? (
                      <span className="bg-emerald-50 text-emerald-600 text-[11px] font-medium rounded px-2 py-0.5">
                        ✓ {matched.storeName || "Đơn"} —{" "}
                        {matched.tracking === t.tracking
                          ? "đã áp tracking"
                          : "chưa áp"}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">
                        Không có đơn trùng
                      </span>
                    )}
                  </td>
                  <td className="p-2.5">
                    <Popconfirm
                      title={`Xóa tracking của ${t.orderId}?`}
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={async () => {
                        await removeMany.mutateAsync([t.id] as any);
                        message.success("Đã xóa tracking");
                      }}
                    >
                      <button className="w-7 h-7 rounded-md border border-red-100 bg-red-50 text-red-500 inline-flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white">
                        <FiTrash2 size={13} />
                      </button>
                    </Popconfirm>
                  </td>
                </tr>
              );
            })}
            {!paged.length && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-gray-400">
                  {trackings.length
                    ? "Không có tracking nào khớp tìm kiếm"
                    : "Chưa có tracking — bấm Import CSV để nạp file"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="flex justify-end p-3 border-t border-gray-100">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={filtered.length}
              showSizeChanger
              pageSizeOptions={[10, 50, 100, 200, 500]}
              showTotal={(t) => `${t} dòng`}
              onChange={(p, ps) => {
                setPage(ps !== pageSize ? 1 : p);
                setPageSize(ps);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
