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
  Popover,
  Progress,
  Select,
  Tooltip,
  message,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { imageUrlCandidates } from "../../lib/imageUrl";
import { useQueryClient } from "react-query";
import { FiDownload, FiEdit3, FiPlus, FiTrash2, FiUpload } from "react-icons/fi";
import {
  usePrintHouseMutations,
  usePrintHouses,
  usePrintHouseSkuMutations,
  usePrintHouseSkus,
  usePrintOrderMutations,
  usePrintOrders,
} from "../../hooks/useAdmin";
import UploadImgButton from "../../components/UploadImgButton";
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

// Các field là link ảnh thiết kế/mockup -> hiện preview trong modal edit
const IMG_KEYS = new Set(
  FIELDS.map((f) => f.key).filter(
    (k) => String(k).endsWith("DesignUrl") || String(k).endsWith("MockupUrl")
  )
);

/** Preview ảnh nhỏ trong modal — tự cập nhật khi sửa link */
function MiniPreview({ url }: { url?: string }) {
  const [idx, setIdx] = useState(0);
  const candidates = imageUrlCandidates(url || "");
  if (!url)
    return (
      <span className="w-8 h-8 shrink-0 rounded-md border border-dashed border-gray-200 bg-gray-50 inline-flex items-center justify-center text-gray-300 text-[9px]">
        —
      </span>
    );
  if (idx >= candidates.length)
    return (
      <span className="w-8 h-8 shrink-0 rounded-md border border-red-100 bg-red-50 inline-flex items-center justify-center text-red-300 text-[9px]">
        !
      </span>
    );
  return (
    <Popover
      placement="left"
      content={
        <div className="w-[240px] h-[240px] flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
          <img
            src={candidates[idx]}
            alt="preview"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      }
    >
      <img
        key={candidates[idx]}
        src={candidates[idx]}
        alt="preview"
        referrerPolicy="no-referrer"
        className="w-8 h-8 shrink-0 rounded-md object-cover border border-gray-200 bg-gray-50 cursor-zoom-in"
        onError={() => setIdx((i) => i + 1)}
      />
    </Popover>
  );
}

/**
 * Thumbnail thiết kế (hỗ trợ link Google Drive) + hover phóng to
 * + hiển thị link ngay trên bảng, sửa nhanh rồi blur/Enter là lưu.
 */
function ImgLink({
  url,
  mockup,
  onCommit,
}: {
  url?: string;
  mockup?: string;
  onCommit: (v: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const src = url || mockup || "";
  const candidates = imageUrlCandidates(src);
  const img =
    src && idx < candidates.length ? (
      <img
        key={candidates[idx]}
        src={candidates[idx]}
        alt="design"
        referrerPolicy="no-referrer"
        className="w-9 h-9 shrink-0 rounded-md object-cover border border-gray-200 bg-gray-50 cursor-zoom-in"
        onError={() => setIdx((i) => i + 1)}
      />
    ) : null;
  return (
    <div className="flex items-center gap-1.5">
      {img ? (
        <Popover
          placement="right"
          content={
            <div className="w-[260px] h-[260px] flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
              <img
                src={candidates[idx]}
                alt="design"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          }
        >
          {img}
        </Popover>
      ) : (
        <span className="w-9 h-9 shrink-0 rounded-md border border-dashed border-gray-200 bg-gray-50 inline-flex items-center justify-center text-gray-300 text-[9px]">
          —
        </span>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <Input
            key={url || ""}
            size="small"
            placeholder="Dán link..."
            defaultValue={url || ""}
            className="w-[130px] text-[11px]"
            onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (url || "")) onCommit(v);
            }}
          />
          <UploadImgButton size="small" onUploaded={onCommit} />
        </div>
        {src && (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-[#2563EB] text-[10px] no-underline hover:underline"
          >
            Mở link ↗
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Danh mục tên Nhà In — nguồn cho dropdown "Nhà In" ở trang Quản lý Seller.
 */
function PrintHouseCatalog() {
  const { printHouses } = usePrintHouses();
  const mut = usePrintHouseMutations();
  const [newName, setNewName] = useState("");

  const addHouse = async () => {
    const n = newName.trim();
    if (!n) return;
    if (printHouses.some((h) => h.name.trim().toLowerCase() === n.toLowerCase()))
      return message.warning(`Nhà in "${n}" đã có`);
    await mut.add.mutateAsync({ name: n, created: new Date().toISOString() });
    message.success(`Đã thêm nhà in ${n}`);
    setNewName("");
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 mt-4 bg-white">
      <div className="font-semibold text-gray-800 text-[14px]">
        Danh mục Nhà In
      </div>
      <p className="text-gray-400 text-xs mt-0.5 mb-3">
        Danh sách tên nhà in để chọn ở ô "Nhà In" trên trang Quản lý Seller khi
        phân bổ đơn. Sửa tên trực tiếp trong ô rồi Enter để lưu.
      </p>
      <div className="flex items-end gap-4 flex-wrap">
        {printHouses.map((h) => (
          <div key={h.id}>
            <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
              NHÀ IN
            </div>
            <div className="flex items-center gap-1">
              <span className="w-8 h-8 shrink-0 rounded-lg bg-[#171826] text-white text-[11px] font-bold inline-flex items-center justify-center">
                {h.name.charAt(0).toUpperCase()}
              </span>
              <Input
                key={h.name}
                className="w-[130px] font-medium"
                defaultValue={h.name}
                onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== h.name) {
                    mut.update.mutate({ id: h.id, name: v });
                    message.success(`Đã đổi tên "${h.name}" → "${v}"`);
                  }
                }}
              />
              <Popconfirm
                title={`Xóa nhà in "${h.name}"?`}
                description="Các đơn đã gán tên này vẫn giữ nguyên."
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                onConfirm={() => mut.remove.mutate(h.id)}
              >
                <button className="w-8 h-8 shrink-0 rounded-lg border border-red-100 bg-red-50 text-red-500 inline-flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white">
                  <FiTrash2 size={13} />
                </button>
              </Popconfirm>
            </div>
          </div>
        ))}
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            THÊM NHÀ IN MỚI
          </div>
          <div className="flex items-center gap-1">
            <Input
              className="w-[160px]"
              placeholder="Tên nhà in..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={addHouse}
            />
            <Button icon={<FiPlus />} onClick={addHouse}>
              Thêm
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const skuKeyOf = (
  house: string,
  brand?: string,
  color?: string,
  size?: string
) =>
  `${house}|${(brand || "").trim().toLowerCase()}|${(color || "")
    .trim()
    .toLowerCase()}|${(size || "").trim().toLowerCase()}`;

/**
 * Data SKU riêng theo từng Nhà In (file SK2): chọn nhà in → Import CSV
 * (Brand=tên sản phẩm, Color, Size, Variant ID) → tra Variant ID theo đơn.
 */
function PrintHouseSkuManager() {
  const { printHouses } = usePrintHouses();
  const { phSkus } = usePrintHouseSkus();
  const { removeMany } = usePrintHouseSkuMutations();
  const qc = useQueryClient();

  const [house, setHouse] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importing, setImporting] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!house && printHouses.length) setHouse(printHouses[0].name);
  }, [printHouses, house]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return phSkus
      .filter((r) => r.printHouse === house)
      .filter(
        (r) =>
          !s ||
          [r.brand, r.color, r.size, r.variantId, r.productName]
            .map((x) => (x || "").toLowerCase())
            .some((x) => x.includes(s))
      );
  }, [phSkus, house, search]);

  const countByHouse = useMemo(() => {
    const m = new Map<string, number>();
    phSkus.forEach((r) =>
      m.set(r.printHouse, (m.get(r.printHouse) || 0) + 1)
    );
    return m;
  }, [phSkus]);

  const paged = rows.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = paged.map((r) => r.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [house, search]);

  const handleImport = async (file: File) => {
    if (!house) return message.warning("Chọn nhà in trước khi import");
    const csvRows = parseCSV(await file.text());
    if (!csvRows.length) return message.error("File CSV trống");
    if (!("Brand" in csvRows[0]) || !("Variant ID" in csvRows[0]))
      return message.error(
        'Thiếu cột "Brand" hoặc "Variant ID" — sai định dạng file SK2'
      );
    const byKey = new Map(
      phSkus
        .filter((r) => r.printHouse === house)
        .map((r) => [skuKeyOf(house, r.brand, r.color, r.size), r.id])
    );
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const upserts: any[] = [];
    for (const r of csvRows) {
      const brand = (r["Brand"] || "").trim();
      const variantId = (r["Variant ID"] || "").trim();
      if (!brand || !variantId) continue;
      const color = (r["Color"] || "").trim();
      const size = (r["Size"] || "").trim();
      const k = skuKeyOf(house, brand, color, size);
      if (seen.has(k)) continue; // trùng trong file → lấy dòng đầu
      seen.add(k);
      upserts.push({
        id: byKey.get(k) || genId(),
        printHouse: house,
        productName: (r["Product name"] || "").trim(),
        style: (r["Style"] || "").trim(),
        brand,
        color,
        size,
        variantId,
        created: now,
      });
    }
    if (!upserts.length) return message.error("Không có dòng hợp lệ");
    const CHUNK = 400;
    setImporting({ done: 0, total: upserts.length });
    try {
      for (let i = 0; i < upserts.length; i += CHUNK) {
        await sbUpsert("printHouseSkus", upserts.slice(i, i + CHUNK));
        setImporting({
          done: Math.min(i + CHUNK, upserts.length),
          total: upserts.length,
        });
      }
      qc.invalidateQueries(["adm-ph-skus"]);
      message.success(
        `Đã import ${upserts.length} SKU cho nhà in "${house}"`
      );
    } finally {
      setImporting(null);
    }
  };

  const handleExport = () => {
    if (!rows.length) return message.warning("Không có dòng để xuất");
    const safeHouse = house.trim().replace(/[^a-zA-Z0-9-_]+/g, "-");
    downloadCSV(
      `sku-${safeHouse}.csv`,
      toCSV(
        ["Product name", "Style", "Brand", "Color", "Size", "Variant ID"],
        rows.map((r) => [
          r.productName || "",
          r.style || "",
          r.brand,
          r.color || "",
          r.size || "",
          r.variantId,
        ])
      )
    );
  };

  const handleBulkDelete = async () => {
    await removeMany.mutateAsync(selectedIds as any);
    message.success(`Đã xóa ${selectedIds.length} dòng`);
    setSelectedIds([]);
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 mt-4 bg-white">
      <div className="font-semibold text-gray-800 text-[14px]">
        Data SKU theo Nhà In
      </div>
      <p className="text-gray-400 text-xs mt-0.5 mb-3">
        Mỗi nhà in quản lý bộ mã riêng. Chọn nhà in rồi Import file SK2 (cột
        Product name, Style, Brand, Color, Size, Variant ID). Brand = tên sản
        phẩm. Dùng để tra Variant ID theo Brand + Màu + Size.
      </p>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            NHÀ IN
          </div>
          <Select
            className="w-[220px]"
            placeholder="Chọn nhà in..."
            value={house || undefined}
            onChange={(v) => setHouse(v)}
            options={printHouses.map((h) => ({
              value: h.name,
              label: `${h.name}${
                countByHouse.get(h.name)
                  ? ` (${countByHouse.get(h.name)})`
                  : ""
              }`,
            }))}
          />
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            TÌM KIẾM
          </div>
          <Input
            className="w-[220px]"
            placeholder="Brand / màu / size / Variant ID..."
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          icon={<FiUpload />}
          loading={!!importing}
          disabled={!house}
          onClick={() => fileRef.current?.click()}
        >
          {importing
            ? `Đang import ${importing.done}/${importing.total}...`
            : house
            ? `Import CSV → ${house}`
            : "Import CSV (SK2)"}
        </Button>
        <Button icon={<FiDownload />} onClick={handleExport} disabled={!rows.length}>
          Export CSV
        </Button>
        {selectedIds.length > 0 && (
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
        )}
        <span className="ml-auto text-xs bg-gray-100 rounded-full px-3 py-1 text-gray-600 font-medium">
          {rows.length} SKU
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

      {importing && (
        <div className="mt-3">
          <Progress
            percent={Math.round((importing.done / importing.total) * 100)}
            status="active"
            strokeColor="#2563EB"
          />
        </div>
      )}

      <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white mt-3">
        <table className="w-full text-[13px] border-collapse min-w-[820px]">
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
              <th className="p-2.5 font-medium">Brand (Sản phẩm)</th>
              <th className="p-2.5 font-medium">Color</th>
              <th className="p-2.5 font-medium">Size</th>
              <th className="p-2.5 font-medium">Variant ID</th>
              <th className="p-2.5 font-medium">Product name / Style</th>
              <th className="p-2.5 font-medium w-14"></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-gray-50 ${
                  selectedIds.includes(r.id) ? "bg-[#EFF4FF]" : ""
                }`}
              >
                <td className="p-2.5">
                  <Checkbox
                    checked={selectedIds.includes(r.id)}
                    onChange={(e) =>
                      setSelectedIds((prev) =>
                        e.target.checked
                          ? [...prev, r.id]
                          : prev.filter((x) => x !== r.id)
                      )
                    }
                  />
                </td>
                <td className="p-2.5 font-medium text-gray-800">{r.brand}</td>
                <td className="p-2.5">{r.color || "—"}</td>
                <td className="p-2.5">{r.size || "—"}</td>
                <td className="p-2.5 font-mono text-xs text-[#2563EB]">
                  {r.variantId}
                </td>
                <td className="p-2.5 text-xs text-gray-500 max-w-[240px] truncate">
                  {[r.productName, r.style].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="p-2.5">
                  <Popconfirm
                    title="Xóa dòng SKU này?"
                    okText="Xóa"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                    onConfirm={async () => {
                      await removeMany.mutateAsync([r.id] as any);
                      message.success("Đã xóa dòng");
                    }}
                  >
                    <button className="w-7 h-7 rounded-md border border-red-100 bg-red-50 text-red-500 inline-flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white">
                      <FiTrash2 size={13} />
                    </button>
                  </Popconfirm>
                </td>
              </tr>
            ))}
            {!paged.length && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-gray-400">
                  {!printHouses.length
                    ? "Chưa có nhà in — thêm nhà in ở mục trên trước"
                    : "Chưa có SKU cho nhà in này — bấm Import CSV (SK2)"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length > 0 && (
          <div className="flex justify-end p-3 border-t border-gray-100">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={rows.length}
              showSizeChanger
              pageSizeOptions={[50, 100, 200, 500]}
              showTotal={(t) => `${t} SKU`}
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

      <PrintHouseCatalog />

      <PrintHouseSkuManager />

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
              <th className="p-2.5 font-medium">Nhà In</th>
              <th className="p-2.5 font-medium">Ngày</th>
              <th className="p-2.5 font-medium">Order ID</th>
              <th className="p-2.5 font-medium">Khách hàng</th>
              <th className="p-2.5 font-medium">Địa chỉ</th>
              <th className="p-2.5 font-medium">SKU</th>
              <th className="p-2.5 font-medium">Màu / Size</th>
              <th className="p-2.5 font-medium text-center">SL</th>
              <th className="p-2.5 font-medium">Front</th>
              <th className="p-2.5 font-medium">Back</th>
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
                <td className="p-2.5">
                  {o.printHouse ? (
                    <span className="bg-[#EFF4FF] text-[#2563EB] text-[11px] font-semibold rounded px-2 py-0.5">
                      {o.printHouse}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
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
                <td className="p-2.5">
                  <ImgLink
                    url={o.frontDesignUrl}
                    mockup={o.frontMockupUrl}
                    onCommit={(v) =>
                      update.mutate({ id: o.id, frontDesignUrl: v } as any)
                    }
                  />
                </td>
                <td className="p-2.5">
                  <ImgLink
                    url={o.backDesignUrl}
                    mockup={o.backMockupUrl}
                    onCommit={(v) =>
                      update.mutate({ id: o.id, backDesignUrl: v } as any)
                    }
                  />
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
                <td colSpan={14} className="p-12 text-center text-gray-400">
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
                ) : IMG_KEYS.has(key) ? (
                  <div className="flex items-center gap-1.5">
                    <MiniPreview
                      key={(editing as any)[key] || "empty"}
                      url={(editing as any)[key]}
                    />
                    <Input
                      value={(editing as any)[key] || ""}
                      onChange={(ev) =>
                        setEditing((e) => ({ ...e, [key]: ev.target.value }))
                      }
                    />
                    <UploadImgButton
                      size="small"
                      onUploaded={(url) =>
                        setEditing((e) => ({ ...e, [key]: url }))
                      }
                    />
                  </div>
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
