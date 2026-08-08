import {
  Button,
  Checkbox,
  Empty,
  Image,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Progress,
  Tag,
  message,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import {
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiTrash2,
  FiXCircle,
} from "react-icons/fi";
import { useImportQueue, useImportQueueMutations } from "../../hooks/useAdmin";
import { useAdminUser } from "../../hooks/useAdminAuth";
import { imageUrlCandidates } from "../../lib/imageUrl";
import { ImportBatch, OrderItem } from "../../models/admin";

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Chờ duyệt", color: "#6B46C1", bg: "#F3EBFF" },
  approved: { label: "Đã duyệt", color: "#15803D", bg: "#E8F7EC" },
  rejected: { label: "Bị từ chối", color: "#B91C1C", bg: "#FDECEC" },
};

/** Tên màu phôi -> màu CSS để hiện chấm màu cho dễ nhìn. */
const NAMED_COLORS: Record<string, string> = {
  black: "#111827",
  white: "#ffffff",
  "dark heather": "#4A4A48",
  heather: "#9ca3af",
  "sport grey": "#C0C3C7",
  "sport gray": "#C0C3C7",
  "ash grey": "#E5E4E2",
  maroon: "#6E1F2E",
  royal: "#1D4ED8",
  navy: "#1E2A4A",
  "true navy": "#1E2A4A",
  red: "#C62828",
  "irish green": "#00966E",
  "forest green": "#1F4A2E",
  sand: "#DCD0BA",
  natural: "#EDE6D6",
  pepper: "#5A5A54",
  purple: "#5B2D8E",
  orange: "#E5731C",
  gold: "#EAAA00",
  "light blue": "#A3C7E8",
  "light pink": "#F2C4D0",
  charcoal: "#3C3C3C",
};
function colorToCss(name?: string): string | undefined {
  if (!name) return undefined;
  // Màu Etsy hay ghi "Navy/True Navy" -> lấy vế đầu
  const k = name.split("/")[0].trim().toLowerCase();
  if (NAMED_COLORS[k]) return NAMED_COLORS[k];
  if (typeof CSS !== "undefined" && CSS.supports?.("color", k)) return k;
  return undefined;
}

/** Ảnh có fallback qua nhiều URL + xem lớn khi bấm (giống client). */
function Thumb({
  url,
  tag,
  small,
  bg,
}: {
  url?: string;
  tag: string;
  small?: boolean;
  bg?: string;
}) {
  const [idx, setIdx] = useState(0);
  const candidates = url ? imageUrlCandidates(url) : [];
  const size = small ? "w-[34px] h-[34px]" : "w-[52px] h-[52px]";
  const bgStyle = bg ? { background: bg, borderColor: bg } : undefined;
  if (!url || idx >= candidates.length) {
    return (
      <div
        style={bgStyle}
        className={`${size} ${
          bg ? "p-[3px]" : ""
        } shrink-0 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center text-[7px] font-bold tracking-wider ${
          bg ? "text-white/80" : "text-gray-300"
        }`}
      >
        {small ? "—" : tag}
      </div>
    );
  }
  return (
    <div
      style={bgStyle}
      className={`${size} ${
        bg ? "p-[3px]" : ""
      } shrink-0 rounded-md bg-gray-50 border border-gray-200 overflow-hidden`}
    >
      <Image
        src={candidates[idx]}
        alt={tag}
        rootClassName="w-full h-full"
        className="object-contain rounded-[3px]"
        onError={() => setIdx((i) => i + 1)}
        preview={{ mask: false }}
      />
    </div>
  );
}

/** 1 hàng thiết kế chỉ đọc: thumbnail + nhãn + link (giống client, bỏ nút upload). */
function ThumbLink({
  label,
  color,
  value,
  bg,
}: {
  label: string;
  color: string;
  value?: string;
  bg?: string;
}) {
  return (
    <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-1.5 bg-white">
      <Thumb url={value} tag={label} small bg={bg} />
      <div className="flex-1 min-w-0">
        <div
          className="text-[9px] font-bold tracking-wider leading-none mb-0.5"
          style={{ color }}
        >
          {label}
        </div>
        <div className="text-[11px] text-gray-500 truncate" title={value || ""}>
          {value || "—"}
        </div>
      </div>
    </div>
  );
}

/** Thẻ sản phẩm chỉ đọc — sao chép bố cục OrderItemEditor của client. */
function ItemCard({ it }: { it: OrderItem }) {
  const itemBg = colorToCss(it.color);
  const orig = [
    (it.origType ?? it.productSku) && `Type: ${it.origType ?? it.productSku}`,
    (it.origColor ?? it.color) && `Color: ${it.origColor ?? it.color}`,
    (it.origSize ?? it.size) && `Size: ${it.origSize ?? it.size}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex gap-4 items-start bg-white border border-gray-200 rounded-xl p-3 min-w-[560px]">
      {/* Cột trái: SKU + thiết kế */}
      <div className="w-[200px] shrink-0 space-y-2 border-r border-gray-100 pr-4">
        <div className="h-8 flex items-center px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700">
          {it.sku || <span className="text-gray-300">Chưa có SKU</span>}
        </div>
        <div className="space-y-1.5">
          <ThumbLink label="FRONT" color="#3B82F6" bg={itemBg} value={it.frontUrl} />
          <ThumbLink label="BACK" color="#8B5CF6" bg={itemBg} value={it.backUrl} />
          <ThumbLink label="MOCKUP" color="#059669" bg={itemBg} value={it.mockupUrl} />
        </div>
      </div>

      {/* Cột phải: phôi + biến thể */}
      <div className="flex-1 min-w-0 space-y-2">
        {orig && (
          <div className="flex items-center gap-2 bg-[#FFF9E6] border border-[#F3E2A9] text-[#B7791F] rounded-lg px-3 py-1.5 text-xs font-bold">
            <span className="shrink-0">ⓘ</span>
            <span className="truncate" title={orig}>
              {orig}
            </span>
          </div>
        )}
        <div className="h-8 flex items-center px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-[#171826]">
          {it.productSku || it.productName || (
            <span className="text-gray-300 font-normal">Chưa chọn phôi</span>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0 h-8 flex items-center gap-1.5 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700">
            <span
              className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0"
              style={{ background: itemBg || "#e5e7eb" }}
            />
            <span className="truncate">
              {it.color || <span className="text-gray-300">Màu</span>}
            </span>
          </div>
          <div className="flex-1 min-w-0 h-8 flex items-center px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700">
            {it.size || <span className="text-gray-300">Size</span>}
          </div>
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 bg-gray-50 shrink-0">
            <span className="text-[10px] font-bold text-gray-400">SL</span>
            <span className="text-sm font-semibold text-gray-700 w-[32px] text-center">
              {it.quantity}
            </span>
          </div>
        </div>
        {it.personalization && (
          <div className="w-full box-border border border-[#D6E4FF] bg-[#EFF4FF] rounded-lg px-3 py-2 text-xs text-[#2563EB]">
            ✍ {it.personalization}
          </div>
        )}
        {it.note && (
          <div className="w-full box-border border border-[#F3E2A9] bg-[#FFFDF5] rounded-lg px-3 py-2 text-xs text-gray-600">
            🖊 {it.note}
          </div>
        )}
      </div>
    </div>
  );
}

const TABS: { key: string; label: string }[] = [
  { key: "pending", label: "Chờ duyệt" },
  { key: "approved", label: "Đã duyệt" },
  { key: "rejected", label: "Bị từ chối" },
  { key: "all", label: "Tất cả" },
];

export default function ImportQueue() {
  const admin = useAdminUser();
  const { batches, isLoading } = useImportQueue();
  const { approve, reject, remove, removeMany } = useImportQueueMutations();
  const [tab, setTab] = useState("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Phân trang danh sách lô
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize, setBatchPageSize] = useState(10);
  // Phân trang danh sách đơn trong lô đang mở
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(10);

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    batches.forEach((b) => {
      c[b.status] = (c[b.status] || 0) + 1;
    });
    return c;
  }, [batches]);

  const rows = useMemo(
    () => (tab === "all" ? batches : batches.filter((b) => b.status === tab)),
    [batches, tab]
  );

  // Đổi tab -> reset trang + bỏ chọn
  useEffect(() => {
    setBatchPage(1);
    setSelectedIds([]);
  }, [tab]);
  // Mở lô khác -> quay về trang đơn đầu tiên
  useEffect(() => {
    setOrderPage(1);
  }, [expanded]);

  const pagedRows = useMemo(
    () => rows.slice((batchPage - 1) * batchPageSize, batchPage * batchPageSize),
    [rows, batchPage, batchPageSize]
  );

  const pageIds = pagedRows.map((b) => b.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const toggleSelectPage = (checked: boolean) =>
    setSelectedIds((prev) =>
      checked
        ? Array.from(new Set([...prev, ...pageIds]))
        : prev.filter((id) => !pageIds.includes(id))
    );
  const toggleSelectOne = (id: string, checked: boolean) =>
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id)
    );

  const deleteSelected = async () => {
    const n = selectedIds.length;
    if (!n) return;
    await removeMany.mutateAsync(selectedIds);
    setSelectedIds([]);
    message.success(`Đã xóa ${n} lô khỏi hàng đợi`);
  };

  const reviewer = admin?.name || admin?.email || "admin";

  const doApprove = async (batch: ImportBatch) => {
    setProgress({ done: 0, total: batch.count });
    try {
      const res = await approve.mutateAsync({
        batch,
        reviewedBy: reviewer,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const ok = (res?.total || batch.count) - (res?.failed || 0);
      if (res?.failed) {
        message.warning(
          `Đã duyệt "${batch.fileName || "PDF"}" — lên hệ thống ${ok}/${res.total} đơn, ${res.failed} đơn lỗi dữ liệu bị bỏ qua`
        );
      } else {
        message.success(
          `Đã duyệt lô "${batch.fileName || "PDF"}" — ${batch.count} đơn đã lên hệ thống`
        );
      }
    } catch (e) {
      message.error("Duyệt lô thất bại. Vui lòng thử lại.");
    } finally {
      setProgress(null);
    }
  };

  const doReject = async () => {
    if (!rejectId) return;
    await reject.mutateAsync({
      id: rejectId,
      reason: rejectReason.trim(),
      reviewedBy: reviewer,
    });
    message.success("Đã từ chối lô đơn");
    setRejectId(null);
    setRejectReason("");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#171826]">Hàng đợi import PDF</h1>
        <p className="text-gray-400 text-sm mt-1">
          Seller upload packing slip PDF sẽ vào đây. Duyệt cả lô thì các đơn mới
          được đồng bộ lên hệ thống.
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 inline-flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm cursor-pointer border-0 ${
              tab === t.key
                ? "bg-[#171826] text-white font-bold"
                : "bg-transparent text-gray-500"
            }`}
          >
            {t.label}
            {t.key !== "all" && counts[t.key] ? ` (${counts[t.key]})` : ""}
          </button>
        ))}
      </div>

      {progress && (
        <div className="bg-[#F3EBFF] border border-[#E4D4FF] rounded-2xl px-5 py-4">
          <div className="font-bold text-[#6B46C1] mb-2">
            Đang đồng bộ {progress.done}/{progress.total} đơn lên hệ thống...
          </div>
          <Progress
            percent={Math.round((progress.done / Math.max(progress.total, 1)) * 100)}
            showInfo={false}
            strokeColor="#6B46C1"
            status="active"
          />
        </div>
      )}

      {/* Thanh chọn hàng loạt */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <Checkbox
            checked={allPageSelected}
            indeterminate={
              !allPageSelected && pageIds.some((id) => selectedIds.includes(id))
            }
            onChange={(e) => toggleSelectPage(e.target.checked)}
          >
            Chọn tất cả trang này
          </Checkbox>
          <button
            onClick={() =>
              setSelectedIds(
                selectedIds.length === rows.length ? [] : rows.map((b) => b.id)
              )
            }
            className="text-sm text-[#2563EB] border-0 bg-transparent cursor-pointer"
          >
            {selectedIds.length === rows.length
              ? "Bỏ chọn tất cả"
              : `Chọn tất cả ${rows.length} lô`}
          </button>
          {selectedIds.length > 0 && (
            <Popconfirm
              title={`Xóa ${selectedIds.length} lô đã chọn khỏi hàng đợi?`}
              description="Không thể hoàn tác. Đơn đã duyệt trước đó vẫn giữ trên hệ thống."
              okText="Xóa"
              okButtonProps={{ danger: true }}
              cancelText="Hủy"
              onConfirm={deleteSelected}
            >
              <Button
                danger
                size="small"
                loading={removeMany.isLoading}
                icon={<FiTrash2 />}
                className="ml-auto rounded-lg font-bold"
              >
                Xóa đã chọn ({selectedIds.length})
              </Button>
            </Popconfirm>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400 py-10 text-center">Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16">
          <Empty description="Không có lô đơn nào" />
        </div>
      ) : (
        <div className="space-y-3">
          {pagedRows.map((b) => {
            const st = STATUS[b.status] || STATUS.pending;
            const open = expanded === b.id;
            return (
              <div
                key={b.id}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
              >
                <div className="flex items-center gap-3 flex-wrap p-4">
                  <Checkbox
                    checked={selectedIds.includes(b.id)}
                    onChange={(e) => toggleSelectOne(b.id, e.target.checked)}
                  />
                  <button
                    onClick={() => setExpanded(open ? null : b.id)}
                    className="border-0 bg-transparent cursor-pointer text-gray-400 flex items-center"
                  >
                    {open ? <FiChevronDown /> : <FiChevronRight />}
                  </button>
                  <span
                    className="text-[10px] font-bold tracking-wider px-2 py-1 rounded whitespace-nowrap"
                    style={{ color: st.color, background: st.bg }}
                  >
                    {st.label.toUpperCase()}
                  </span>
                  <span className="font-bold text-[#171826]">
                    {b.fileName || "PDF"}
                  </span>
                  <Tag color="gold">{b.count} đơn</Tag>
                  <span className="text-sm text-gray-500">
                    {b.sellerName || b.userId} · {b.storeName || "—"}
                  </span>
                  <span className="text-xs text-gray-300 ml-auto">
                    {b.created ? dayjs(b.created).format("DD/MM/YYYY HH:mm") : ""}
                  </span>

                  {b.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <Popconfirm
                        title={`Duyệt lô ${b.count} đơn và đồng bộ lên hệ thống?`}
                        okText="Duyệt"
                        cancelText="Hủy"
                        onConfirm={() => doApprove(b)}
                      >
                        <Button
                          type="primary"
                          loading={approve.isLoading}
                          className="rounded-lg font-bold border-0 bg-[#15803D]"
                          icon={<FiCheckCircle />}
                        >
                          Duyệt lô
                        </Button>
                      </Popconfirm>
                      <Button
                        danger
                        onClick={() => setRejectId(b.id)}
                        className="rounded-lg font-bold"
                        icon={<FiXCircle />}
                      >
                        Từ chối
                      </Button>
                    </div>
                  )}
                  {b.status === "rejected" && b.rejectedReason && (
                    <span className="text-sm text-red-500">
                      Lý do: {b.rejectedReason}
                    </span>
                  )}
                </div>

                {open && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-left text-[11px] font-bold tracking-wider text-gray-400">
                          <th className="p-3">MÃ ĐƠN</th>
                          <th className="p-3">NGÀY LÊN ĐƠN</th>
                          <th className="p-3">KHÁCH HÀNG</th>
                          <th className="p-3">CHI TIẾT SẢN PHẨM</th>
                          <th className="p-3">GIÁ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(b.orders || [])
                          .slice(
                            (orderPage - 1) * orderPageSize,
                            orderPage * orderPageSize
                          )
                          .map((o, i) => {
                          const d = o.data || {};
                          const items = (d.items || []) as OrderItem[];
                          return (
                            <tr key={o.id || i} className="border-b border-gray-100">
                              <td className="p-3 align-top font-bold whitespace-nowrap">
                                {d.orderCode}
                              </td>
                              <td className="p-3 align-top whitespace-nowrap text-gray-600">
                                {d.created
                                  ? dayjs(d.created).format("DD/MM/YYYY")
                                  : "—"}
                              </td>
                              <td className="p-3 align-top min-w-[160px]">
                                <div className="font-bold text-[#171826]">
                                  {d.customerName}
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5">
                                  {[d.city, d.state, d.zip]
                                    .filter(Boolean)
                                    .join(", ")}
                                </div>
                              </td>
                              <td className="p-3 align-top">
                                <div className="space-y-2">
                                  {items.map((it, k) => (
                                    <ItemCard key={k} it={it} />
                                  ))}
                                </div>
                              </td>
                              <td className="p-3 align-top font-bold whitespace-nowrap">
                                ${Number(d.total ?? 0).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {(b.orders || []).length > orderPageSize && (
                      <div className="flex justify-end pt-3">
                        <Pagination
                          size="small"
                          current={orderPage}
                          pageSize={orderPageSize}
                          total={(b.orders || []).length}
                          showSizeChanger
                          pageSizeOptions={[10, 20, 50, 100]}
                          showTotal={(t) => `${t} đơn`}
                          onChange={(p, ps) => {
                            setOrderPage(ps !== orderPageSize ? 1 : p);
                            setOrderPageSize(ps);
                          }}
                        />
                      </div>
                    )}

                    <Popconfirm
                      title="Xóa lô này khỏi hàng đợi?"
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => remove.mutate(b.id)}
                    >
                      <button className="mt-3 text-xs text-gray-400 hover:text-red-500 border-0 bg-transparent cursor-pointer">
                        Xóa lô khỏi hàng đợi
                      </button>
                    </Popconfirm>
                  </div>
                )}
              </div>
            );
          })}

          {rows.length > batchPageSize && (
            <div className="flex justify-end pt-2">
              <Pagination
                current={batchPage}
                pageSize={batchPageSize}
                total={rows.length}
                showSizeChanger
                pageSizeOptions={[10, 20, 50]}
                showTotal={(t) => `${t} lô`}
                onChange={(p, ps) => {
                  setBatchPage(ps !== batchPageSize ? 1 : p);
                  setBatchPageSize(ps);
                }}
              />
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!rejectId}
        title="Từ chối lô đơn"
        onCancel={() => setRejectId(null)}
        onOk={doReject}
        okText="Từ chối"
        okButtonProps={{ danger: true }}
        cancelText="Hủy"
        confirmLoading={reject.isLoading}
      >
        <p className="text-gray-500 mb-2">
          Lô đơn sẽ không được đồng bộ. Seller sẽ thấy lý do từ chối.
        </p>
        <Input.TextArea
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Lý do từ chối (không bắt buộc)"
        />
      </Modal>
    </div>
  );
}
