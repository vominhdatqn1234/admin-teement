/**
 * Kho phôi theo biến thể — đúng cấu trúc file "Giá Sản Phẩm Teement":
 * Sản Phẩm, Màu, Size, Giá, Giá ship, In 1 mặt, In vùng phụ,
 * Giá AK2, Giá Fashship, Giá 3D, Giá Teement.
 * Import CSV (upsert theo Sản phẩm + Màu + Size) và Export CSV cùng định dạng.
 */
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Pagination,
  Popconfirm,
  Segmented,
  Select,
  Tooltip,
  message,
} from "antd";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "react-query";
import {
  FiChevronDown,
  FiChevronRight,
  FiDownload,
  FiPlus,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import { usePodVariantMutations, usePodVariants } from "../../hooks/useAdmin";
import { downloadCSV, parseCSV, toCSV } from "../../lib/csvPod";
import { sbUpsert } from "../../lib/supabase";
import { PodVariant } from "../../models/admin";

// Header CSV chuẩn (đúng file gốc)
const CSV_HEADERS = [
  "Sản Phẩm",
  "Màu",
  "Size",
  "Giá",
  "Giá ship",
  "In 1 mặt",
  "In vùng phụ",
  "Giá AK2",
  "Giá Fashship",
  "Giá 3D",
  "Giá Teement",
];

// Cột số: field -> label hiển thị
const NUM_COLS: { field: keyof PodVariant; label: string }[] = [
  { field: "price", label: "Giá" },
  { field: "shipPrice", label: "Giá ship" },
  { field: "printOneSide", label: "In 1 mặt" },
  { field: "printExtraArea", label: "In vùng phụ" },
  { field: "priceAK2", label: "Giá AK2" },
  { field: "priceFashship", label: "Giá Fashship" },
  { field: "price3D", label: "Giá 3D" },
  { field: "priceTeement", label: "Giá Teement" },
];

// Các cột cần so sánh chênh lệch với Giá Teement (hiện dấu +/- bên dưới ô nhập)
const DIFF_FIELDS: (keyof PodVariant)[] = [
  "priceAK2",
  "priceFashship",
  "price3D",
];

function num(v: string | undefined): number {
  // Chấp nhận cả "$25.84", "25,33", "  7.99 "
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function genId(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 20; i++)
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

// Mỗi màu là 1 tên đầy đủ (vd "Sport Grey", "Dark Heather") — hiển thị nguyên tên
function fmtColor(c?: string): string {
  const t = (c || "").trim();
  return t || "—";
}

// Thứ hạng size để sắp từ nhỏ -> lớn (XS < S < M < L < XL < 2XL < 3XL...)
const SIZE_RANK: Record<string, number> = {
  XXS: 0,
  "2XS": 0,
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  XXL: 6,
  XXXL: 7,
  XXXXL: 8,
  XXXXXL: 9,
};
function sizeRank(s?: string): number {
  const k = (s || "").trim().toUpperCase();
  if (k in SIZE_RANK) return SIZE_RANK[k];
  // Dạng "2XL", "3XL", "4XL"... -> xếp sau XL
  const m = k.match(/^(\d+)\s*XL$/);
  if (m) return 5 + Number(m[1]) - 1;
  // Size dạng số thuần (giày, tuổi trẻ em...) -> theo số
  const n = parseFloat(k.replace(",", "."));
  if (!isNaN(n)) return 1000 + n;
  return 2000; // không xác định -> đẩy xuống cuối
}

const keyOf = (p?: string, c?: string, s?: string) =>
  `${(p || "").trim().toLowerCase()}|${(c || "").trim().toLowerCase()}|${(
    s || ""
  )
    .trim()
    .toLowerCase()}`;

/**
 * 1 dòng biến thể — input có kiểm soát để hiện chênh lệch so với Giá Teement
 * theo thời gian thực (AK2 / Fashship / 3D). Chênh lệch = Giá Teement − giá nhập.
 */
function VariantRow({
  v,
  inGroup,
  hideColor,
  selected,
  onToggleSelect,
  onSaveField,
  onDelete,
}: {
  v: PodVariant;
  inGroup: boolean;
  hideColor: boolean;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  onSaveField: (field: keyof PodVariant, val: number) => void;
  onDelete: () => void | Promise<void>;
}) {
  const initVals = () => {
    const o: Record<string, number | null> = {};
    NUM_COLS.forEach(
      ({ field }) => (o[field as string] = Number((v as any)[field]) || 0)
    );
    return o;
  };
  const [vals, setVals] = useState<Record<string, number | null>>(initVals);
  // Đồng bộ lại khi dữ liệu đơn thay đổi từ bên ngoài (vd sửa giá cả nhóm)
  useEffect(() => {
    setVals(initVals());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    v.price,
    v.shipPrice,
    v.printOneSide,
    v.printExtraArea,
    v.priceAK2,
    v.priceFashship,
    v.price3D,
    v.priceTeement,
  ]);

  const teement = Number(vals.priceTeement) || 0;

  return (
    <tr
      className={`border-b border-gray-50 ${
        selected ? "bg-[#EFF4FF]" : inGroup ? "bg-white" : ""
      }`}
    >
      <td className="p-2.5">
        <Checkbox
          checked={selected}
          onChange={(e) => onToggleSelect(e.target.checked)}
        />
      </td>
      <td
        className={`p-2.5 text-gray-800 ${
          inGroup ? "pl-8 text-gray-400" : "font-medium"
        }`}
      >
        {inGroup ? "" : v.product}
      </td>
      <td className={`p-2.5 ${hideColor ? "text-gray-300" : ""}`}>
        {hideColor ? "" : fmtColor(v.color)}
      </td>
      <td className={`p-2.5 ${hideColor ? "pl-8 text-gray-500" : ""}`}>
        {v.size || "—"}
      </td>
      {NUM_COLS.map(({ field }) => {
        const key = field as string;
        const cur = Number(vals[key]) || 0;
        const saved = Number((v as any)[field]) || 0;
        const showDiff = DIFF_FIELDS.includes(field) && cur > 0;
        const diff = teement - cur; // Giá Teement − giá nhập
        return (
          <td key={key} className="p-1.5 text-right align-top">
            <InputNumber
              size="small"
              min={0}
              step={0.01}
              controls={false}
              className="w-[80px]"
              value={vals[key] as number}
              onChange={(n) =>
                setVals((s) => ({ ...s, [key]: (n as number) ?? null }))
              }
              onBlur={() => {
                if (cur !== saved) onSaveField(field, cur);
              }}
            />
            {showDiff && (
              <Tooltip
                title={
                  diff > 0
                    ? `Rẻ hơn Giá Teement $${diff.toFixed(
                        2
                      )} — tiết kiệm cho khách`
                    : diff < 0
                    ? `Đắt hơn Giá Teement $${Math.abs(diff).toFixed(
                        2
                      )} — cao hơn giá Teement`
                    : "Bằng đúng Giá Teement"
                }
              >
                <div
                  className={`inline-block cursor-help text-[10px] font-semibold mt-0.5 leading-none ${
                    diff > 0
                      ? "text-green-600"
                      : diff < 0
                      ? "text-red-500"
                      : "text-gray-400"
                  }`}
                >
                  {diff > 0 ? "+" : ""}
                  {diff.toFixed(2)}$
                </div>
              </Tooltip>
            )}
          </td>
        );
      })}
      <td className="p-2.5">
        <Popconfirm
          title={`Xóa ${v.product} ${v.color || ""} ${v.size || ""}?`}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
          onConfirm={onDelete}
        >
          <button className="w-7 h-7 rounded-md border border-red-100 bg-red-50 text-red-500 inline-flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white">
            <FiTrash2 size={13} />
          </button>
        </Popconfirm>
      </td>
    </tr>
  );
}

export default function VariantPrices() {
  const { variants } = usePodVariants();
  const { update, removeMany } = usePodVariantMutations();
  const qc = useQueryClient();

  const [filterProduct, setFilterProduct] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Chế độ xem: "grouped" gộp theo sản phẩm cho dễ nhìn, "flat" bảng phẳng như cũ
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [importing, setImporting] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<PodVariant>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const productNames = useMemo(
    () =>
      Array.from(new Set(variants.map((v) => v.product?.trim()))).filter(
        Boolean
      ) as string[],
    [variants]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const out = variants.filter((v) => {
      if (filterProduct && v.product?.trim() !== filterProduct) return false;
      if (
        s &&
        ![v.product, v.color, v.size].some((x) =>
          (x || "").toLowerCase().includes(s)
        )
      )
        return false;
      return true;
    });
    // Sắp xếp cố định theo Sản phẩm -> Màu -> Size (nhỏ->lớn) -> id.
    // KHÔNG dùng giá để so sánh nên sửa tiền không làm nhảy vị trí.
    out.sort(
      (a, b) =>
        (a.product || "").localeCompare(b.product || "") ||
        (a.color || "").localeCompare(b.color || "") ||
        sizeRank(a.size) - sizeRank(b.size) ||
        (a.size || "").localeCompare(b.size || "") ||
        String(a.id).localeCompare(String(b.id))
    );
    return out;
  }, [variants, filterProduct, search]);

  // Gộp theo tên sản phẩm (giữ nguyên thứ tự xuất hiện)
  const groups = useMemo(() => {
    const m = new Map<string, PodVariant[]>();
    for (const v of filtered) {
      const key = v.product?.trim() || "—";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(v);
    }
    return Array.from(m.entries()).map(([product, rows]) => ({
      product,
      rows,
    }));
  }, [filtered]);

  const grouped = viewMode === "grouped";
  // Ở chế độ gộp: phân trang theo NHÓM; chế độ phẳng: phân trang theo dòng
  const totalCount = grouped ? groups.length : filtered.length;
  const pagedGroups = grouped
    ? groups.slice((page - 1) * pageSize, page * pageSize)
    : [];
  const paged = grouped
    ? []
    : filtered.slice((page - 1) * pageSize, page * pageSize);
  // Các dòng đang hiển thị trên trang (để checkbox "chọn tất cả trang")
  const pageRows = grouped ? pagedGroups.flatMap((g) => g.rows) : paged;
  const pageIds = pageRows.map((v) => v.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const toggleGroup = (product: string) =>
    setExpanded((prev) =>
      prev.includes(product)
        ? prev.filter((p) => p !== product)
        : [...prev, product]
    );
  const allExpanded =
    pagedGroups.length > 0 &&
    pagedGroups.every((g) => expanded.includes(g.product));
  const toggleAllGroups = () =>
    setExpanded(allExpanded ? [] : pagedGroups.map((g) => g.product));

  const toggleGroupSelect = (rows: PodVariant[], checked: boolean) => {
    const ids = rows.map((r) => r.id);
    setSelectedIds((prev) =>
      checked
        ? Array.from(new Set([...prev, ...ids]))
        : prev.filter((id) => !ids.includes(id))
    );
  };

  // Giá trị chung của 1 cột trong nhóm: number nếu tất cả bằng nhau, null nếu lệch
  const groupCommon = (rows: PodVariant[], field: keyof PodVariant) => {
    const vals = rows.map((r) => (Number((r as any)[field]) || 0));
    return vals.every((x) => x === vals[0]) ? vals[0] : null;
  };

  // Sửa 1 cột giá cho CẢ nhóm (áp cho mọi biến thể) — upsert theo lô
  const applyGroupField = async (
    rows: PodVariant[],
    field: keyof PodVariant,
    val: number
  ) => {
    const changed = rows.filter(
      (r) => (Number((r as any)[field]) || 0) !== val
    );
    if (!changed.length) return;
    await sbUpsert(
      "podVariants",
      changed.map((r) => ({ ...r, [field]: val }))
    );
    qc.invalidateQueries(["adm-variants"]);
    message.success(
      `Đã đặt ${field} = ${val} cho ${changed.length} biến thể "${rows[0].product}"`
    );
  };

  /* ---------- Import: upsert theo Sản phẩm + Màu + Size ---------- */
  const handleImport = async (file: File) => {
    const rows = parseCSV(await file.text());
    if (!rows.length) return message.error("File CSV trống");
    if (!rows[0]["Sản Phẩm"])
      return message.error('Không thấy cột "Sản Phẩm" — sai định dạng file');

    const byKey = new Map(
      variants.map((v) => [keyOf(v.product, v.color, v.size), v.id])
    );
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const upserts: any[] = [];
    for (const r of rows) {
      const product = (r["Sản Phẩm"] || "").trim();
      if (!product) continue;
      const color = (r["Màu"] || "").trim();
      const size = (r["Size"] || "").trim();
      const k = keyOf(product, color, size);
      if (seen.has(k)) continue; // file có dòng trùng -> lấy dòng đầu
      seen.add(k);
      upserts.push({
        id: byKey.get(k) || genId(),
        product,
        color,
        size,
        price: num(r["Giá"]),
        shipPrice: num(r["Giá ship"]),
        printOneSide: num(r["In 1 mặt"]),
        printExtraArea: num(r["In vùng phụ"]),
        priceAK2: num(r["Giá AK2"]),
        priceFashship: num(r["Giá Fashship"]),
        price3D: num(r["Giá 3D"]),
        priceTeement: num(r["Giá Teement"]),
        created: now,
      });
    }

    // Upsert theo lô để nhanh (3500 dòng ~ 9 lô)
    const CHUNK = 400;
    setImporting({ done: 0, total: upserts.length });
    try {
      for (let i = 0; i < upserts.length; i += CHUNK) {
        await sbUpsert("podVariants", upserts.slice(i, i + CHUNK));
        setImporting({
          done: Math.min(i + CHUNK, upserts.length),
          total: upserts.length,
        });
      }
      qc.invalidateQueries(["adm-variants"]);
      message.success(`Đã import ${upserts.length} biến thể phôi`);
    } finally {
      setImporting(null);
    }
  };

  /* ---------- Export: đúng định dạng file gốc ---------- */
  const handleExport = () => {
    const list = filtered;
    downloadCSV(
      "gia-san-pham-teement.csv",
      toCSV(
        CSV_HEADERS,
        list.map((v) => [
          v.product || "",
          v.color || "",
          v.size || "",
          v.price ?? 0,
          v.shipPrice ?? 0,
          v.printOneSide ?? 0,
          v.printExtraArea ?? 0,
          v.priceAK2 || "",
          v.priceFashship || "",
          v.price3D || "",
          v.priceTeement ?? 0,
        ])
      )
    );
    message.success(`Đã xuất ${list.length} dòng`);
  };

  const saveField = (v: PodVariant, field: string, value: any) => {
    update.mutate({ id: v.id, [field]: value } as any);
  };

  const addRow = async () => {
    const product = (draft.product || "").trim();
    if (!product) return message.warning("Nhập tên sản phẩm");
    const k = keyOf(product, draft.color, draft.size);
    if (variants.some((v) => keyOf(v.product, v.color, v.size) === k))
      return message.warning("Biến thể này đã tồn tại");
    await sbUpsert("podVariants", [
      {
        id: genId(),
        product,
        color: (draft.color || "").trim(),
        size: (draft.size || "").trim(),
        price: draft.price || 0,
        shipPrice: draft.shipPrice || 0,
        printOneSide: draft.printOneSide || 0,
        printExtraArea: draft.printExtraArea || 0,
        priceAK2: draft.priceAK2 || 0,
        priceFashship: draft.priceFashship || 0,
        price3D: draft.price3D || 0,
        priceTeement: draft.priceTeement || 0,
        created: new Date().toISOString(),
      },
    ]);
    qc.invalidateQueries(["adm-variants"]);
    message.success(`Đã thêm ${product} ${draft.color || ""} ${draft.size || ""}`);
    setDraft({});
    setAddOpen(false);
  };

  const handleBulkDelete = async () => {
    await removeMany.mutateAsync(selectedIds as any);
    message.success(`Đã xóa ${selectedIds.length} biến thể`);
    setSelectedIds([]);
  };

  // Gộp các biến thể theo màu (giữ thứ tự xuất hiện)
  const groupByColor = (rows: PodVariant[]) => {
    const m = new Map<string, PodVariant[]>();
    for (const r of rows) {
      const k = (r.color || "").trim() || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries());
  };

  // 1 dòng biến thể (dùng chung cho bảng phẳng và bên trong nhóm)
  const renderRow = (v: PodVariant, inGroup = false, hideColor = false) => (
    <VariantRow
      key={v.id}
      v={v}
      inGroup={inGroup}
      hideColor={hideColor}
      selected={selectedIds.includes(v.id)}
      onToggleSelect={(checked) =>
        setSelectedIds((prev) =>
          checked ? [...prev, v.id] : prev.filter((x) => x !== v.id)
        )
      }
      onSaveField={(field, val) => saveField(v, field, val)}
      onDelete={async () => {
        await removeMany.mutateAsync([v.id] as any);
        message.success("Đã xóa biến thể");
      }}
    />
  );

  // Header của 1 nhóm sản phẩm — hiện tổng quan giá + sửa giá cho cả nhóm
  const renderGroupHeader = (g: { product: string; rows: PodVariant[] }) => {
    const isOpen = expanded.includes(g.product);
    const ids = g.rows.map((r) => r.id);
    const allSel = ids.every((id) => selectedIds.includes(id));
    const someSel = !allSel && ids.some((id) => selectedIds.includes(id));
    const colorList = Array.from(
      new Set(g.rows.map((r) => (r.color || "").trim()).filter(Boolean))
    );
    const sizes = new Set(g.rows.map((r) => (r.size || "").trim()));
    return (
      <tr
        key={`h-${g.product}`}
        className="border-b border-gray-200 bg-[#F7F8FA] hover:bg-[#F0F2F5]"
      >
        <td className="p-2.5">
          <Checkbox
            checked={allSel}
            indeterminate={someSel}
            onChange={(e) => toggleGroupSelect(g.rows, e.target.checked)}
          />
        </td>
        <td className="p-2.5">
          <button
            onClick={() => toggleGroup(g.product)}
            className="inline-flex items-center gap-1.5 bg-transparent border-0 cursor-pointer font-semibold text-gray-800"
          >
            {isOpen ? (
              <FiChevronDown size={14} />
            ) : (
              <FiChevronRight size={14} />
            )}
            {g.product}
            <span className="ml-1 text-[11px] font-medium text-gray-500 bg-gray-200/70 rounded-full px-2 py-0.5">
              {g.rows.length}
            </span>
          </button>
        </td>
        <td className="p-2.5 text-gray-500">{colorList.length} màu</td>
        <td className="p-2.5 text-gray-500">{sizes.size} size</td>
        {NUM_COLS.map(({ field, label }) => {
          const common = groupCommon(g.rows, field);
          return (
            <td key={field as string} className="p-1.5 text-right">
              <Tooltip
                title={
                  common === null
                    ? `${label} đang lệch nhau — nhập để đặt CHUNG cho cả nhóm`
                    : `Sửa ${label} cho cả ${g.rows.length} biến thể`
                }
              >
                <InputNumber
                  key={`${g.product}-${field as string}-${common}`}
                  size="small"
                  min={0}
                  step={0.01}
                  controls={false}
                  placeholder={common === null ? "≠" : undefined}
                  className={`w-[80px] ${
                    common === null ? "[&_input]:text-orange-500" : ""
                  }`}
                  defaultValue={common === null ? undefined : common}
                  onBlur={(e) => {
                    const raw = (e.target as HTMLInputElement).value.replace(
                      /,/g,
                      ""
                    );
                    if (raw === "") return;
                    const val = parseFloat(raw) || 0;
                    if (common === null || val !== common)
                      applyGroupField(g.rows, field, val);
                  }}
                />
              </Tooltip>
            </td>
          );
        })}
        <td className="p-2.5" />
      </tr>
    );
  };

  // Sub-header theo MÀU bên trong 1 nhóm sản phẩm: màu hiện 1 lần,
  // các size gộp lại cách nhau bởi dấu phẩy; sửa giá áp cho mọi size của màu.
  const renderColorHeader = (
    product: string,
    color: string,
    rows: PodVariant[],
    ckey: string
  ) => {
    const isOpen = expanded.includes(ckey);
    const ids = rows.map((r) => r.id);
    const allSel = ids.every((id) => selectedIds.includes(id));
    const someSel = !allSel && ids.some((id) => selectedIds.includes(id));
    const sizeText =
      rows
        .map((r) => (r.size || "").trim())
        .filter(Boolean)
        .join(", ") || "—";
    return (
      <tr
        key={ckey}
        className="border-b border-gray-50 bg-[#FBFCFE] hover:bg-[#F4F8FD]"
      >
        <td className="p-2 pl-4">
          <Checkbox
            checked={allSel}
            indeterminate={someSel}
            onChange={(e) => toggleGroupSelect(rows, e.target.checked)}
          />
        </td>
        <td className="p-2" />
        <td className="p-2">
          <button
            onClick={() => toggleGroup(ckey)}
            className="inline-flex items-center gap-1.5 pl-6 bg-transparent border-0 cursor-pointer text-gray-700 font-medium text-left"
          >
            {isOpen ? (
              <FiChevronDown size={13} className="shrink-0" />
            ) : (
              <FiChevronRight size={13} className="shrink-0" />
            )}
            {fmtColor(color)}
            <span className="ml-1 text-[11px] font-medium text-gray-500 bg-gray-200/70 rounded-full px-1.5 py-0.5 shrink-0">
              {rows.length}
            </span>
          </button>
        </td>
        <td className="p-2 text-gray-400 text-[11px] max-w-[220px]">
          <Tooltip title={sizeText}>
            <span className="line-clamp-1">{sizeText}</span>
          </Tooltip>
        </td>
        {NUM_COLS.map(({ field, label }) => {
          const common = groupCommon(rows, field);
          return (
            <td key={field as string} className="p-1.5 text-right">
              <Tooltip
                title={
                  common === null
                    ? `${label} đang lệch nhau — nhập để đặt CHUNG cho màu này`
                    : `Sửa ${label} cho ${rows.length} size của màu này`
                }
              >
                <InputNumber
                  key={`${ckey}-${field as string}-${common}`}
                  size="small"
                  min={0}
                  step={0.01}
                  controls={false}
                  placeholder={common === null ? "≠" : undefined}
                  className={`w-[80px] ${
                    common === null ? "[&_input]:text-orange-500" : ""
                  }`}
                  defaultValue={common === null ? undefined : common}
                  onBlur={(e) => {
                    const raw = (e.target as HTMLInputElement).value.replace(
                      /,/g,
                      ""
                    );
                    if (raw === "") return;
                    const val = parseFloat(raw) || 0;
                    if (common === null || val !== common)
                      applyGroupField(rows, field, val);
                  }}
                />
              </Tooltip>
            </td>
          );
        })}
        <td className="p-2" />
      </tr>
    );
  };

  return (
    <div>
      {/* Thanh công cụ */}
      <div className="border border-gray-200 rounded-xl p-4 bg-white flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            SẢN PHẨM
          </div>
          <Select
            className="w-[240px]"
            placeholder="Tất cả sản phẩm"
            allowClear
            showSearch
            value={filterProduct || undefined}
            onChange={(v) => {
              setFilterProduct(v || "");
              setPage(1);
            }}
            options={productNames.map((n) => ({ value: n, label: n }))}
          />
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            TÌM KIẾM
          </div>
          <Input
            className="w-[200px]"
            placeholder="Sản phẩm / màu / size..."
            allowClear
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button icon={<FiPlus />} onClick={() => setAddOpen((v) => !v)}>
          Thêm biến thể
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
        <Button icon={<FiDownload />} onClick={handleExport}>
          Export CSV
        </Button>
        {selectedIds.length > 0 && (
          <Popconfirm
            title={`Xóa ${selectedIds.length} biến thể đã chọn?`}
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
        <Segmented
          className="ml-auto"
          value={viewMode}
          onChange={(v) => {
            setViewMode(v as "grouped" | "flat");
            setPage(1);
          }}
          options={[
            { label: "Gộp theo SP", value: "grouped" },
            { label: "Bảng phẳng", value: "flat" },
          ]}
        />
        {grouped && (
          <Button size="small" onClick={toggleAllGroups}>
            {allExpanded ? "Thu gọn tất cả" : "Mở tất cả"}
          </Button>
        )}
        <span className="text-xs bg-gray-100 rounded-full px-3 py-1 text-gray-600 font-medium">
          {grouped
            ? `${groups.length} SP · ${filtered.length} biến thể`
            : `${filtered.length} biến thể`}
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
            className="w-[200px]"
            placeholder="Sản Phẩm *"
            value={draft.product || ""}
            onChange={(e) => setDraft((d) => ({ ...d, product: e.target.value }))}
          />
          <Input
            className="w-[130px]"
            placeholder="Màu"
            value={draft.color || ""}
            onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
          />
          <Input
            className="w-[90px]"
            placeholder="Size"
            value={draft.size || ""}
            onChange={(e) => setDraft((d) => ({ ...d, size: e.target.value }))}
          />
          {NUM_COLS.map(({ field, label }) => (
            <div key={field}>
              <div className="text-[9px] text-gray-400 mb-0.5">{label}</div>
              <InputNumber
                className="w-[92px]"
                min={0}
                step={0.01}
                value={(draft as any)[field]}
                onChange={(v) => setDraft((d) => ({ ...d, [field]: v ?? 0 }))}
              />
            </div>
          ))}
          <Button type="primary" className="bg-[#171826]" onClick={addRow}>
            Lưu
          </Button>
        </div>
      )}

      {/* Bảng biến thể */}
      <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white mt-3">
        <table className="w-full text-[13px] border-collapse min-w-[1150px]">
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
              <th className="p-2.5 font-medium">Sản Phẩm</th>
              <th className="p-2.5 font-medium">Màu</th>
              <th className="p-2.5 font-medium">Size</th>
              {NUM_COLS.map((c) => (
                <th key={c.field} className="p-2.5 font-medium text-right">
                  {c.label}
                </th>
              ))}
              <th className="p-2.5 font-medium w-14"></th>
            </tr>
          </thead>
          <tbody>
            {grouped
              ? pagedGroups.map((g) => (
                  <Fragment key={g.product}>
                    {renderGroupHeader(g)}
                    {expanded.includes(g.product) &&
                      groupByColor(g.rows).map(([color, rows]) => {
                        const ckey = `${g.product}||${color}`;
                        return (
                          <Fragment key={ckey}>
                            {renderColorHeader(g.product, color, rows, ckey)}
                            {expanded.includes(ckey) &&
                              rows.map((v) => renderRow(v, true, true))}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                ))
              : paged.map((v) => renderRow(v))}
            {!pageRows.length && (
              <tr>
                <td colSpan={13} className="p-12 text-center text-gray-400">
                  {variants.length
                    ? "Không có biến thể nào khớp bộ lọc"
                    : "Kho trống — bấm Import CSV để nạp file Giá Sản Phẩm Teement"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalCount > 0 && (
          <div className="flex justify-end p-3 border-t border-gray-100">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={totalCount}
              showSizeChanger
              pageSizeOptions={[50, 100, 200, 500, 1000]}
              showTotal={(t) => (grouped ? `${t} sản phẩm` : `${t} dòng`)}
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
