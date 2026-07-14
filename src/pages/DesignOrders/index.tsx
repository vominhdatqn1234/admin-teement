import { Button, Input, Modal, Popconfirm, Select, message } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { FiPlus } from "react-icons/fi";
import {
  useDesignRequestMutations,
  useDesignRequests,
  useSellers,
} from "../../hooks/useAdmin";
import { DesignRequest } from "../../models/admin";

const REQ_STATUS: Record<string, { label: string; color: string; bg: string }> =
  {
    pending: { label: "Chờ xử lý", color: "#B7791F", bg: "#FEF9E7" },
    in_progress: { label: "Đang thiết kế", color: "#2563EB", bg: "#EBF2FF" },
    done: { label: "Hoàn thành", color: "#15803D", bg: "#E8F7EC" },
    cancelled: { label: "Đã hủy", color: "#B91C1C", bg: "#FDECEC" },
  };

export default function DesignOrders() {
  const { requests } = useDesignRequests();
  const { sellers } = useSellers();
  const { add, update, remove } = useDesignRequestMutations();
  const [open, setOpen] = useState(false);
  const [sellerId, setSellerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");

  const save = async () => {
    if (!title.trim()) return message.error("Nhập tiêu đề đơn thiết kế");
    const seller = sellers.find((s) => s.id === sellerId);
    await add.mutateAsync({
      sellerId,
      sellerName: seller?.name || seller?.email || "",
      title: title.trim(),
      description,
      referenceUrl,
      resultUrl: "",
      status: "pending",
      price: 0,
      created: new Date().toISOString(),
    });
    message.success("Đã tạo đơn thiết kế");
    setOpen(false);
    setTitle("");
    setDescription("");
    setReferenceUrl("");
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 m-0">
            Đơn Thiết Kế
          </h1>
          <p className="text-gray-500 text-sm mt-1 mb-0">
            Quản lý các yêu cầu "Tạo Design Theo Yêu Cầu" từ seller.
          </p>
        </div>
        <Button
          type="primary"
          icon={<FiPlus />}
          className="bg-[#171826]"
          onClick={() => setOpen(true)}
        >
          Tạo đơn thiết kế
        </Button>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white mt-6">
        <table className="w-full text-sm border-collapse min-w-[850px]">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium">Ngày tạo</th>
              <th className="p-3 font-medium">Seller</th>
              <th className="p-3 font-medium">Yêu cầu</th>
              <th className="p-3 font-medium">Link tham khảo / kết quả</th>
              <th className="p-3 font-medium">Trạng thái</th>
              <th className="p-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const st = REQ_STATUS[r.status] || REQ_STATUS.pending;
              return (
                <tr key={r.id} className="border-b border-gray-50 align-top">
                  <td className="p-3 whitespace-nowrap text-gray-500">
                    {r.created ? dayjs(r.created).format("DD/MM/YYYY") : "—"}
                  </td>
                  <td className="p-3 font-medium">{r.sellerName || "—"}</td>
                  <td className="p-3 max-w-[260px]">
                    <div className="font-medium text-gray-900">{r.title}</div>
                    <div className="text-xs text-gray-400 line-clamp-2">
                      {r.description}
                    </div>
                  </td>
                  <td className="p-3 text-xs space-y-1">
                    {r.referenceUrl && (
                      <a
                        href={r.referenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#2563EB] block truncate max-w-[180px]"
                      >
                        Tham khảo ↗
                      </a>
                    )}
                    <Input
                      size="small"
                      placeholder="Dán link kết quả..."
                      defaultValue={r.resultUrl}
                      onBlur={(e) =>
                        e.target.value !== r.resultUrl &&
                        update.mutate({ id: r.id, resultUrl: e.target.value })
                      }
                    />
                  </td>
                  <td className="p-3">
                    <Select
                      size="small"
                      className="w-[140px]"
                      value={r.status}
                      onChange={(v) => update.mutate({ id: r.id, status: v })}
                      options={Object.entries(REQ_STATUS).map(([k, v]) => ({
                        value: k,
                        label: v.label,
                      }))}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <Popconfirm
                      title="Xóa đơn thiết kế này?"
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => remove.mutate(r.id)}
                    >
                      <button className="text-red-500 bg-transparent border-0 cursor-pointer">
                        Xóa
                      </button>
                    </Popconfirm>
                  </td>
                </tr>
              );
            })}
            {!requests.length && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-gray-400">
                  Chưa có đơn thiết kế nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        title="Tạo đơn thiết kế"
        okText="Tạo"
        cancelText="Hủy"
        confirmLoading={add.isLoading}
        onOk={save}
        onCancel={() => setOpen(false)}
      >
        <div className="space-y-3 pt-2">
          <Select
            className="w-full"
            placeholder="Chọn seller"
            value={sellerId || undefined}
            onChange={setSellerId}
            options={sellers
              .filter((s) => s.permission !== "Admin")
              .map((s) => ({ value: s.id, label: s.name || s.email }))}
          />
          <Input
            placeholder="Tiêu đề (VD: Design áo Soccer Mexico)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input.TextArea
            rows={3}
            placeholder="Mô tả yêu cầu..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            placeholder="Link ảnh tham khảo (tùy chọn)"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
