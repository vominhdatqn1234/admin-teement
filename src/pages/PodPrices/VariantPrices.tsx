/**
 * Kho phôi theo biến thể — đúng cấu trúc file "Giá Sản Phẩm Teement":
 * Sản Phẩm, Màu, Size, Giá, Giá ship, In 1 mặt, In vùng phụ,
 * Giá AK2, Giá Fashship, Giá 3D, Giá Teement.
 * Import CSV (upsert theo Sản phẩm + Màu + Size) và Export CSV cùng định dạng.
 */
import {
  AutoComplete,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
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
  FiEdit3,
  FiPlus,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import {
  usePodVariantMutations,
  usePodVariants,
  usePrintHouses,
} from "../../hooks/useAdmin";
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

/**
 * 1 cột giá trong bảng. `house` có giá trị = cột giá riêng của nhà in đó,
 * lưu trong podVariants.housePrices["<tên nhà in>"] thay vì 1 field cố định.
 */
export type NumCol = { field: string; label: string; house?: string };

/** Đọc giá của 1 ô theo cột */
export function colValue(v: PodVariant, col: NumCol): number {
  if (col.house) return Number((v.housePrices || {})[col.house]) || 0;
  return Number((v as any)[col.field]) || 0;
}

/** Patch để lưu giá của 1 ô theo cột */
export function colPatch(v: PodVariant, col: NumCol, val: number): any {
  if (col.house)
    return { housePrices: { ...(v.housePrices || {}), [col.house]: val } };
  return { [col.field]: val };
}

// Cột số cố định: field -> label hiển thị
const NUM_COLS: NumCol[] = [
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
const DIFF_FIELDS: string[] = [
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
  cols,
  inGroup,
  hideColor,
  selected,
  onToggleSelect,
  onSaveField,
  onEdit,
  onDelete,
}: {
  v: PodVariant;
  cols: NumCol[];
  inGroup: boolean;
  hideColor: boolean;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  onSaveField: (col: NumCol, val: number) => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
}) {
  const initVals = () => {
    const o: Record<string, number | null> = {};
    cols.forEach((c) => (o[c.field] = colValue(v, c)));
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
    v.housePrices,
    cols,
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
      {cols.map((col) => {
        const key = col.field;
        const cur = Number(vals[key]) || 0;
        const saved = colValue(v, col);
        const showDiff =
          (!!col.house || DIFF_FIELDS.includes(col.field)) && cur > 0;
        const diff = teement - cur; // Giá Teement − giá nhập
        return (
          <td
            key={key}
            className={`p-1.5 text-right align-top ${
              col.house ? "bg-[#F7F8FF]" : ""
            }`}
          >
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
                if (cur !== saved) onSaveField(col, cur);
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
      <td className="p-2.5 whitespace-nowrap">
        <Tooltip title="Sửa biến thể — thêm/xoá cột giá nhà in">
          <button
            onClick={onEdit}
            className="w-7 h-7 rounded-md border border-[#EADFC8] bg-[#FBF6EC] text-[#B79351] inline-flex items-center justify-center cursor-pointer hover:bg-[#C6A15B] hover:text-white mr-1.5"
          >
            <FiEdit3 size={13} />
          </button>
        </Tooltip>
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
  const { printHouses } = usePrintHouses();
  const qc = useQueryClient();

  /* --------- Cột giá theo NHÀ IN ---------
   * Lấy từ tab Nhà In; cộng thêm những nhà in đã có giá trong dữ liệu
   * (phòng khi nhà in bị xoá khỏi danh mục mà giá vẫn còn). */
  const houseNames = useMemo(() => {
    const set = new Set<string>();
    variants.forEach((v) =>
      Object.keys(v.housePrices || {}).forEach((k) => k.trim() && set.add(k))
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [variants]);

  const cols: NumCol[] = useMemo(
    () => [
      ...NUM_COLS,
      ...houseNames.map((n) => ({
        field: `house:${n}`,
        label: `Giá ${n}`,
        house: n,
      })),
    ],
    [houseNames]
  );

  /** Xoá hẳn 1 cột giá nhà in (gỡ khỏi mọi biến thể đang có giá đó) */
  const removeHouseColumn = async (house: string) => {
    const affected = variants.filter((v) => (v.housePrices || {})[house] !== undefined);
    if (!affected.length) return;
    const CHUNK = 400;
    for (let i = 0; i < affected.length; i += CHUNK) {
      await sbUpsert(
        "podVariants",
        affected.slice(i, i + CHUNK).map((v) => {
          const { [house]: _drop, ...rest } = v.housePrices || {};
          return { ...v, housePrices: rest };
        })
      );
    }
    qc.invalidateQueries(["adm-variants"]);
    message.success(`Đã xoá cột "Giá ${house}" khỏi ${affected.length} biến thể`);
  };

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
  /** Cột giá nhà in thêm kèm khi tạo biến thể mới */
  const [draftHouses, setDraftHouses] = useState<
    { name: string; value: number }[]
  >([]);
  /** Biến thể đang sửa trong modal + bản nháp của nó */
  const [editing, setEditing] = useState<PodVariant | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<PodVariant>>({});
  const [editHouses, setEditHouses] = useState<
    { name: string; value: number }[]
  >([]);

  // Gợi ý tên nhà in: danh mục Nhà In + những nhà in đã có cột giá
  const houseOptions = useMemo(() => {
    const set = new Set<string>();
    printHouses.forEach((h) => h.name?.trim() && set.add(h.name.trim()));
    houseNames.forEach((n) => set.add(n));
    return Array.from(set).sort().map((v) => ({ value: v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printHouses, houseNames]);

  const openEdit = (v: PodVariant) => {
    setEditing(v);
    setEditDraft({ ...v });
    setEditHouses(
      Object.entries(v.housePrices || {}).map(([name, value]) => ({
        name,
        value: Number(value) || 0,
      }))
    );
  };

  /** Gom danh sách {tên, giá} thành object housePrices (bỏ dòng thiếu tên) */
  const toHousePrices = (list: { name: string; value: number }[]) =>
    list.reduce((acc, h) => {
      const n = h.name.trim();
      if (n) acc[n] = Number(h.value) || 0;
      return acc;
    }, {} as Record<string, number>);

  const saveEdit = async () => {
    if (!editing) return;
    await update.mutateAsync({
      id: editing.id,
      product: (editDraft.product || "").trim() || editing.product,
      color: (editDraft.color || "").trim(),
      size: (editDraft.size || "").trim(),
      ...NUM_COLS.reduce((acc, c) => {
        acc[c.field] = Number((editDraft as any)[c.field]) || 0;
        return acc;
      }, {} as any),
      housePrices: toHousePrices(editHouses),
    } as any);
    message.success("Đã lưu biến thể");
    setEditing(null);
  };
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
  const groupCommon = (rows: PodVariant[], col: NumCol) => {
    const vals = rows.map((r) => colValue(r, col));
    return vals.every((x) => x === vals[0]) ? vals[0] : null;
  };

  // Sửa 1 cột giá cho CẢ nhóm (áp cho mọi biến thể) — upsert theo lô
  const applyGroupField = async (
    rows: PodVariant[],
    col: NumCol,
    val: number
  ) => {
    const changed = rows.filter((r) => colValue(r, col) !== val);
    if (!changed.length) return;
    await sbUpsert(
      "podVariants",
      changed.map((r) => ({ ...r, ...colPatch(r, col, val) }))
    );
    qc.invalidateQueries(["adm-variants"]);
    message.success(
      `Đã đặt ${col.label} = ${val} cho ${changed.length} biến thể "${rows[0].product}"`
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
        // Cột giá nhà in trong file: "Giá <tên nhà in>" — chỉ nhận nhà in đã có
        housePrices: houseNames.reduce((acc, n) => {
          const raw = r[`Giá ${n}`];
          if (raw !== undefined && String(raw).trim() !== "")
            acc[n] = num(raw);
          return acc;
        }, {} as Record<string, number>),
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
    // Cột giá nhà in nối thêm sau các cột gốc, tên cột = "Giá <nhà in>"
    downloadCSV(
      "gia-san-pham-teement.csv",
      toCSV(
        [...CSV_HEADERS, ...houseNames.map((n) => `Giá ${n}`)],
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
          ...houseNames.map((n) => (v.housePrices || {})[n] || ""),
        ])
      )
    );
    message.success(`Đã xuất ${list.length} dòng`);
  };

  const saveField = (v: PodVariant, col: NumCol, value: number) => {
    update.mutate({ id: v.id, ...colPatch(v, col, value) } as any);
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
        housePrices: toHousePrices(draftHouses),
        created: new Date().toISOString(),
      },
    ]);
    qc.invalidateQueries(["adm-variants"]);
    message.success(`Đã thêm ${product} ${draft.color || ""} ${draft.size || ""}`);
    setDraft({});
    setDraftHouses([]);
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
      cols={cols}
      onSaveField={(col, val) => saveField(v, col, val)}
      onEdit={() => openEdit(v)}
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
        {cols.map((col) => {
          const { field, label } = col;
          const common = groupCommon(g.rows, col);
          return (
            <td
              key={field}
              className={`p-1.5 text-right ${col.house ? "bg-[#F7F8FF]" : ""}`}
            >
              <Tooltip
                title={
                  common === null
                    ? `${label} đang lệch nhau — nhập để đặt CHUNG cho cả nhóm`
                    : `Sửa ${label} cho cả ${g.rows.length} biến thể`
                }
              >
                <InputNumber
                  key={`${g.product}-${field}-${common}`}
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
                      applyGroupField(g.rows, col, val);
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
        {cols.map((col) => {
          const { field, label } = col;
          const common = groupCommon(rows, col);
          return (
            <td
              key={field}
              className={`p-1.5 text-right ${col.house ? "bg-[#F7F8FF]" : ""}`}
            >
              <Tooltip
                title={
                  common === null
                    ? `${label} đang lệch nhau — nhập để đặt CHUNG cho màu này`
                    : `Sửa ${label} cho ${rows.length} size của màu này`
                }
              >
                <InputNumber
                  key={`${ckey}-${field}-${common}`}
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
                      applyGroupField(rows, col, val);
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
          {draftHouses.map((h, i) => (
            <div key={i}>
              <div className="text-[9px] text-gray-400 mb-0.5 flex items-center gap-1">
                CỘT GIÁ NHÀ IN
                <button
                  title="Bỏ cột này"
                  onClick={() =>
                    setDraftHouses((list) => list.filter((_, k) => k !== i))
                  }
                  className="border-0 bg-transparent text-gray-400 hover:text-red-500 cursor-pointer p-0 leading-none"
                >
                  ×
                </button>
              </div>
              <div className="flex gap-1">
                <AutoComplete
                  className="w-[130px]"
                  placeholder="Tên nhà in"
                  value={h.name}
                  options={houseOptions}
                  filterOption={(input, opt) =>
                    String(opt?.value || "")
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  onChange={(v) =>
                    setDraftHouses((list) =>
                      list.map((x, k) => (k === i ? { ...x, name: v || "" } : x))
                    )
                  }
                />
                <InputNumber
                  className="w-[86px]"
                  min={0}
                  step={0.01}
                  value={h.value}
                  onChange={(v) =>
                    setDraftHouses((list) =>
                      list.map((x, k) =>
                        k === i ? { ...x, value: (v as number) || 0 } : x
                      )
                    )
                  }
                />
              </div>
            </div>
          ))}
          <Tooltip title="Thêm 1 cột giá cho nhà in — gõ tên mới hoặc chọn nhà in đã có">
            <Button
              icon={<FiPlus />}
              onClick={() =>
                setDraftHouses((list) => [...list, { name: "", value: 0 }])
              }
            >
              Cột giá nhà in
            </Button>
          </Tooltip>
          <Button type="primary" className="bg-[#171826]" onClick={addRow}>
            Lưu
          </Button>
        </div>
      )}

      {/* Modal sửa 1 biến thể — thêm/xoá cột giá nhà in ngay tại đây */}
      <Modal
        open={!!editing}
        width={720}
        title={`Sửa biến thể ${editing?.product || ""}`}
        okText="Lưu"
        cancelText="Hủy"
        onOk={saveEdit}
        confirmLoading={update.isLoading}
        onCancel={() => setEditing(null)}
      >
        {editing && (
          <div className="space-y-4 pt-2">
            <div className="flex gap-2 flex-wrap">
              <div>
                <div className="text-[10px] text-gray-400 mb-1">SẢN PHẨM</div>
                <Input
                  className="w-[220px]"
                  value={editDraft.product || ""}
                  onChange={(e) =>
                    setEditDraft((d) => ({ ...d, product: e.target.value }))
                  }
                />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 mb-1">MÀU</div>
                <Input
                  className="w-[160px]"
                  value={editDraft.color || ""}
                  onChange={(e) =>
                    setEditDraft((d) => ({ ...d, color: e.target.value }))
                  }
                />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 mb-1">SIZE</div>
                <Input
                  className="w-[90px]"
                  value={editDraft.size || ""}
                  onChange={(e) =>
                    setEditDraft((d) => ({ ...d, size: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {NUM_COLS.map((c) => (
                <div key={c.field}>
                  <div className="text-[10px] text-gray-400 mb-1">
                    {c.label}
                  </div>
                  <InputNumber
                    className="w-[100px]"
                    min={0}
                    step={0.01}
                    value={(editDraft as any)[c.field]}
                    onChange={(v) =>
                      setEditDraft((d) => ({ ...d, [c.field]: v ?? 0 }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3">
              <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-2">
                CỘT GIÁ NHÀ IN
              </div>
              <div className="space-y-2">
                {editHouses.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <AutoComplete
                      className="w-[220px]"
                      placeholder="Tên nhà in"
                      value={h.name}
                      options={houseOptions}
                      filterOption={(input, opt) =>
                        String(opt?.value || "")
                          .toLowerCase()
                          .includes(input.toLowerCase())
                      }
                      onChange={(v) =>
                        setEditHouses((list) =>
                          list.map((x, k) =>
                            k === i ? { ...x, name: v || "" } : x
                          )
                        )
                      }
                    />
                    <InputNumber
                      className="w-[120px]"
                      min={0}
                      step={0.01}
                      value={h.value}
                      onChange={(v) =>
                        setEditHouses((list) =>
                          list.map((x, k) =>
                            k === i ? { ...x, value: (v as number) || 0 } : x
                          )
                        )
                      }
                    />
                    <Tooltip title="Xoá cột giá này khỏi biến thể">
                      <button
                        onClick={() =>
                          setEditHouses((list) =>
                            list.filter((_, k) => k !== i)
                          )
                        }
                        className="w-8 h-8 rounded-md border border-red-100 bg-red-50 text-red-500 inline-flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white"
                      >
                        <FiTrash2 size={13} />
                      </button>
                    </Tooltip>
                  </div>
                ))}
                {!editHouses.length && (
                  <div className="text-gray-400 text-sm italic">
                    Chưa có cột giá nhà in nào cho biến thể này
                  </div>
                )}
              </div>
              <Button
                className="mt-2"
                icon={<FiPlus />}
                onClick={() =>
                  setEditHouses((list) => [...list, { name: "", value: 0 }])
                }
              >
                Thêm cột giá nhà in
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
              {cols.map((c) => (
                <th
                  key={c.field}
                  className={`p-2.5 font-medium text-right ${
                    c.house ? "text-[#4338CA] bg-[#F7F8FF]" : ""
                  }`}
                >
                  {c.house ? (
                    <span className="inline-flex items-center gap-1">
                      <Tooltip title={`Giá riêng của nhà in "${c.house}"`}>
                        <span className="cursor-help">{c.label}</span>
                      </Tooltip>
                      <Popconfirm
                        title={`Xoá cột "Giá ${c.house}"?`}
                        description="Gỡ giá của nhà in này khỏi tất cả biến thể."
                        okText="Xoá cột"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => removeHouseColumn(c.house as string)}
                      >
                        <button
                          title="Xoá cột giá này"
                          className="w-4 h-4 rounded-full border-0 bg-transparent text-gray-400 hover:text-red-500 cursor-pointer leading-none p-0"
                        >
                          ×
                        </button>
                      </Popconfirm>
                    </span>
                  ) : (
                    c.label
                  )}
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
