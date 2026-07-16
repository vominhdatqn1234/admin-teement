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
  Select,
  message,
} from "antd";
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "react-query";
import { FiDownload, FiPlus, FiTrash2, FiUpload } from "react-icons/fi";
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

const keyOf = (p?: string, c?: string, s?: string) =>
  `${(p || "").trim().toLowerCase()}|${(c || "").trim().toLowerCase()}|${(
    s || ""
  )
    .trim()
    .toLowerCase()}`;

export default function VariantPrices() {
  const { variants } = usePodVariants();
  const { update, removeMany } = usePodVariantMutations();
  const qc = useQueryClient();

  const [filterProduct, setFilterProduct] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
    return variants.filter((v) => {
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
  }, [variants, filterProduct, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = paged.map((v) => v.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

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
        <span className="ml-auto text-xs bg-gray-100 rounded-full px-3 py-1 text-gray-600 font-medium">
          {filtered.length} biến thể
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
            {paged.map((v) => (
              <tr
                key={v.id}
                className={`border-b border-gray-50 ${
                  selectedIds.includes(v.id) ? "bg-[#EFF4FF]" : ""
                }`}
              >
                <td className="p-2.5">
                  <Checkbox
                    checked={selectedIds.includes(v.id)}
                    onChange={(e) =>
                      setSelectedIds((prev) =>
                        e.target.checked
                          ? [...prev, v.id]
                          : prev.filter((x) => x !== v.id)
                      )
                    }
                  />
                </td>
                <td className="p-2.5 font-medium text-gray-800">
                  {v.product}
                </td>
                <td className="p-2.5">{v.color || "—"}</td>
                <td className="p-2.5">{v.size || "—"}</td>
                {NUM_COLS.map(({ field }) => (
                  <td key={field} className="p-1.5 text-right">
                    <InputNumber
                      size="small"
                      min={0}
                      step={0.01}
                      controls={false}
                      className="w-[80px]"
                      defaultValue={((v as any)[field] as number) || 0}
                      onBlur={(e) => {
                        const val =
                          parseFloat(
                            (e.target as HTMLInputElement).value.replace(
                              /,/g,
                              ""
                            )
                          ) || 0;
                        if (val !== (((v as any)[field] as number) || 0))
                          saveField(v, field, val);
                      }}
                    />
                  </td>
                ))}
                <td className="p-2.5">
                  <Popconfirm
                    title={`Xóa ${v.product} ${v.color || ""} ${v.size || ""}?`}
                    okText="Xóa"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                    onConfirm={async () => {
                      await removeMany.mutateAsync([v.id] as any);
                      message.success("Đã xóa biến thể");
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
                <td colSpan={13} className="p-12 text-center text-gray-400">
                  {variants.length
                    ? "Không có biến thể nào khớp bộ lọc"
                    : "Kho trống — bấm Import CSV để nạp file Giá Sản Phẩm Teement"}
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
              pageSizeOptions={[50, 100, 200, 500, 1000]}
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
