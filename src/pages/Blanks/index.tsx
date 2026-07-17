import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Progress,
  Switch,
  Tooltip,
  message,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiDownload,
  FiEdit3,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import { downloadCSV, parseCSV, toCSV } from "../../lib/csvPod";
import {
  useBaseProductMutations,
  useBaseProducts,
  usePodVariants,
} from "../../hooks/useAdmin";
import { BaseProduct, PodVariant } from "../../models/admin";
import { toDirectImageUrl } from "../../lib/imageUrl";
import UploadImgButton from "../../components/UploadImgButton";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[13px] font-semibold text-gray-700 mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

export default function Blanks() {
  const { products } = useBaseProducts();
  const { variants } = usePodVariants();
  const { add, update, remove, removeMany } = useBaseProductMutations();
  const [search, setSearch] = useState("");
  const [syncProgress, setSyncProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BaseProduct | null>(null);
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [colors, setColors] = useState("Black, White, Navy");
  const [sizes, setSizes] = useState("S, M, L, XL, 2XL");
  const [material, setMaterial] = useState("");
  const [baseCost, setBaseCost] = useState(0);
  const [inStock, setInStock] = useState(true);
  const [specs, setSpecs] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  // Parse cột dạng JSON array: ["S","M"] -> string[]
  const parseJsonArr = (v: string): string[] => {
    try {
      const arr = JSON.parse(v || "[]");
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  };

  /** Nhập CSV catalog: upsert theo SKU (trùng thì cập nhật, mới thì thêm) */
  const handleImportCsv = async (file: File) => {
    setImporting(true);
    try {
      const rows = parseCSV(await file.text());
      const valid = rows.filter((r) => (r["sku"] || r["SKU"] || "").trim());
      setImportProgress({ done: 0, total: valid.length });
      let added = 0;
      let updated = 0;
      let done = 0;
      for (const r of valid) {
        const rowSku = (r["sku"] || r["SKU"] || "").trim();
        const data = {
          sku: rowSku,
          name: (r["name"] || "").trim() || rowSku,
          image: (r["image_url"] || "").trim(),
          material: (r["material"] || "").trim(),
          inStock: String(r["in_stock"]).toUpperCase() !== "FALSE",
          baseCost: parseFloat(r["display_price"]) || 0,
          specs: r["description"] || "",
          colors: parseJsonArr(r["colors"]),
          sizes: parseJsonArr(r["sizes"]),
          category: (r["category"] || "").trim() || "Khác",
        };
        const existing = products.find(
          (p) => p.sku.toLowerCase() === rowSku.toLowerCase()
        );
        if (existing) {
          await update.mutateAsync({ id: existing.id, ...data });
          updated++;
        } else {
          await add.mutateAsync({
            ...data,
            created: new Date().toISOString(),
          });
          added++;
        }
        done++;
        setImportProgress({ done, total: valid.length });
      }
      message.success(`Nhập CSV xong: thêm ${added} phôi, cập nhật ${updated} phôi`);
    } catch (e: any) {
      message.error(`Nhập CSV lỗi: ${e?.message || e}`);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  /** Xuất toàn bộ catalog ra CSV (đúng format nhập) */
  const handleExportCatalog = () => {
    downloadCSV(
      "pod_blanks_catalog.csv",
      toCSV(
        [
          "sku",
          "name",
          "image_url",
          "material",
          "in_stock",
          "display_price",
          "description",
          "colors",
          "sizes",
          "out_of_stock_variants",
        ],
        products.map((p) => [
          p.sku,
          p.name,
          p.image || "",
          (p as any).material || "",
          p.inStock ? "TRUE" : "FALSE",
          p.baseCost || 0,
          (p as any).specs || "",
          JSON.stringify(p.colors || []),
          JSON.stringify(p.sizes || []),
          "[]",
        ])
      )
    );
  };

  /**
   * Đồng bộ danh mục phôi từ Bảng giá POD (podVariants):
   * mỗi sản phẩm trong bảng giá → 1 phôi, kèm màu/size lấy từ các biến thể.
   * Trùng tên → cập nhật màu/size (giữ nguyên các thông tin khác);
   * chưa có → thêm phôi mới.
   */
  const handleSyncFromPrices = async () => {
    const byProduct = new Map<string, PodVariant[]>();
    variants.forEach((v) => {
      const p = (v.product || "").trim();
      if (!p) return;
      if (!byProduct.has(p)) byProduct.set(p, []);
      byProduct.get(p)!.push(v);
    });
    const entries = Array.from(byProduct.entries());
    const total = entries.length;
    if (!total) return message.warning("Bảng giá POD chưa có dữ liệu");
    setSyncProgress({ done: 0, total });
    let added = 0;
    let updated = 0;
    let done = 0;
    try {
      for (const [product, rows] of entries) {
        const colors = Array.from(
          new Set(rows.map((r) => (r.color || "").trim()).filter(Boolean))
        );
        const sizes = Array.from(
          new Set(rows.map((r) => (r.size || "").trim()).filter(Boolean))
        );
        const existing = products.find(
          (p) => p.name.trim().toLowerCase() === product.toLowerCase()
        );
        if (existing) {
          // Chỉ cập nhật màu/size, giữ nguyên SKU/giá/ảnh/chất liệu...
          await update.mutateAsync({ id: existing.id, colors, sizes });
          updated++;
        } else {
          await add.mutateAsync({
            name: product,
            sku: product,
            category: "POD",
            colors,
            sizes,
            baseCost: rows[0]?.priceTeement || 0,
            inStock: true,
            image: "",
            material: "",
            specs: "",
            created: new Date().toISOString(),
          } as any);
          added++;
        }
        done++;
        setSyncProgress({ done, total });
      }
      message.success(
        `Đồng bộ từ Bảng giá POD xong: thêm ${added}, cập nhật ${updated} phôi`
      );
    } catch (e: any) {
      message.error(`Đồng bộ lỗi: ${e?.message || e}`);
    } finally {
      setSyncProgress(null);
    }
  };

  const list = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const paged = useMemo(
    () => list.slice((page - 1) * pageSize, page * pageSize),
    [list, page, pageSize]
  );
  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => products.some((p) => p.id === id))
    );
  }, [products]);

  const pageIds = paged.map((p) => p.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const togglePage = (checked: boolean) =>
    setSelectedIds((prev) =>
      checked
        ? Array.from(new Set([...prev, ...pageIds]))
        : prev.filter((id) => !pageIds.includes(id))
    );
  const toggleOne = (id: string, checked: boolean) =>
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id)
    );

  const handleBulkDelete = async () => {
    const total = selectedIds.length;
    setDeleteProgress({ done: 0, total });
    try {
      await removeMany.mutateAsync({
        ids: selectedIds,
        onProgress: (done, total) => setDeleteProgress({ done, total }),
      });
      message.success(`Đã xóa ${total} phôi`);
      setSelectedIds([]);
    } finally {
      setDeleteProgress(null);
    }
  };

  const openModal = (p?: BaseProduct) => {
    setEditing(p || null);
    setSku(p?.sku || "");
    setCategory(p?.category || "");
    setName(p?.name || "");
    setImage(p?.image || "");
    setColors((p?.colors || ["Black", "White", "Navy"]).join(", "));
    setSizes((p?.sizes || ["S", "M", "L", "XL", "2XL"]).join(", "));
    setMaterial((p as any)?.material || "");
    setBaseCost(p?.baseCost || 0);
    setInStock(p ? p.inStock : true);
    setSpecs((p as any)?.specs || "");
    setOpen(true);
  };

  const save = async () => {
    if (!sku.trim()) return message.error("Nhập Mã Phôi (SKU)");
    if (!name.trim()) return message.error("Nhập Tên Phôi");
    const data = {
      sku: sku.trim(),
      category: category.trim() || "Khác",
      name: name.trim(),
      image: image.trim(),
      colors: colors.split(",").map((c) => c.trim()).filter(Boolean),
      sizes: sizes.split(",").map((s) => s.trim()).filter(Boolean),
      material: material.trim(),
      baseCost,
      inStock,
      specs,
    };
    if (editing) await update.mutateAsync({ id: editing.id, ...data });
    else
      await add.mutateAsync({ ...data, created: new Date().toISOString() });
    message.success(editing ? "Đã cập nhật phôi" : "Đã thêm phôi mới");
    setOpen(false);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 m-0">
            Kho Phôi POD
          </h1>
          <p className="text-gray-500 text-sm mt-1 mb-0">
            Quản lý danh mục phôi hiển thị cho seller (Base Catalog).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Tìm phôi / SKU..."
            className="w-[220px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
          <Button
            icon={<FiUpload />}
            loading={importing}
            onClick={() => csvRef.current?.click()}
          >
            {importProgress
              ? `Đang nhập ${importProgress.done}/${importProgress.total}...`
              : "Nhập CSV"}
          </Button>
          <Button icon={<FiDownload />} onClick={handleExportCatalog}>
            Xuất Catalog
          </Button>
          <Popconfirm
            title="Đồng bộ phôi từ Bảng giá POD?"
            description={`Tạo/cập nhật phôi theo ${
              new Set(variants.map((v) => (v.product || "").trim()).filter(Boolean))
                .size
            } sản phẩm trong bảng giá (kèm màu/size). Không xoá phôi hiện có.`}
            okText="Đồng bộ"
            cancelText="Hủy"
            onConfirm={handleSyncFromPrices}
            disabled={!!syncProgress}
          >
            <Button
              icon={<FiRefreshCw />}
              loading={!!syncProgress}
              disabled={!variants.length}
            >
              {syncProgress
                ? `Đang đồng bộ ${syncProgress.done}/${syncProgress.total}...`
                : "Đồng bộ từ Bảng giá POD"}
            </Button>
          </Popconfirm>
          <input
            ref={csvRef}
            type="file"
            accept=".csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportCsv(f);
              e.target.value = "";
            }}
          />
          <Button
            type="primary"
            icon={<FiPlus />}
            className="bg-[#171826]"
            onClick={() => openModal()}
          >
            Thêm phôi
          </Button>
        </div>
      </div>

      {/* Tiến trình nhập CSV */}
      {importProgress && (
        <div className="bg-[#EFF4FF] border border-[#D6E4FF] rounded-xl px-5 py-4 mt-5">
          <div className="flex items-center justify-between font-semibold text-[#2563EB] mb-2 text-sm">
            <span>
              ⏳ Đang nhập catalog... {importProgress.done}/
              {importProgress.total} phôi
            </span>
            <span>
              {Math.round((importProgress.done / importProgress.total) * 100)}%
            </span>
          </div>
          <Progress
            percent={Math.round(
              (importProgress.done / importProgress.total) * 100
            )}
            showInfo={false}
            status="active"
          />
          <div className="text-xs text-gray-400 mt-1">
            Vui lòng không đóng trang trong lúc nhập.
          </div>
        </div>
      )}

      {/* Tiến trình đồng bộ từ Bảng giá POD */}
      {syncProgress && (
        <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-5 py-4 mt-5">
          <div className="flex items-center justify-between font-semibold text-[#15803D] mb-2 text-sm">
            <span>
              🔄 Đang đồng bộ phôi từ Bảng giá POD... {syncProgress.done}/
              {syncProgress.total}
            </span>
            <span>
              {Math.round((syncProgress.done / syncProgress.total) * 100)}%
            </span>
          </div>
          <Progress
            percent={Math.round(
              (syncProgress.done / syncProgress.total) * 100
            )}
            showInfo={false}
            status="active"
            strokeColor="#22C55E"
          />
        </div>
      )}

      {/* Thanh chọn nhiều */}
      {selectedIds.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-5 flex items-center gap-4 flex-wrap">
          <span className="text-sm text-gray-600">
            Đã chọn <b className="text-gray-900">{selectedIds.length}</b> phôi
          </span>
          <Popconfirm
            title={`Xóa ${selectedIds.length} phôi đã chọn?`}
            description="Hành động này không thể hoàn tác."
            okText="Xóa tất cả"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={handleBulkDelete}
            disabled={!!deleteProgress}
          >
            <Button danger loading={removeMany.isLoading} disabled={!!deleteProgress}>
              {deleteProgress
                ? `Đang xóa ${deleteProgress.done}/${deleteProgress.total}...`
                : `Xóa đã chọn (${selectedIds.length})`}
            </Button>
          </Popconfirm>
          {deleteProgress ? (
            <div className="flex-1 min-w-[160px] max-w-[280px]">
              <Progress
                percent={Math.round(
                  (deleteProgress.done / deleteProgress.total) * 100
                )}
                size="small"
                status="active"
                strokeColor="#DC2626"
              />
            </div>
          ) : (
            <button
              onClick={() => setSelectedIds([])}
              className="text-gray-400 text-sm bg-transparent border-0 cursor-pointer ml-auto"
            >
              Bỏ chọn tất cả
            </button>
          )}
        </div>
      )}

      <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white mt-6">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 w-10">
                <Checkbox
                  checked={allPageSelected}
                  indeterminate={
                    !allPageSelected &&
                    pageIds.some((id) => selectedIds.includes(id))
                  }
                  onChange={(e) => togglePage(e.target.checked)}
                />
              </th>
              <th className="p-3 font-medium">Ảnh</th>
              <th className="p-3 font-medium">Tên phôi</th>
              <th className="p-3 font-medium">SKU</th>
              <th className="p-3 font-medium">Danh mục</th>
              <th className="p-3 font-medium">Chất liệu</th>
              <th className="p-3 font-medium text-right">Giá gốc</th>
              <th className="p-3 font-medium text-center">Còn hàng</th>
              <th className="p-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-gray-50 transition-colors ${
                  selectedIds.includes(p.id)
                    ? "bg-amber-50"
                    : "hover:bg-gray-50/50"
                }`}
              >
                <td className="p-3">
                  <Checkbox
                    checked={selectedIds.includes(p.id)}
                    onChange={(e) => toggleOne(p.id, e.target.checked)}
                  />
                </td>
                <td className="p-3">
                  <div className="w-11 h-11 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center">
                    {p.image ? (
                      <img
                        src={toDirectImageUrl(p.image)}
                        alt={p.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) =>
                          ((e.target as HTMLImageElement).style.display =
                            "none")
                        }
                      />
                    ) : (
                      <span className="text-[8px] text-gray-300">No img</span>
                    )}
                  </div>
                </td>
                <td className="p-3 font-medium text-gray-900">{p.name}</td>
                <td className="p-3 text-gray-500">{p.sku}</td>
                <td className="p-3">
                  <span className="bg-gray-100 rounded px-2 py-0.5 text-xs">
                    {p.category || "Khác"}
                  </span>
                </td>
                <td className="p-3 text-gray-500 max-w-[160px] truncate">
                  {(p as any).material || "—"}
                </td>
                <td className="p-3 text-right font-medium">
                  ${(p.baseCost || 0).toFixed(2)}
                </td>
                <td className="p-3 text-center">
                  <Switch
                    size="small"
                    checked={p.inStock}
                    onChange={(v) => update.mutate({ id: p.id, inStock: v })}
                  />
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <div className="inline-flex gap-1.5">
                    <Tooltip title="Sửa thông tin phôi">
                      <button
                        onClick={() => openModal(p)}
                        className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-700 flex items-center justify-center cursor-pointer hover:border-[#2563EB] hover:text-[#2563EB] transition-colors"
                      >
                        <FiEdit3 size={14} />
                      </button>
                    </Tooltip>
                    <Popconfirm
                      title={`Xóa phôi "${p.name}"?`}
                      description="Hành động này không thể hoàn tác."
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => remove.mutate(p.id)}
                    >
                      <Tooltip title="Xóa phôi">
                        <button className="w-8 h-8 rounded-lg border border-red-100 bg-red-50 text-red-500 flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white transition-colors">
                          <FiTrash2 size={14} />
                        </button>
                      </Tooltip>
                    </Popconfirm>
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={9} className="p-12 text-center text-gray-400">
                  Không có phôi nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {list.length > 0 && (
          <div className="flex items-center justify-end p-3 border-t border-gray-100">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={list.length}
              showSizeChanger
              pageSizeOptions={[10, 20, 50, 100]}
              showTotal={(t) => `${t} phôi`}
              onChange={(p, ps) => {
                setPage(ps !== pageSize ? 1 : p);
                setPageSize(ps);
              }}
            />
          </div>
        )}
      </div>

      <Modal
        open={open}
        width={980}
        title={editing ? `Sửa phôi: ${editing.name}` : "Thêm phôi mới"}
        okText={editing ? "Cập nhật" : "Lưu phôi"}
        cancelText="Hủy"
        confirmLoading={add.isLoading || update.isLoading}
        onOk={save}
        onCancel={() => setOpen(false)}
      >
        <div className="space-y-4 pt-2">
          {/* Hàng 1: SKU / Danh mục / Tên phôi / Link ảnh */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Mã Phôi (SKU)">
              <Input
                placeholder="Vd: TS-2D"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                status={!sku.trim() ? "error" : ""}
              />
            </Field>
            <Field label="Danh mục (Loại)">
              <Input
                placeholder="T-shirt"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </Field>
            <Field label="Tên Phôi">
              <Input
                placeholder="Vd: T-Shirt 2D Premium"
                value={name}
                onChange={(e) => setName(e.target.value)}
                status={!name.trim() ? "error" : ""}
              />
            </Field>
            <Field label="Link Ảnh (URL)">
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="https://... hoặc Upload"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                />
                <UploadImgButton size="small" onUploaded={setImage} />
                {image.trim() && (
                  <img
                    key={image}
                    src={toDirectImageUrl(image)}
                    alt="preview"
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-md object-cover border border-gray-200 shrink-0"
                    onError={(e) =>
                      ((e.target as HTMLImageElement).style.display = "none")
                    }
                  />
                )}
              </div>
            </Field>
          </div>

          {/* Hàng 2: Màu sắc / Sizes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field label="Danh sách Màu Sắc (Phân tách bằng dấu phẩy)">
              <Input
                placeholder="Black, White, Navy"
                value={colors}
                onChange={(e) => setColors(e.target.value)}
              />
            </Field>
            <Field label="Danh sách Sizes (Phân tách bằng dấu phẩy)">
              <Input
                placeholder="S, M, L, XL, 2XL"
                value={sizes}
                onChange={(e) => setSizes(e.target.value)}
              />
            </Field>
          </div>

          {/* Hàng 3: Chất liệu / Giá gốc / In Stock */}
          <div className="flex gap-4 items-end flex-wrap">
            <Field label="Chất liệu" className="flex-1 min-w-[240px]">
              <Input
                placeholder="100% Cotton, 200gsm..."
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              />
            </Field>
            <Field label="Giá gốc ($)" className="w-[180px]">
              <InputNumber
                className="w-full"
                min={0}
                step={0.5}
                value={baseCost}
                onChange={(v) => setBaseCost(v || 0)}
              />
            </Field>
            <div className="flex items-center gap-2 pb-1.5 text-sm font-medium text-gray-700">
              <Switch checked={inStock} onChange={setInStock} /> In Stock
            </div>
          </div>

          {/* Hàng 4: Mô tả chi tiết */}
          <Field label="Mô tả thông số phôi chi tiết">
            <Input.TextArea
              rows={4}
              placeholder="Nhập thông tin chi tiết về form dáng, chất vải, thông số size chart hoặc cách bảo quản..."
              value={specs}
              onChange={(e) => setSpecs(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
