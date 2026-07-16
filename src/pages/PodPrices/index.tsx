import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Progress,
  Tooltip,
  message,
} from "antd";
import { useEffect, useRef, useState } from "react";
import { FiDownload, FiEdit3, FiPlus, FiTrash2, FiUpload } from "react-icons/fi";
import { usePodPrices, usePodPriceMutations } from "../../hooks/useAdmin";
import { downloadCSV, parseCSV, toCSV } from "../../lib/csvPod";
import { PodPrice } from "../../models/admin";
import VariantPrices from "./VariantPrices";

const PAGE_SIZE_OPTIONS = [50, 100, 200, 300, 1000];

export default function PodPrices() {
  const [tab, setTab] = useState<"variants" | "legacy">("variants");
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 m-0 mb-1">
        Bảng giá POD
      </h1>
      <div className="flex gap-2 mt-3 mb-4">
        <button
          onClick={() => setTab("variants")}
          className={`px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border ${
            tab === "variants"
              ? "bg-[#171826] text-white border-[#171826]"
              : "bg-white text-gray-600 border-gray-200"
          }`}
        >
          Giá Sản Phẩm (Màu / Size)
        </button>
        <button
          onClick={() => setTab("legacy")}
          className={`px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border ${
            tab === "legacy"
              ? "bg-[#171826] text-white border-[#171826]"
              : "bg-white text-gray-600 border-gray-200"
          }`}
        >
          Bảng giá theo Loại + Size
        </button>
      </div>
      {tab === "variants" ? <VariantPrices /> : <LegacyPodPrices />}
    </div>
  );
}

function LegacyPodPrices() {
  const { prices } = usePodPrices();
  const { add, update, remove, removeMany } = usePodPriceMutations();

  // Form thêm mới (modal)
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newBase, setNewBase] = useState<number | null>(0);
  const [newExtra, setNewExtra] = useState<number | null>(0);

  // Sửa
  const [editing, setEditing] = useState<PodPrice | null>(null);
  const [editForm, setEditForm] = useState({
    productType: "",
    size: "",
    baseCost: 0,
    extraPrintFee: 0,
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const paged = prices.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => prices.some((p) => p.id === id)));
  }, [prices]);

  const pageIds = paged.map((p) => p.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));
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

  const money = (n: number) => `$${(n || 0).toFixed(2)}`;

  const handleAdd = async () => {
    if (!newType.trim() || !newSize.trim())
      return message.error("Nhập Loại SP và Size trước khi thêm");
    await add.mutateAsync({
      productType: newType.trim(),
      size: newSize.trim(),
      baseCost: newBase || 0,
      extraPrintFee: newExtra || 0,
      created: new Date().toISOString(),
    } as any);
    message.success(`Đã thêm ${newType.trim()} · ${newSize.trim()}`);
    setNewType("");
    setNewSize("");
    setNewBase(0);
    setNewExtra(0);
    setAddOpen(false);
  };

  const openEdit = (p: PodPrice) => {
    setEditing(p);
    setEditForm({
      productType: p.productType,
      size: p.size,
      baseCost: p.baseCost || 0,
      extraPrintFee: p.extraPrintFee || 0,
    });
  };
  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.productType.trim() || !editForm.size.trim())
      return message.error("Loại SP và Size không được trống");
    await update.mutateAsync({
      id: editing.id,
      productType: editForm.productType.trim(),
      size: editForm.size.trim(),
      baseCost: editForm.baseCost || 0,
      extraPrintFee: editForm.extraPrintFee || 0,
    });
    message.success("Đã cập nhật bảng giá");
    setEditing(null);
  };

  const handleBulkDelete = async () => {
    const total = selectedIds.length;
    setDeleteProgress({ done: 0, total });
    try {
      await removeMany.mutateAsync({
        ids: selectedIds,
        onProgress: (done, total) => setDeleteProgress({ done, total }),
      });
      message.success(`Đã xóa ${total} dòng`);
      setSelectedIds([]);
    } finally {
      setDeleteProgress(null);
    }
  };

  const handleExport = () => {
    downloadCSV(
      "bang-gia-phoi.csv",
      toCSV(
        ["Loại SP", "Size", "Giá gốc", "In thêm/mặt"],
        prices.map((p) => [
          p.productType,
          p.size,
          (p.baseCost || 0).toFixed(2),
          (p.extraPrintFee || 0).toFixed(2),
        ])
      )
    );
  };

  const handleImport = async (file: File) => {
    const rows = parseCSV(await file.text());
    // Lọc & chuẩn hóa các dòng hợp lệ trước để biết tổng số cho tiến trình
    const valid = rows
      .map((r) => {
        const productType =
          r["Loại SP"] ||
          r["productType"] ||
          r["product_type"] ||
          r["Loại Sản Phẩm"];
        const size = r["Size"] || r["size"];
        if (!productType || !size) return null;
        return {
          productType: String(productType).trim(),
          size: String(size).trim(),
          baseCost:
            parseFloat(r["Giá gốc"] || r["baseCost"] || r["base_cost"] || "0") ||
            0,
          extraPrintFee:
            parseFloat(
              r["In thêm/mặt"] ||
                r["extraPrintFee"] ||
                r["extra_print_cost"] ||
                r["Phí In Mặt Phụ"] ||
                "0"
            ) || 0,
          created: new Date().toISOString(),
        };
      })
      .filter(Boolean) as any[];

    if (!valid.length) {
      message.error("Không tìm thấy dòng hợp lệ trong file CSV");
      return;
    }

    setImportProgress({ done: 0, total: valid.length });
    try {
      let done = 0;
      for (const row of valid) {
        await add.mutateAsync(row);
        done += 1;
        setImportProgress({ done, total: valid.length });
      }
      message.success(`Đã nhập ${valid.length} dòng từ CSV`);
    } finally {
      setImportProgress(null);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <h1 className="text-xl font-semibold text-gray-900 m-0">
          Cấu hình Bảng giá Phôi (Base Cost)
        </h1>
        <div className="flex items-center gap-2">
          <Button
            icon={<FiUpload />}
            loading={!!importProgress}
            onClick={() => fileRef.current?.click()}
          >
            {importProgress
              ? `Đang nhập ${importProgress.done}/${importProgress.total}...`
              : "Nhập CSV (Bulk)"}
          </Button>
          <Button icon={<FiDownload />} onClick={handleExport}>
            Xuất Bảng Giá (.csv)
          </Button>
          <Button
            type="primary"
            icon={<FiPlus />}
            className="bg-[#171826] font-medium"
            onClick={() => setAddOpen(true)}
          >
            Thêm Mới
          </Button>
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
      </div>

      {/* Tiến trình nhập CSV */}
      {importProgress && (
        <div className="bg-[#EFF4FF] border border-[#D6E4FF] rounded-xl px-5 py-4 mb-4">
          <div className="flex items-center justify-between font-semibold text-[#2563EB] mb-2 text-sm">
            <span>
              ⏳ Đang nhập dữ liệu... {importProgress.done}/
              {importProgress.total} dòng
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

      {/* Thanh thao tác khi chọn nhiều */}
      {selectedIds.length > 0 && (
        <div className="bg-[#FBF6EC] border border-[#EADFC8] rounded-xl px-4 py-3 mb-3 flex items-center gap-4 flex-wrap">
          <span className="text-sm text-gray-600">
            Đã chọn <b className="text-[#171826]">{selectedIds.length}</b> dòng
          </span>
          <Popconfirm
            title={`Xóa ${selectedIds.length} dòng đã chọn?`}
            description="Hành động này không thể hoàn tác."
            okText="Xóa tất cả"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={handleBulkDelete}
            disabled={!!deleteProgress}
          >
            <button
              disabled={!!deleteProgress}
              className="flex items-center gap-1.5 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-70 text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer"
            >
              <FiTrash2 size={15} />{" "}
              {deleteProgress
                ? `Đang xóa ${deleteProgress.done}/${deleteProgress.total}...`
                : `Xóa đã chọn (${selectedIds.length})`}
            </button>
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

      <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white">
        <table className="w-full text-sm border-collapse min-w-[760px]">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium w-10">
                <Checkbox
                  checked={allPageSelected}
                  indeterminate={!allPageSelected && somePageSelected}
                  onChange={(e) => togglePage(e.target.checked)}
                />
              </th>
              <th className="p-3 font-medium">Loại Sản Phẩm</th>
              <th className="p-3 font-medium">Size</th>
              <th className="p-3 font-medium">Giá Gốc (Base Cost)</th>
              <th className="p-3 font-medium">Phí In Mặt Phụ</th>
              <th className="p-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-gray-50 ${
                  selectedIds.includes(p.id) ? "bg-[#EFF4FF]" : ""
                }`}
              >
                <td className="p-3">
                  <Checkbox
                    checked={selectedIds.includes(p.id)}
                    onChange={(e) => toggleOne(p.id, e.target.checked)}
                  />
                </td>
                <td className="p-3 font-medium text-gray-900">
                  {p.productType}
                </td>
                <td className="p-3 text-gray-600">{p.size}</td>
                <td className="p-3 font-semibold text-gray-900">
                  {money(p.baseCost)}
                </td>
                <td className="p-3 text-gray-500">{money(p.extraPrintFee)}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Tooltip title="Sửa dòng giá">
                      <button
                        onClick={() => openEdit(p)}
                        className="w-8 h-8 rounded-lg border border-[#D6E4FF] bg-[#EFF4FF] text-[#2563EB] inline-flex items-center justify-center cursor-pointer hover:bg-[#2563EB] hover:text-white transition-colors"
                      >
                        <FiEdit3 size={14} />
                      </button>
                    </Tooltip>
                    <Popconfirm
                      title={`Xóa ${p.productType} · ${p.size}?`}
                      description="Hành động này không thể hoàn tác."
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => remove.mutate(p.id)}
                    >
                      <Tooltip title="Xóa dòng giá">
                        <button className="w-8 h-8 rounded-lg border border-red-100 bg-red-50 text-red-500 inline-flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white transition-colors">
                          <FiTrash2 size={14} />
                        </button>
                      </Tooltip>
                    </Popconfirm>
                  </div>
                </td>
              </tr>
            ))}
            {!prices.length && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-gray-400">
                  Chưa có dòng giá nào — thêm ở form phía trên
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {prices.length > 0 && (
          <div className="flex items-center justify-between p-3 border-t border-gray-100 text-sm text-gray-500 flex-wrap gap-2">
            <span>
              Hiện {paged.length} / {prices.length} dòng
            </span>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={prices.length}
              showSizeChanger
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onChange={(pg, ps) => {
                setPage(pg);
                if (ps !== pageSize) {
                  setPageSize(ps);
                  setPage(1);
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Modal thêm mới */}
      <Modal
        open={addOpen}
        title="Thêm dòng giá phôi"
        okText="Thêm Mới"
        cancelText="Hủy"
        confirmLoading={add.isLoading}
        onOk={handleAdd}
        onCancel={() => setAddOpen(false)}
      >
        <div className="space-y-3 pt-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">Loại SP</div>
            <Input
              placeholder="Vd: T-Shirt"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Size</div>
            <Input
              placeholder="Vd: XL"
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Giá gốc ($)</div>
              <InputNumber
                min={0}
                step={0.5}
                className="w-full"
                value={newBase}
                onChange={(v) => setNewBase(v)}
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">In thêm/mặt ($)</div>
              <InputNumber
                min={0}
                step={0.5}
                className="w-full"
                value={newExtra}
                onChange={(v) => setNewExtra(v)}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal sửa */}
      <Modal
        open={!!editing}
        title={`Sửa: ${editing?.productType || ""} · ${editing?.size || ""}`}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={update.isLoading}
        onOk={saveEdit}
        onCancel={() => setEditing(null)}
      >
        <div className="space-y-3 pt-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">Loại Sản Phẩm</div>
            <Input
              value={editForm.productType}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, productType: e.target.value }))
              }
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Size</div>
            <Input
              value={editForm.size}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, size: e.target.value }))
              }
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Giá Gốc ($)</div>
              <InputNumber
                min={0}
                step={0.5}
                className="w-full"
                value={editForm.baseCost}
                onChange={(v) =>
                  setEditForm((f) => ({ ...f, baseCost: v || 0 }))
                }
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Phí In Mặt Phụ ($)</div>
              <InputNumber
                min={0}
                step={0.5}
                className="w-full"
                value={editForm.extraPrintFee}
                onChange={(v) =>
                  setEditForm((f) => ({ ...f, extraPrintFee: v || 0 }))
                }
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
