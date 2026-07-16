/**
 * Quản lý Mã màu phôi: tên màu (Black, Dark heather, Maroon...) -> mã hex.
 * Client dùng bảng này để hiển thị màu nền cho thiết kế FRONT/BACK/MOCKUP
 * khi phôi của item có màu tương ứng.
 */
import {
  Button,
  Checkbox,
  Input,
  Pagination,
  Popconfirm,
  Tooltip,
  message,
} from "antd";
import { useState } from "react";
import { useQueryClient } from "react-query";
import { FiCopy, FiPlus, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import {
  usePodColorMutations,
  usePodColors,
  usePodVariants,
} from "../../hooks/useAdmin";
import { DEFAULT_COLOR_HEX } from "../../lib/colorHex";
import { sbUpsert } from "../../lib/supabase";

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function Colors() {
  const { colors } = usePodColors();
  const { variants } = usePodVariants();
  const mut = usePodColorMutations();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  // Lấy màu từ Bảng giá POD -> chỉ thêm màu CHƯA có (không trùng tên/value)
  const syncFromVariants = async () => {
    const existing = new Set(
      colors.map((c) => c.name.trim().toLowerCase())
    );
    const names = Array.from(
      new Set(variants.map((v) => (v.color || "").trim()).filter(Boolean))
    );
    const missing = names.filter((n) => !existing.has(n.toLowerCase()));
    if (!missing.length)
      return message.info(
        "Không có màu mới — tất cả màu trong Bảng giá POD đã có trong bảng mã màu"
      );
    setSyncing(true);
    try {
      const now = new Date().toISOString();
      await sbUpsert(
        "podColors",
        missing.map((n) => ({
          id: `color-${slug(n)}`,
          name: n,
          hex: DEFAULT_COLOR_HEX[n.trim().toLowerCase()] || "#CCCCCC",
          created: now,
        }))
      );
      qc.invalidateQueries(["adm-colors"]);
      message.success(
        `Đã thêm ${missing.length} màu mới từ Bảng giá POD (bỏ qua ${
          names.length - missing.length
        } màu đã có)`
      );
    } finally {
      setSyncing(false);
    }
  };
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#171826");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const addColor = async () => {
    const n = name.trim();
    if (!n) return message.warning("Nhập tên màu (vd: Dark heather)");
    if (!/^#[0-9a-fA-F]{6}$/.test(hex))
      return message.warning("Mã hex không hợp lệ (vd: #4A4A48)");
    if (colors.some((c) => c.name.trim().toLowerCase() === n.toLowerCase()))
      return message.warning(`Màu "${n}" đã tồn tại`);
    await mut.add.mutateAsync({
      name: n,
      hex,
      created: new Date().toISOString(),
    });
    message.success(`Đã thêm màu ${n} (${hex})`);
    setName("");
  };

  const copyHex = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      message.success(`Đã copy ${v}`);
    } catch {
      message.error("Không copy được");
    }
  };

  const filtered = colors.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.hex.toLowerCase().includes(search.toLowerCase())
  );

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = paged.map((c) => c.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const handleBulkDelete = async () => {
    await mut.removeMany.mutateAsync(selectedIds as any);
    message.success(`Đã xóa ${selectedIds.length} màu`);
    setSelectedIds([]);
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 m-0">Mã màu phôi</h1>
      <p className="text-gray-500 text-sm mt-1">
        Tên màu phải trùng với màu của phôi (vd: Black, Dark heather, Maroon).
        Khi item trên đơn có màu tương ứng, thiết kế FRONT/BACK/MOCKUP bên
        client sẽ hiển thị nền đúng mã màu này.
      </p>

      {/* Thêm màu mới */}
      <div className="border border-gray-200 rounded-xl p-4 mt-4 bg-white flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            TÊN MÀU
          </div>
          <Input
            className="w-[220px]"
            placeholder="Vd: Dark heather"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={addColor}
          />
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            MÃ MÀU (HEX)
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              className="w-[38px] h-[32px] p-0 border border-gray-200 rounded-md cursor-pointer bg-white"
            />
            <Input
              className="w-[110px] font-mono"
              value={hex}
              onChange={(e) => setHex(e.target.value.trim())}
            />
          </div>
        </div>
        <Button
          type="primary"
          icon={<FiPlus />}
          className="bg-[#171826] font-medium"
          loading={mut.add.isLoading}
          onClick={addColor}
        >
          Thêm màu
        </Button>
        <Tooltip title="Quét các màu trong Bảng giá POD, chỉ thêm màu chưa có (không tạo trùng)">
          <Button
            icon={<FiRefreshCw />}
            loading={syncing}
            onClick={syncFromVariants}
          >
            Đồng bộ màu từ Bảng giá POD
          </Button>
        </Tooltip>
        {selectedIds.length > 0 && (
          <Popconfirm
            title={`Xóa ${selectedIds.length} màu đã chọn?`}
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
        <Input
          className="w-[200px] ml-auto"
          placeholder="Tìm tên màu / mã hex..."
          allowClear
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <span className="text-xs bg-gray-100 rounded-full px-3 py-1 text-gray-600 font-medium">
          {filtered.length} màu
        </span>
      </div>

      {/* Danh sách màu */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white mt-4">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 w-10">
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
              <th className="p-3 font-medium w-[90px]">Màu</th>
              <th className="p-3 font-medium">Tên màu</th>
              <th className="p-3 font-medium">Mã hex</th>
              <th className="p-3 font-medium w-[120px]">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c) => (
              <tr
                key={c.id}
                className={`border-b border-gray-50 ${
                  selectedIds.includes(c.id) ? "bg-[#EFF4FF]" : ""
                }`}
              >
                <td className="p-3">
                  <Checkbox
                    checked={selectedIds.includes(c.id)}
                    onChange={(e) =>
                      setSelectedIds((prev) =>
                        e.target.checked
                          ? [...prev, c.id]
                          : prev.filter((x) => x !== c.id)
                      )
                    }
                  />
                </td>
                <td className="p-3">
                  <Tooltip title={`${c.name} — ${c.hex}`}>
                    <span
                      className="inline-block w-9 h-9 rounded-lg border border-gray-200 shadow-sm"
                      style={{ background: c.hex }}
                    />
                  </Tooltip>
                </td>
                <td className="p-3">
                  <Input
                    key={c.name}
                    defaultValue={c.name}
                    className="w-[220px]"
                    onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.name)
                        mut.update.mutate({ id: c.id, name: v });
                    }}
                  />
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      defaultValue={c.hex}
                      className="w-[34px] h-[30px] p-0 border border-gray-200 rounded-md cursor-pointer bg-white"
                      onBlur={(e) => {
                        if (e.target.value !== c.hex)
                          mut.update.mutate({ id: c.id, hex: e.target.value });
                      }}
                    />
                    <Input
                      key={c.hex}
                      defaultValue={c.hex}
                      className="w-[110px] font-mono"
                      onPressEnter={(e) =>
                        (e.target as HTMLInputElement).blur()
                      }
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (/^#[0-9a-fA-F]{6}$/.test(v) && v !== c.hex)
                          mut.update.mutate({ id: c.id, hex: v });
                      }}
                    />
                    <Tooltip title="Copy mã hex">
                      <button
                        onClick={() => copyHex(c.hex)}
                        className="w-7 h-7 rounded-md border border-gray-200 bg-white text-gray-400 inline-flex items-center justify-center cursor-pointer hover:text-gray-700"
                      >
                        <FiCopy size={13} />
                      </button>
                    </Tooltip>
                  </div>
                </td>
                <td className="p-3">
                  <Popconfirm
                    title={`Xóa màu "${c.name}"?`}
                    okText="Xóa"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => mut.remove.mutate(c.id)}
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
                <td colSpan={5} className="p-10 text-center text-gray-400">
                  {colors.length
                    ? "Không tìm thấy màu nào"
                    : "Chưa có mã màu nào — thêm màu đầu tiên ở trên"}
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
              showTotal={(t) => `${t} màu`}
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
