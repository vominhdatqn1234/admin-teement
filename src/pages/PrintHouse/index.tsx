/**
 * CRUD Đơn gửi Nhà In — đúng định dạng file "Nhà In AK2" (41 cột).
 * Có chọn nhiều, phân trang, Import CSV (upsert theo Order ID + SKU),
 * Export CSV cùng định dạng để gửi thẳng cho nhà in.
 */
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Tooltip,
  message,
} from "antd";
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "react-query";
import { FiDownload, FiEdit3, FiPlus, FiTrash2, FiUpload } from "react-icons/fi";
import { usePrintOrderMutations, usePrintOrders } from "../../hooks/useAdmin";
import { downloadCSV, parseCSV, toCSV } from "../../lib/csvPod";
import { sbUpsert } from "../../lib/supabase";
import { PrintOrder } from "../../models/admin";

// Nguồn duy nhất: field <-> cột CSV (đúng thứ tự file gốc)
const FIELDS: { key: keyof PrintOrder; csv: string }[] = [
  { key: "orderDate", csv: "Order Date" },
  { key: "orderId", csv: "Order ID" },
  { key: "orderSource", csv: "Order Source" },
  { key: "address1", csv: "Shipping Address 1" },
  { key: "address2", csv: "Shipping Address 2" },
  { key: "city", csv: "City" },
  { key: "countryCode", csv: "Country Code" },
  { key: "firstName", csv: "Customer First Name" },
  { key: "lastName", csv: "Customer Last Name" },
  { key: "phone", csv: "Customer Phone Number" },
  { key: "state", csv: "State or Region" },
  { key: "zip", csv: "Zip" },
  { key: "shippingMethod", csv: "Shipping Method" },
  { key: "shippingLabelUrl", csv: "Shipping Label URL" },
  { key: "productCode", csv: "Product Code" },
  { key: "size", csv: "Size" },
  { key: "color", csv: "Color" },
  { key: "sku", csv: "SKU" },
  { key: "quantity", csv: "Quantity" },
  { key: "frontDesignUrl", csv: "Front Design URL" },
  { key: "frontMockupUrl", csv: "Front Mockup URL" },
  { key: "backDesignUrl", csv: "Back Design URL" },
  { key: "backMockupUrl", csv: "Back Mockup URL" },
  { key: "leftSleeveDesignUrl", csv: "Left Sleeve Design URL" },
  { key: "leftSleeveMockupUrl", csv: "Left Sleeve Mockup URL" },
  { key: "rightSleeveDesignUrl", csv: "Right Sleeve Design URL" },
  { key: "rightSleeveMockupUrl", csv: "Right Sleeve Mockup URL" },
  { key: "specialFrontDesignUrl", csv: "Special Front Design URL" },
  { key: "specialFrontMockupUrl", csv: "Special Front Mockup URL" },
  { key: "specialBackDesignUrl", csv: "Special Back Design URL" },
  { key: "specialBackMockupUrl", csv: "Special Back Mockup URL" },
  { key: "specialLeftSleeveDesignUrl", csv: "Special Left Sleeve Design URL" },
  { key: "specialLeftSleeveMockupUrl", csv: "Special Left Sleeve Mockup URL" },
  { key: "specialRightSleeveDesignUrl", csv: "Special Right Sleeve Design URL" },
  { key: "specialRightSleeveMockupUrl", csv: "Special Right Sleeve Mockup URL" },
  { key: "frontPrintSize", csv: "Front Print Size" },
  { key: "backPrintSize", csv: "Back Print Size" },
  { key: "producingService", csv: "Producing Service" },
  { key: "technology", csv: "Technology" },
  { key: "pushTracking", csv: "Push Tracking" },
  { key: "note", csv: "Note" },
];

function genId(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 20; i++)
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

const keyOf = (o: Partial<PrintOrder>) =>
  `${(o.orderId || "").trim()}|${(o.sku || "").trim().toLowerCase()}`;

const linkCell = (url?: string) =>
  url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-[#2563EB] text-xs no-underline hover:underline"
    >
      Link
    </a>
  ) : (
    <span className="text-gray-300 text-xs">—</span>
  );

export default function PrintHouse() {
  const { printOrders } = usePrintOrders();
  const { update, removeMany } = usePrintOrderMutations();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<Partial<PrintOrder> | null>(null);
  const [importing, setImporting] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return printOrders;
    return printOrders.filter((o) =>
      [o.orderId, o.sku, o.firstName, o.lastName, o.city, o.color, o.size]
        .map((x) => (x || "").toLowerCase())
        .some((x) => x.includes(s))
    );
  }, [printOrders, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = paged.map((o) => o.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  /* ---------- Import: upsert theo Order ID + SKU ---------- */
  const handleImport = async (file: File) => {
    const rows = parseCSV(await file.text());
    if (!rows.length) return message.error("File CSV trống");
    if (!("Order ID" in rows[0]))
      return message.error('Không thấy cột "Order ID" — sai định dạng file');
    const byKey = new Map(printOrders.map((o) => [keyOf(o), o.id]));
    const now = new Date().toISOString();
    const upserts: any[] = [];
    for (const r of rows) {
      const data: any = {};
      FIELDS.forEach(({ key, csv }) => (data[key] = (r[csv] || "").trim()));
      if (!data.orderId && !data.sku) continue;
      data.quantity = parseInt(data.quantity) || 1;
      data.id = byKey.get(keyOf(data)) || genId();
      data.created = now;
      upserts.push(data);
    }
    if (!upserts.length) return message.error("Không có dòng hợp lệ");
    const CHUNK = 300;
    setImporting({ done: 0, total: upserts.length });
    try {
      for (let i = 0; i < upserts.length; i += CHUNK) {
        await sbUpsert("printOrders", upserts.slice(i, i + CHUNK));
        setImporting({
          done: Math.min(i + CHUNK, upserts.length),
          total: upserts.length,
        });
      }
      qc.invalidateQueries(["adm-print-orders"]);
      message.success(`Đã import ${upserts.length} dòng đơn nhà in`);
    } finally {
      setImporting(null);
    }
  };

  /* ---------- Export: đúng định dạng AK2 ---------- */
  const handleExport = (list: PrintOrder[], filename: string) => {
    if (!list.length) return message.warning("Không có dòng nào để xuất");
    downloadCSV(
      filename,
      toCSV(
        FIELDS.map((f) => f.csv),
        list.map((o) => FIELDS.map(({ key }) => (o as any)[key] ?? ""))
      )
    );
    message.success(`Đã xuất ${list.length} dòng`);
  };

  const saveEditing = async () => {
    if (!editing) return;
    const data: any = { ...editing };
    data.quantity = Number(data.quantity) || 1;
    if (data.id) {
      await update.mutateAsync(data);
      message.success(`Đã cập nhật đơn ${data.orderId || ""}`);
    } else {
      await sbUpsert("printOrders", [
        { ...data, id: genId(), created: new Date().toISOString() },
      ]);
      qc.invalidateQueries(["adm-print-orders"]);
      message.success(`Đã thêm đơn ${data.orderId || ""}`);
    }
    setEditing(null);
  };

  const handleBulkDelete = async () => {
    await removeMany.mutateAsync(selectedIds as any);
    message.success(`Đã xóa ${selectedIds.length} dòng`);
    setSelectedIds([]);
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 m-0">Nhà In</h1>
      <p className="text-gray-500 text-sm mt-1">
        Quản lý đơn gửi nhà in theo định dạng AK2 — import file về sửa, export
        gửi thẳng cho nhà in.
      </p>

      {/* Thanh công cụ */}
      <div className="border border-gray-200 rounded-xl p-4 mt-4 bg-white flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            TÌM KIẾM
          </div>
          <Input
            className="w-[240px]"
            placeholder="Order ID / SKU / khách / màu..."
            allowClear
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button icon={<FiPlus />} onClick={() => setEditing({ quantity: 1 })}>
          Thêm dòng
        </Button>
        <Button
          icon={<FiUpload />}
          loading={!!importing}
          onClick={() => fileRef.current?.click()}
        >
          {importing
            ? `Đang import ${importing.done}/${importing.total}...`
            : "Import CSV"}
        </Button>
        <Button
          icon={<FiDownload />}
          onClick={() => handleExport(filtered, "nha-in-ak2.csv")}
        >
          Export CSV
        </Button>
        {selectedIds.length > 0 && (
          <>
            <Button
              icon={<FiDownload />}
              onClick={() =>
                handleExport(
                  filtered.filter((o) => selectedIds.includes(o.id)),
                  "nha-in-ak2-da-chon.csv"
                )
              }
            >
              Export đã chọn ({selectedIds.length})
            </Button>
            <Popconfirm
              title={`Xóa ${selectedIds.length} dòng đã chọn?`}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={handleBulkDelete}
            >
              <Button danger icon={<FiTrash2 />}>
                Xóa đã chọn ({selectedIds.length})
              </Button>
            </Popconfirm>
          </>
        )}
        <span className="ml-auto text-xs bg-gray-100 rounded-full px-3 py-1 text-gray-600 font-medium">
          {filtered.length} dòng
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

      {/* Bảng */}
      <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white mt-4">
        <table className="w-full text-[13px] border-collapse min-w-[1200px]">
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
              <th className="p-2.5 font-medium">Ngày</th>
              <th className="p-2.5 font-medium">Order ID</th>
              <th className="p-2.5 font-medium">Khách hàng</th>
              <th className="p-2.5 font-medium">Địa chỉ</th>
              <th className="p-2.5 font-medium">SKU</th>
              <th className="p-2.5 font-medium">Màu / Size</th>
              <th className="p-2.5 font-medium text-center">SL</th>
              <th className="p-2.5 font-medium text-center">Front</th>
              <th className="p-2.5 font-medium text-center">Back</th>
              <th className="p-2.5 font-medium">In / Công nghệ</th>
              <th className="p-2.5 font-medium">Note</th>
              <th className="p-2.5 font-medium w-[90px]">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((o) => (
              <tr
                key={o.id}
                className={`border-b border-gray-50 align-top ${
                  selectedIds.includes(o.id) ? "bg-[#EFF4FF]" : ""
                }`}
              >
                <td className="p-2.5">
                  <Checkbox
                    checked={selectedIds.includes(o.id)}
                    onChange={(e) =>
                      setSelectedIds((prev) =>
                        e.target.checked
                          ? [...prev, o.id]
                          : prev.filter((x) => x !== o.id)
                      )
                    }
                  />
                </td>
                <td className="p-2.5 whitespace-nowrap">
                  {o.orderDate || "—"}
                </td>
                <td className="p-2.5 font-semibold text-gray-900">
                  {o.orderId || "—"}
                </td>
                <td className="p-2.5">
                  <div className="font-medium">
                    {[o.firstName, o.lastName].filter(Boolean).join(" ") || "—"}
                  </div>
                  <div className="text-gray-400 text-xs">{o.phone}</div>
                </td>
                <td className="p-2.5 text-xs text-gray-600 max-w-[180px]">
                  {[o.address1, o.address2, o.city, o.state, o.zip, o.countryCode]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td className="p-2.5 font-mono text-xs">{o.sku || "—"}</td>
                <td className="p-2.5 whitespace-nowrap">
                  {[o.color, o.size].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="p-2.5 text-center">{o.quantity || 1}</td>
                <td className="p-2.5 text-center">
                  {linkCell(o.frontDesignUrl)}
                </td>
                <td className="p-2.5 text-center">
                  {linkCell(o.backDesignUrl)}
                </td>
                <td className="p-2.5 text-xs whitespace-nowrap">
                  {[o.frontPrintSize, o.technology]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                <td className="p-2.5 text-xs text-gray-500 max-w-[140px] truncate">
                  {o.note || "—"}
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-1.5">
                    <Tooltip title="Sửa dòng (đầy đủ 41 cột)">
                      <button
                        onClick={() => setEditing({ ...o })}
                        className="w-7 h-7 rounded-md border border-[#D6E4FF] bg-[#EFF4FF] text-[#2563EB] inline-flex items-center justify-center cursor-pointer hover:bg-[#2563EB] hover:text-white"
                      >
                        <FiEdit3 size={13} />
                      </button>
                    </Tooltip>
                    <Popconfirm
                      title={`Xóa dòng ${o.orderId || ""}?`}
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={async () => {
                        await removeMany.mutateAsync([o.id] as any);
                        message.success("Đã xóa dòng");
                      }}
                    >
                      <button className="w-7 h-7 rounded-md border border-red-100 bg-red-50 text-red-500 inline-flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white">
                        <FiTrash2 size={13} />
                      </button>
                    </Popconfirm>
                  </div>
                </td>
              </tr>
            ))}
            {!paged.length && (
              <tr>
                <td colSpan={13} className="p-12 text-center text-gray-400">
                  {printOrders.length
                    ? "Không có dòng nào khớp tìm kiếm"
                    : "Chưa có dữ liệu — bấm Import CSV để nạp file Nhà In AK2"}
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
              pageSizeOptions={[50, 100, 200, 1000]}
              showTotal={(t) => `${t} dòng`}
              onChange={(p, ps) => {
                setPage(ps !== pageSize ? 1 : p);
                setPageSize(ps);
              }}
            />
          </div>
        )}
      </div>

      {/* Modal thêm / sửa — đầy đủ 41 field */}
      <Modal
        open={!!editing}
        width={860}
        title={editing?.id ? `Sửa dòng ${editing.orderId || ""}` : "Thêm dòng mới"}
        okText="Lưu"
        cancelText="Hủy"
        onOk={saveEditing}
        onCancel={() => setEditing(null)}
      >
        {editing && (
          <div className="grid grid-cols-3 gap-x-3 gap-y-2 pt-2 max-h-[62vh] overflow-y-auto pr-1">
            {FIELDS.map(({ key, csv }) => (
              <div key={key}>
                <div className="text-[10px] tracking-wide text-gray-400 mb-0.5">
                  {csv}
                </div>
                {key === "quantity" ? (
                  <InputNumber
                    className="w-full"
                    min={1}
                    value={Number(editing.quantity) || 1}
                    onChange={(v) =>
                      setEditing((e) => ({ ...e, quantity: v || 1 }))
                    }
                  />
                ) : (
                  <Input
                    value={(editing as any)[key] || ""}
                    onChange={(ev) =>
                      setEditing((e) => ({ ...e, [key]: ev.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
