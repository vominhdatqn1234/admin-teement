import {
  Button,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Switch,
  message,
} from "antd";
import { useMemo, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { useServiceMutations, useServices } from "../../hooks/useAdmin";
import { ServiceItem } from "../../models/admin";

/** Render SVG icon thuần (chỉ nhận chuỗi bắt đầu bằng <svg) */
function SvgIcon({ svg, size = 22 }: { svg?: string; size?: number }) {
  if (!svg || !svg.trim().startsWith("<svg"))
    return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span
      className="inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full text-gray-600"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function Services() {
  const { services } = useServices();
  const { add, update, remove } = useServiceMutations();
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [hot, setHot] = useState(false);
  const [icon, setIcon] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const paged = useMemo(
    () => services.slice((page - 1) * pageSize, page * pageSize),
    [services, page, pageSize]
  );

  const openModal = (s?: ServiceItem) => {
    setEditing(s || null);
    setTitle(s?.title || "");
    setDescription(s?.description || "");
    setTags((s?.tags || []).join(", "));
    setHot(!!s?.hot);
    setIcon((s as any)?.icon || "");
    setOpen(true);
  };

  const save = async () => {
    if (!title.trim()) return message.error("Nhập tiêu đề dịch vụ");
    if (!description.trim()) return message.error("Nhập mô tả ngắn");
    const data = {
      title: title.trim(),
      description,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      hot,
      icon,
    };
    if (editing) await update.mutateAsync({ id: editing.id, ...data });
    else
      await add.mutateAsync({
        ...data,
        active: true,
        created: new Date().toISOString(),
      });
    message.success(editing ? "Đã cập nhật dịch vụ" : "Đã thêm dịch vụ");
    setOpen(false);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 m-0">
            Dịch vụ mở rộng
          </h1>
          <p className="text-gray-500 text-sm mt-1 mb-0">
            Quản lý các dịch vụ hiển thị trên trang "Dịch vụ hỗ trợ" của seller.
          </p>
        </div>
        <Button
          type="primary"
          icon={<FiPlus />}
          className="bg-[#171826]"
          onClick={() => openModal()}
        >
          Thêm dịch vụ
        </Button>
      </div>

      {/* Bảng dịch vụ */}
      <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white mt-6">
        <table className="w-full text-sm border-collapse min-w-[800px]">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-4 font-medium">Tiêu đề</th>
              <th className="p-4 font-medium">Mô tả</th>
              <th className="p-4 font-medium w-20">Icon</th>
              <th className="p-4 font-medium text-right w-28">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((s) => (
              <tr
                key={s.id}
                className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
              >
                <td className="p-4 min-w-[220px]">
                  <span className="font-semibold text-gray-900">{s.title}</span>
                  {s.hot && (
                    <span className="ml-2 text-[10px] font-bold text-red-500 bg-red-50 rounded px-1.5 py-0.5 align-middle">
                      HOT
                    </span>
                  )}
                  {s.active === false && (
                    <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 align-middle">
                      ẨN
                    </span>
                  )}
                </td>
                <td className="p-4 text-gray-500 max-w-[480px]">
                  <div className="truncate">{s.description}</div>
                </td>
                <td className="p-4">
                  <SvgIcon svg={(s as any).icon} />
                </td>
                <td className="p-4 text-right whitespace-nowrap space-x-4">
                  <button
                    onClick={() => openModal(s)}
                    className="text-gray-900 font-medium bg-transparent border-0 cursor-pointer hover:text-[#2563EB]"
                  >
                    Sửa
                  </button>
                  <Popconfirm
                    title={`Xóa dịch vụ "${s.title}"?`}
                    okText="Xóa"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => remove.mutate(s.id)}
                  >
                    <button className="text-red-500 bg-transparent border-0 cursor-pointer">
                      <FiTrash2 size={15} />
                    </button>
                  </Popconfirm>
                </td>
              </tr>
            ))}
            {!services.length && (
              <tr>
                <td colSpan={4} className="p-14 text-center text-gray-400">
                  Chưa có dịch vụ nào — bấm "Thêm dịch vụ" để tạo dịch vụ đầu
                  tiên hiển thị cho seller
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {services.length > 0 && (
          <div className="flex items-center justify-end p-3 border-t border-gray-100">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={services.length}
              showSizeChanger
              pageSizeOptions={[10, 20, 50, 100]}
              showTotal={(t) => `${t} dịch vụ`}
              onChange={(p, ps) => {
                setPage(ps !== pageSize ? 1 : p);
                setPageSize(ps);
              }}
            />
          </div>
        )}
      </div>

      {/* Modal thêm/sửa */}
      <Modal
        open={open}
        width={760}
        title={editing ? "Sửa dịch vụ" : "Thêm dịch vụ"}
        okText={editing ? "Cập nhật" : "Lưu"}
        cancelText="Hủy"
        confirmLoading={add.isLoading || update.isLoading}
        onOk={save}
        onCancel={() => setOpen(false)}
      >
        <div className="space-y-4 pt-2">
          <div className="flex gap-4 flex-wrap items-end">
            <div className="flex-1 min-w-[220px]">
              <div className="text-xs font-medium text-gray-500 mb-1.5">
                Tiêu đề dịch vụ <span className="text-red-500">*</span>
              </div>
              <Input
                placeholder="VD: Tạo Design Theo Yêu Cầu"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className="text-xs font-medium text-gray-500 mb-1.5">
                Thẻ Tags (cách nhau dấu phẩy)
              </div>
              <Input
                placeholder="Custom Design, Trending, Illustration..."
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 pb-1.5 text-sm text-gray-600">
              <Switch checked={hot} onChange={setHot} /> Hot
              {editing && (
                <span className="flex items-center gap-2 ml-4">
                  <Switch
                    checked={editing.active !== false}
                    onChange={(v) =>
                      update.mutate({ id: editing.id, active: v })
                    }
                  />
                  Hiển thị
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1.5">
              Mô tả ngắn <span className="text-red-500">*</span>
            </div>
            <Input.TextArea
              rows={4}
              placeholder="Mô tả dịch vụ hiển thị cho seller..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1.5">
              SVG Icon (Paste mã SVG thuần)
            </div>
            <Input.TextArea
              rows={4}
              placeholder='<svg viewBox="0 0 24 24" ...>...</svg>'
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="font-mono text-xs"
            />
            {icon.trim() && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                Xem trước:
                <span className="w-9 h-9 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center">
                  <SvgIcon svg={icon} size={20} />
                </span>
                {!icon.trim().startsWith("<svg") && (
                  <span className="text-red-500">
                    Mã phải bắt đầu bằng &lt;svg
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
