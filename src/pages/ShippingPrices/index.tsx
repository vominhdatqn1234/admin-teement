import {
  Button,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Tooltip,
  message,
} from "antd";
import { useState } from "react";
import { FiEdit3, FiPlus, FiTrash2 } from "react-icons/fi";
import {
  useShippingMutations,
  useShippingPrices,
} from "../../hooks/useAdmin";
import { ShippingPrice } from "../../models/admin";

export default function ShippingPrices() {
  const { prices } = useShippingPrices();
  const { add, update, remove } = useShippingMutations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShippingPrice | null>(null);
  const [region, setRegion] = useState("US");
  const [method, setMethod] = useState("Standard");
  const [firstItem, setFirstItem] = useState(0);
  const [additionalItem, setAdditionalItem] = useState(0);
  const [estimatedDays, setEstimatedDays] = useState("");
  const [note, setNote] = useState("");

  const openModal = (p?: ShippingPrice) => {
    setEditing(p || null);
    setRegion(p?.region || "US");
    setMethod(p?.method || "Standard");
    setFirstItem(p?.firstItem || 0);
    setAdditionalItem(p?.additionalItem || 0);
    setEstimatedDays(p?.estimatedDays || "");
    setNote(p?.note || "");
    setOpen(true);
  };

  const save = async () => {
    if (!region.trim() || !method.trim())
      return message.error("Nhập khu vực và phương thức");
    const data = {
      region: region.trim(),
      method: method.trim(),
      firstItem,
      additionalItem,
      estimatedDays,
      note,
    };
    if (editing) await update.mutateAsync({ id: editing.id, ...data });
    else
      await add.mutateAsync({ ...data, created: new Date().toISOString() });
    message.success("Đã lưu bảng giá vận chuyển");
    setOpen(false);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 m-0">
            Bảng giá Vận chuyển
          </h1>
          <p className="text-gray-500 text-sm mt-1 mb-0">
            Thiết lập cước ship theo khu vực và phương thức vận chuyển.
          </p>
        </div>
        <Button
          type="primary"
          icon={<FiPlus />}
          className="bg-[#171826]"
          onClick={() => openModal()}
        >
          Thêm mức giá
        </Button>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white mt-6">
        <table className="w-full text-sm border-collapse min-w-[750px]">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium">Khu vực</th>
              <th className="p-3 font-medium">Phương thức</th>
              <th className="p-3 font-medium text-right">Món đầu ($)</th>
              <th className="p-3 font-medium text-right">Món thêm ($)</th>
              <th className="p-3 font-medium">Thời gian dự kiến</th>
              <th className="p-3 font-medium">Ghi chú</th>
              <th className="p-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.id} className="border-b border-gray-50">
                <td className="p-3 font-medium text-gray-900">{p.region}</td>
                <td className="p-3">
                  <span className="bg-gray-100 rounded px-2 py-0.5 text-xs">
                    {p.method}
                  </span>
                </td>
                <td className="p-3 text-right font-medium">
                  ${(p.firstItem || 0).toFixed(2)}
                </td>
                <td className="p-3 text-right">
                  ${(p.additionalItem || 0).toFixed(2)}
                </td>
                <td className="p-3 text-gray-500">{p.estimatedDays || "—"}</td>
                <td className="p-3 text-gray-400 italic max-w-[180px] truncate">
                  {p.note}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    <Tooltip title="Sửa mức giá">
                      <button
                        onClick={() => openModal(p)}
                        className="w-8 h-8 rounded-lg border border-[#D6E4FF] bg-[#EFF4FF] text-[#2563EB] flex items-center justify-center cursor-pointer hover:bg-[#2563EB] hover:text-white transition-colors"
                      >
                        <FiEdit3 size={14} />
                      </button>
                    </Tooltip>
                    <Popconfirm
                      title="Xóa mức giá này?"
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => remove.mutate(p.id)}
                    >
                      <Tooltip title="Xóa mức giá">
                        <button className="w-8 h-8 rounded-lg border border-red-100 bg-red-50 text-red-500 flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white transition-colors">
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
                <td colSpan={7} className="p-12 text-center text-gray-400">
                  Chưa có mức giá nào — bấm "Thêm mức giá"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        title={editing ? "Sửa mức giá vận chuyển" : "Thêm mức giá vận chuyển"}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={add.isLoading || update.isLoading}
        onOk={save}
        onCancel={() => setOpen(false)}
      >
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Khu vực</div>
              <Input
                placeholder="US / EU / VN..."
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Phương thức</div>
              <Input
                placeholder="Standard / Express..."
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Món đầu ($)</div>
              <InputNumber
                className="w-full"
                min={0}
                step={0.5}
                value={firstItem}
                onChange={(v) => setFirstItem(v || 0)}
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Món thêm ($)</div>
              <InputNumber
                className="w-full"
                min={0}
                step={0.5}
                value={additionalItem}
                onChange={(v) => setAdditionalItem(v || 0)}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">
              Thời gian dự kiến
            </div>
            <Input
              placeholder="VD: 7-12 ngày"
              value={estimatedDays}
              onChange={(e) => setEstimatedDays(e.target.value)}
            />
          </div>
          <Input.TextArea
            rows={2}
            placeholder="Ghi chú..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
