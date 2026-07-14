import {
  Button,
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Popover,
  Select,
  Tooltip,
  message,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiDownload,
  FiEdit3,
  FiEye,
  FiMaximize2,
  FiMinimize2,
  FiRefreshCw,
  FiTrash2,
  FiTruck,
  FiUpload,
} from "react-icons/fi";
import {
  useOrderMutations,
  useOrders,
  useSellerMutations,
  useSellers,
  useStoreMutations,
  useStores,
} from "../../hooks/useAdmin";
import { ORDER_STATUS, PodOrder, Seller } from "../../models/admin";
import { downloadCSV, parseCSV, toCSV } from "../../lib/csvPod";
import { toDirectImageUrl } from "../../lib/imageUrl";

const STATUS_TABS = [
  { key: "pending_approval", label: "Đơn chờ duyệt" },
  { key: "in_production", label: "Đang sản xuất" },
  { key: "shipping", label: "Đang giao hàng" },
  { key: "completed", label: "Hoàn thành" },
  { key: "support", label: "Yêu cầu Hỗ trợ" },
  { key: "reship", label: "Đơn Reship (RS)" },
  { key: "all", label: "Tất cả đơn" },
];

function money(n: number) {
  return `$${(n || 0).toFixed(2)}`;
}

export default function Sellers() {
  const { sellers } = useSellers();
  const { stores } = useStores();
  const { orders } = useOrders();
  const sellerMut = useSellerMutations();
  const storeMut = useStoreMutations();
  const orderMut = useOrderMutations();

  const [statusTab, setStatusTab] = useState("all");
  const [filterSeller, setFilterSeller] = useState<string>("");
  const [filterShop, setFilterShop] = useState<string>("");
  const [searchCode, setSearchCode] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tableFull, setTableFull] = useState(false);
  const [detail, setDetail] = useState<PodOrder | null>(null);
  const [sellerDetail, setSellerDetail] = useState<Seller | null>(null);
  const [sellerEdit, setSellerEdit] = useState<Seller | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    markup: 0,
    perOrderFee: 0,
    discount: 0,
  });
  const trackingRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 50;

  const realSellers = sellers.filter((s) => s.permission !== "Admin");

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusTab !== "all" && o.status !== statusTab) return false;
      if (filterSeller && o.userId !== filterSeller) return false;
      if (filterShop && o.storeId !== filterShop) return false;
      if (
        searchCode &&
        !o.orderCode?.toLowerCase().includes(searchCode.toLowerCase())
      )
        return false;
      if (fromDate && dayjs(o.created).isBefore(dayjs(fromDate), "day"))
        return false;
      if (toDate && dayjs(o.created).isAfter(dayjs(toDate), "day"))
        return false;
      return true;
    });
  }, [orders, statusTab, filterSeller, filterShop, searchCode, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Chọn nhiều đơn
  const pageIds = paged.map((o) => o.id);
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
  // Bỏ chọn đơn không còn trong danh sách sau khi lọc lại
  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => orders.some((o) => o.id === id))
    );
  }, [orders]);

  // Sửa nhanh 1 khoản phí ngay trong danh sách (không mở modal)
  const saveFeeInline = async (
    id: string,
    field: "markup" | "perOrderFee" | "discount",
    value: number
  ) => {
    await sellerMut.update.mutateAsync({ id, [field]: value || 0 });
    message.success("Đã cập nhật phí");
  };

  const openSellerEdit = (seller: Seller) => {
    setSellerEdit(seller);
    setEditForm({
      name: seller.name || "",
      email: seller.email || "",
      phone: seller.phone || "",
      markup: seller.markup || 0,
      perOrderFee: seller.perOrderFee || 0,
      discount: seller.discount || 0,
    });
  };

  const saveSellerEdit = async () => {
    if (!sellerEdit) return;
    await sellerMut.update.mutateAsync({
      id: sellerEdit.id,
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      phone: editForm.phone.trim(),
      markup: editForm.markup || 0,
      perOrderFee: editForm.perOrderFee || 0,
      discount: editForm.discount || 0,
    });
    message.success("Đã cập nhật thông tin seller");
    setSellerEdit(null);
  };

  const exportOrders = (list: PodOrder[], filename: string) => {
    downloadCSV(
      filename,
      toCSV(
        ["Order ID", "Status", "Shop", "Customer", "Date", "Paid", "Tracking", "Total"],
        list.map((o) => [
          o.orderCode,
          ORDER_STATUS[o.status]?.label || o.status,
          o.storeName || "",
          o.customerName || "",
          dayjs(o.created).format("DD/MM/YYYY"),
          o.datePaid ? dayjs(o.datePaid).format("DD/MM/YYYY") : "Chưa thanh toán",
          o.tracking || "",
          (o.total || 0).toFixed(2),
        ])
      )
    );
  };
  const handleExport = () => exportOrders(filtered, "admin-orders.csv");

  const selectedOrders = () =>
    filtered.filter((o) => selectedIds.includes(o.id));
  const handleBulkDelete = async () => {
    await orderMut.removeMany.mutateAsync(selectedIds);
    message.success(`Đã xóa vĩnh viễn ${selectedIds.length} đơn`);
    setSelectedIds([]);
  };
  const handleExportSelected = () =>
    exportOrders(selectedOrders(), "selected-orders.csv");
  const handleAssignPrinter = () => {
    // TODO: chưa có model Nhà In để phân bổ
    message.info(
      `Phân bổ ${selectedIds.length} đơn cho Nhà In — tính năng đang phát triển`
    );
  };

  // Import tracking: CSV cột "Order ID" + "Tracking"
  const handleImportTracking = async (file: File) => {
    const rows = parseCSV(await file.text());
    let count = 0;
    for (const r of rows) {
      const code = r["Order ID"] || r["orderCode"] || r["Mã đơn"];
      const tracking = r["Tracking"] || r["tracking"];
      if (!code || !tracking) continue;
      const order = orders.find((o) => o.orderCode === String(code).trim());
      if (!order) continue;
      await orderMut.update.mutateAsync({
        id: order.id,
        tracking: String(tracking).trim(),
        status: "shipping",
      });
      count++;
    }
    message.success(`Đã cập nhật tracking cho ${count} đơn (chuyển Đang giao hàng)`);
  };

  const approve = async (o: PodOrder, status: string) => {
    await orderMut.update.mutateAsync({ id: o.id, status });
    message.success(
      `Đơn ${o.orderCode} → ${ORDER_STATUS[status]?.label || status}`
    );
  };

  const saveTracking = async (o: PodOrder, tracking: string) => {
    await orderMut.update.mutateAsync({ id: o.id, tracking });
    message.success(
      tracking
        ? `Đã lưu tracking cho đơn ${o.orderCode}`
        : `Đã xóa tracking đơn ${o.orderCode}`
    );
  };

  const savePrintHouse = async (o: PodOrder, printHouse: string) => {
    await orderMut.update.mutateAsync({ id: o.id, printHouse } as any);
    message.success(`Đã cập nhật Nhà In cho đơn ${o.orderCode}`);
  };

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 m-0">
            Trung tâm điều hành POD
          </h1>
          <p className="text-gray-500 text-sm mt-1 mb-0">
            Quản lý đối tác và phê duyệt đơn hàng trước khi sản xuất.
          </p>
        </div>
        <Button
          type="primary"
          icon={<FiUpload />}
          className="bg-[#171826] h-[40px] rounded-lg font-medium"
          onClick={() => trackingRef.current?.click()}
        >
          Import Tracking (CSV)
        </Button>
        <input
          ref={trackingRef}
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportTracking(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* Bộ lọc */}
      <div className="border border-gray-200 rounded-xl p-4 mt-5 flex items-end gap-3 flex-wrap bg-white">
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            LỌC THEO SELLER
          </div>
          <Select
            className="w-[170px]"
            value={filterSeller || undefined}
            placeholder="Tất cả Seller"
            allowClear
            onChange={(v) => setFilterSeller(v || "")}
            options={realSellers.map((s) => ({
              value: s.id,
              label: s.name || s.email,
            }))}
          />
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            LỌC THEO SHOP
          </div>
          <Select
            className="w-[170px]"
            value={filterShop || undefined}
            placeholder="Tất cả Shop"
            allowClear
            showSearch
            onChange={(v) => setFilterShop(v || "")}
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
            filterOption={(input, opt) =>
              String(opt?.label || "")
                .toLowerCase()
                .includes(input.toLowerCase())
            }
          />
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            MÃ ĐƠN HÀNG (ID)
          </div>
          <Input
            className="w-[160px]"
            placeholder="Tìm mã đơn..."
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            allowClear
          />
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            KHOẢNG NGÀY
          </div>
          <DatePicker.RangePicker
            format="DD/MM/YYYY"
            allowEmpty={[true, true]}
            placeholder={["Từ ngày", "Đến ngày"]}
            value={[
              fromDate ? dayjs(fromDate) : null,
              toDate ? dayjs(toDate) : null,
            ]}
            onChange={(range) => {
              setFromDate(range?.[0] ? range[0].format("YYYY-MM-DD") : "");
              setToDate(range?.[1] ? range[1].format("YYYY-MM-DD") : "");
            }}
          />
        </div>
        <Button
          icon={<FiRefreshCw />}
          onClick={() => {
            setFilterSeller("");
            setFilterShop("");
            setSearchCode("");
            setFromDate("");
            setToDate("");
            setStatusTab("all");
            setPage(1);
          }}
        >
          Làm mới
        </Button>
        <Button icon={<FiDownload />} onClick={handleExport}>
          Xuất CSV (Kết quả lọc)
        </Button>
      </div>

      <div className="flex gap-6 mt-6 items-start flex-wrap lg:flex-nowrap">
        {/* Danh sách seller */}
        <div className="w-full lg:w-[300px] shrink-0">
          <div className="text-[11px] tracking-widest text-gray-500 font-semibold mb-3">
            DANH SÁCH SELLER - NEWEST
          </div>
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {realSellers.map((seller) => {
              const sellerStores = stores.filter(
                (st) => st.userId === seller.id
              );
              return (
                <div
                  key={seller.id}
                  className="border border-gray-200 rounded-lg bg-white px-3 py-2.5 hover:border-gray-300"
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSellerDetail(seller)}
                      className="w-8 h-8 shrink-0 rounded-full bg-[#171826] text-white text-xs font-bold flex items-center justify-center cursor-pointer border-0"
                    >
                      {(seller.name || seller.email || "A")
                        .charAt(0)
                        .toUpperCase()}
                    </button>
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => setSellerDetail(seller)}
                    >
                      <div className="font-semibold text-gray-900 text-[13px] truncate hover:text-[#2563EB]">
                        {seller.name || seller.email}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {seller.email || "—"} · {sellerStores.length} shop
                      </div>
                    </div>
                    <Tooltip title="Xem chi tiết">
                      <button
                        onClick={() => setSellerDetail(seller)}
                        className="w-7 h-7 shrink-0 rounded-md border border-gray-200 bg-white text-gray-500 inline-flex items-center justify-center cursor-pointer hover:bg-gray-100"
                      >
                        <FiEye size={13} />
                      </button>
                    </Tooltip>
                    <Tooltip title="Sửa thông tin seller">
                      <button
                        onClick={() => openSellerEdit(seller)}
                        className="w-7 h-7 shrink-0 rounded-md border border-[#D6E4FF] bg-[#EFF4FF] text-[#2563EB] inline-flex items-center justify-center cursor-pointer hover:bg-[#2563EB] hover:text-white"
                      >
                        <FiEdit3 size={13} />
                      </button>
                    </Tooltip>
                    <Popconfirm
                      title={`Xóa seller "${seller.name || seller.email}"?`}
                      description={
                        sellerStores.length
                          ? `Seller đang có ${sellerStores.length} shop. Xóa seller không tự xóa shop/đơn. Không thể hoàn tác.`
                          : "Hành động này không thể hoàn tác."
                      }
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={async () => {
                        await sellerMut.remove.mutateAsync(seller.id);
                        message.success(
                          `Đã xóa seller ${seller.name || seller.email}`
                        );
                      }}
                    >
                      <Tooltip title="Xóa seller">
                        <button className="w-7 h-7 shrink-0 rounded-md border border-red-100 bg-red-50 text-red-500 inline-flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white">
                          <FiTrash2 size={13} />
                        </button>
                      </Tooltip>
                    </Popconfirm>
                  </div>

                  {/* Sửa nhanh phí ngay tại chỗ */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {(
                      [
                        {
                          field: "markup",
                          label: "Markup",
                          full: "phí in thêm (Markup)",
                          box: "bg-emerald-50 border-emerald-200",
                          text: "text-emerald-600",
                        },
                        {
                          field: "perOrderFee",
                          label: "Đơn",
                          full: "phí xử lý đơn",
                          box: "bg-orange-50 border-orange-200",
                          text: "text-orange-600",
                        },
                        {
                          field: "discount",
                          label: "Ưu đãi",
                          full: "ưu đãi",
                          box: "bg-violet-50 border-violet-200",
                          text: "text-violet-600",
                        },
                      ] as const
                    ).map(({ field, label, full, box, text }) => (
                      <Tooltip key={field} title={`Sửa ${full}`}>
                        <div
                          className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${box}`}
                        >
                          <span className={`text-[10px] font-semibold ${text}`}>
                            {label}
                          </span>
                          <InputNumber
                            size="small"
                            min={0}
                            step={0.1}
                            prefix="$"
                            bordered={false}
                            className={`w-[62px] text-[12px] font-bold ${text}`}
                            defaultValue={(seller as any)[field] || 0}
                            onBlur={(e) => {
                              const v =
                                parseFloat(
                                  (e.target as HTMLInputElement).value.replace(
                                    "$",
                                    ""
                                  )
                                ) || 0;
                              if (v !== ((seller as any)[field] || 0))
                                saveFeeInline(seller.id, field, v);
                            }}
                          />
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              );
            })}
            {!realSellers.length && (
              <div className="text-xs text-gray-400 italic">
                Chưa có seller nào.
              </div>
            )}
          </div>
        </div>

        {/* Bảng đơn */}
        <div
          className={
            tableFull
              ? "fixed inset-0 z-40 bg-white p-5 overflow-auto"
              : "flex-1 min-w-0"
          }
        >
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <button
              onClick={() => setTableFull((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] cursor-pointer border-0 bg-[#171826] text-white font-medium"
            >
              {tableFull ? (
                <FiMinimize2 size={14} />
              ) : (
                <FiMaximize2 size={14} />
              )}
              {tableFull ? "Thu nhỏ Bảng" : "Phóng to Bảng"}
            </button>
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setStatusTab(t.key);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-[13px] cursor-pointer border ${
                  statusTab === t.key
                    ? "bg-[#171826] text-white border-[#171826] font-medium"
                    : t.key === "support"
                    ? "bg-white text-orange-500 border-orange-200"
                    : t.key === "reship"
                    ? "bg-white text-red-500 border-red-200"
                    : "bg-white text-gray-600 border-gray-200"
                }`}
              >
                {t.label}
              </button>
            ))}
            <span className="ml-auto text-xs bg-gray-100 rounded-full px-3 py-1 text-gray-600 font-medium">
              {filtered.length} Đơn hàng
            </span>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white">
            <table className="w-full text-[13px] border-collapse min-w-[900px]">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
                  <th className="p-3 font-medium w-10">
                    <Checkbox
                      checked={allPageSelected}
                      indeterminate={!allPageSelected && somePageSelected}
                      onChange={(e) => togglePage(e.target.checked)}
                    />
                  </th>
                  <th className="p-3 font-medium">Mã Đơn / Trạng thái</th>
                  <th className="p-3 font-medium">Shop & Khách</th>
                  <th className="p-3 font-medium">Ngày Lên Đơn</th>
                  <th className="p-3 font-medium">Ngày Thanh Toán</th>
                  <th className="p-3 font-medium">Phôi Fulfill</th>
                  <th className="p-3 font-medium">Thiết kế</th>
                  <th className="p-3 font-medium">Nhà In</th>
                  <th className="p-3 font-medium">Tracking</th>
                  <th className="p-3 font-medium text-right">Giá</th>
                  <th className="p-3 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((o) => {
                  const st = ORDER_STATUS[o.status];
                  const firstSku = o.items?.[0]?.productSku;
                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-gray-50 align-top ${
                        selectedIds.includes(o.id) ? "bg-[#EFF4FF]" : ""
                      }`}
                    >
                      <td className="p-3">
                        <Checkbox
                          checked={selectedIds.includes(o.id)}
                          onChange={(e) => toggleOne(o.id, e.target.checked)}
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-gray-900">
                          {o.orderCode}
                        </div>
                        <span
                          className="inline-block text-[10px] font-bold rounded px-1.5 py-0.5 mt-1"
                          style={{
                            color: st?.color || "#666",
                            background: st?.bg || "#eee",
                          }}
                        >
                          {st?.label || o.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-medium">
                          Shop: {o.storeName || "—"}
                        </div>
                        <div className="text-gray-400 text-xs">
                          Khách: {o.customerName}
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {dayjs(o.created).format("DD/MM/YYYY")}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {o.datePaid ? (
                          dayjs(o.datePaid).format("DD/MM/YYYY")
                        ) : o.status === "pending_payment" ? (
                          <span className="text-gray-400 italic">
                            Chưa thanh toán
                          </span>
                        ) : (
                          <span className="text-emerald-600">Đã thanh toán</span>
                        )}
                      </td>
                      <td className="p-3">
                        {firstSku ? (
                          <span className="bg-[#EFF4FF] text-[#2563EB] text-[11px] font-medium rounded px-2 py-0.5">
                            {firstSku}
                            {o.items.length > 1 &&
                              ` (+${o.items.length - 1} món khác)`}
                          </span>
                        ) : (
                          <span className="bg-[#EFF4FF] text-[#2563EB] text-[11px] font-medium rounded px-2 py-0.5">
                            Unknown Product
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {(() => {
                          const it = o.items?.[0];
                          const img =
                            it?.mockupUrl || it?.frontUrl || it?.backUrl;
                          if (!img)
                            return (
                              <span className="text-gray-300 text-xs italic">
                                —
                              </span>
                            );
                          return (
                            <Popover
                              placement="right"
                              content={
                                <div className="w-[260px] h-[260px] flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
                                  <img
                                    src={toDirectImageUrl(img)}
                                    alt="design"
                                    referrerPolicy="no-referrer"
                                    className="max-w-full max-h-full object-contain"
                                  />
                                </div>
                              }
                            >
                              <img
                                src={toDirectImageUrl(img)}
                                alt="design"
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-md object-cover border border-gray-200 bg-gray-50 cursor-zoom-in"
                              />
                            </Popover>
                          );
                        })()}
                      </td>
                      <td className="p-3">
                        <Input
                          key={o.printHouse || ""}
                          size="small"
                          placeholder="Nhà in..."
                          defaultValue={o.printHouse || ""}
                          className="w-[120px]"
                          onPressEnter={(e) =>
                            (e.target as HTMLInputElement).blur()
                          }
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (o.printHouse || "")) savePrintHouse(o, v);
                          }}
                        />
                      </td>
                      <td className="p-3">
                        {o.status === "shipping" ? (
                          <Input
                            key={o.tracking || ""}
                            size="small"
                            placeholder="Nhập mã tracking..."
                            defaultValue={o.tracking || ""}
                            className="w-[150px]"
                            onPressEnter={(e) =>
                              (e.target as HTMLInputElement).blur()
                            }
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (o.tracking || "")) saveTracking(o, v);
                            }}
                          />
                        ) : o.tracking ? (
                          <span className="text-[#2563EB] text-xs">
                            {o.tracking}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic text-xs">
                            Chưa có
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-semibold whitespace-nowrap">
                        {money(o.total)}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <Button size="small" onClick={() => setDetail(o)}>
                            Chi tiết
                          </Button>
                          {o.status === "pending_approval" && (
                            <Tooltip title="Duyệt đơn → Đang sản xuất">
                              <Button
                                size="small"
                                type="primary"
                                className="bg-[#171826]"
                                onClick={() => approve(o, "in_production")}
                              >
                                Duyệt SX
                              </Button>
                            </Tooltip>
                          )}
                          {o.status === "in_production" && (
                            <Button
                              size="small"
                              onClick={() => approve(o, "shipping")}
                            >
                              → Giao hàng
                            </Button>
                          )}
                          {o.status === "shipping" && (
                            <Button
                              size="small"
                              onClick={() => approve(o, "completed")}
                            >
                              → Hoàn thành
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!paged.length && (
                  <tr>
                    <td colSpan={11} className="p-12 text-center text-gray-400">
                      Không có đơn hàng nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {filtered.length > 0 && (
              <div className="flex items-center justify-between p-3 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  Đang hiện {paged.length} trên tổng số {filtered.length} đơn
                </span>
                <span className="flex items-center gap-3">
                  <Button
                    size="small"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Trước
                  </Button>
                  Trang {page} / {totalPages}
                  <Button
                    size="small"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Sau →
                  </Button>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal sửa thông tin seller */}
      <Modal
        open={!!sellerEdit}
        title="Sửa thông tin Seller"
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={sellerMut.update.isLoading}
        onOk={saveSellerEdit}
        onCancel={() => setSellerEdit(null)}
      >
        <div className="space-y-3 pt-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">Tên seller</div>
            <Input
              value={editForm.name}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Email</div>
              <Input
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">SĐT</div>
              <Input
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">
                Phí in thêm (Markup) $
              </div>
              <InputNumber
                className="w-full"
                min={0}
                step={0.1}
                value={editForm.markup}
                onChange={(v) =>
                  setEditForm((f) => ({ ...f, markup: v || 0 }))
                }
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">
                Phí xử lý đơn $/đơn
              </div>
              <InputNumber
                className="w-full"
                min={0}
                step={0.1}
                value={editForm.perOrderFee}
                onChange={(v) =>
                  setEditForm((f) => ({ ...f, perOrderFee: v || 0 }))
                }
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Ưu đãi $</div>
              <InputNumber
                className="w-full"
                min={0}
                step={0.1}
                value={editForm.discount}
                onChange={(v) =>
                  setEditForm((f) => ({ ...f, discount: v || 0 }))
                }
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal chi tiết đơn */}
      <Modal
        open={!!detail}
        width={640}
        footer={null}
        title={`Chi tiết đơn ${detail?.orderCode || ""}`}
        onCancel={() => setDetail(null)}
      >
        {detail &&
          (() => {
            const d = detail as any;
            const st = ORDER_STATUS[detail.status];
            // Địa chỉ: ưu tiên field chuẩn, fallback sang dữ liệu Etsy cũ
            const raw = d.shippingAddress || d.address || {};
            const line1 = detail.address1 || raw.line_1 || raw.address1 || "";
            const line2 = d.address2 || raw.line_2 || "";
            const city = detail.city || raw.city || "";
            const state = detail.state || raw.region || raw.state || "";
            const zip = detail.zip || raw.zip || "";
            const country = detail.country || raw.country || "";
            const addr = [
              [line1, line2].filter(Boolean).join(", "),
              city,
              [state, zip].filter(Boolean).join(" "),
              country,
            ]
              .filter(Boolean)
              .join(", ");
            const items = detail.items || [];
            return (
              <div className="space-y-3 pt-2 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <div>
                    <span className="text-gray-400">Trạng thái: </span>
                    <span
                      className="font-semibold"
                      style={{ color: st?.color || "#374151" }}
                    >
                      {st?.label || detail.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Shop: </span>
                    <span className="font-medium">
                      {detail.storeName || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Ngày tạo: </span>
                    <span className="font-medium">
                      {detail.created
                        ? dayjs(detail.created).format("DD/MM/YYYY")
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Tracking: </span>
                    {detail.tracking ? (
                      <span className="font-medium text-[#2563EB]">
                        {detail.tracking}
                      </span>
                    ) : (
                      <span className="italic text-gray-400">Chưa có</span>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <b>{detail.customerName || "—"}</b>
                  {addr && <> — {addr}</>}
                </div>

                {items.length ? (
                  items.map((it, i) => (
                    <div
                      key={i}
                      className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div>
                        <div className="font-medium">
                          {it.quantity}x{" "}
                          {it.productName ||
                            it.productSku ||
                            (it as any).sku ||
                            "—"}{" "}
                          {it.size && `· ${it.size}`}{" "}
                          {it.color && `· ${it.color}`}
                        </div>
                        {it.personalization && (
                          <div className="text-xs text-amber-600">
                            Personalization: {it.personalization}
                          </div>
                        )}
                        {it.note && (
                          <div className="text-xs text-gray-400">{it.note}</div>
                        )}
                      </div>
                      <b>{money((it.price || 0) * (it.quantity || 1))}</b>
                    </div>
                  ))
                ) : (
                  <div className="border border-dashed border-gray-200 rounded-lg p-3 text-gray-400 italic">
                    Đơn chưa có sản phẩm chi tiết
                  </div>
                )}

                <div className="text-right font-bold text-base">
                  Tổng: {money(detail.total)}
                </div>
              </div>
            );
          })()}
      </Modal>

      {/* Modal chi tiết seller */}
      <Modal
        open={!!sellerDetail}
        width={520}
        footer={null}
        title="Thông tin Seller"
        onCancel={() => setSellerDetail(null)}
      >
        {sellerDetail &&
          (() => {
            const s = sellerDetail;
            const sStores = stores.filter((st) => st.userId === s.id);
            const sOrders = orders.filter((o) => o.userId === s.id);
            const revenue = sOrders.reduce((sum, o) => sum + (o.total || 0), 0);
            const Row = ({
              label,
              value,
            }: {
              label: string;
              value: React.ReactNode;
            }) => (
              <div className="flex justify-between gap-4 py-2 border-b border-gray-50">
                <span className="text-gray-400">{label}</span>
                <span className="font-medium text-gray-800 text-right">
                  {value}
                </span>
              </div>
            );
            return (
              <div className="pt-2 text-sm">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-11 h-11 rounded-full bg-[#171826] text-white font-bold flex items-center justify-center">
                    {(s.name || s.email || "A").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 text-base truncate">
                      {s.name || "—"}
                    </div>
                    <div className="text-gray-400 text-xs truncate">
                      {s.email || "—"}
                    </div>
                  </div>
                  <Button
                    size="small"
                    icon={<FiEdit3 size={13} />}
                    className="ml-auto"
                    onClick={() => {
                      setSellerDetail(null);
                      openSellerEdit(s);
                    }}
                  >
                    Sửa
                  </Button>
                </div>

                <Row label="Email" value={s.email || "—"} />
                <Row label="SĐT" value={s.phone || "—"} />
                <Row label="Quyền" value={s.permission || "Seller"} />
                <Row
                  label="Ngày tạo"
                  value={
                    s.created ? dayjs(s.created).format("DD/MM/YYYY") : "—"
                  }
                />
                <Row
                  label="Phí in thêm (Markup)"
                  value={`+$${s.markup || 0}`}
                />
                <Row
                  label="Phí xử lý đơn"
                  value={`+$${s.perOrderFee || 0}/đơn`}
                />
                <Row label="Ưu đãi" value={`$${s.discount || 0}`} />
                <Row label="Số shop" value={`${sStores.length}`} />
                <Row label="Tổng số đơn" value={`${sOrders.length}`} />
                <Row label="Tổng doanh thu" value={money(revenue)} />

                <div className="mt-4">
                  <div className="text-xs font-semibold text-gray-500 mb-2">
                    DANH SÁCH SHOP
                  </div>
                  {sStores.length ? (
                    <div className="space-y-1.5">
                      {sStores.map((st) => (
                        <div
                          key={st.id}
                          className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 gap-2"
                        >
                          <span className="truncate">🏪 {st.name}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                st.status === "active"
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-red-50 text-red-500"
                              }`}
                            >
                              {st.status === "active" ? "Hoạt động" : "Đã khóa"}
                            </span>
                            <Popconfirm
                              title={`${
                                st.status === "active" ? "Khóa" : "Mở khóa"
                              } shop "${st.name}"?`}
                              okText="OK"
                              cancelText="Hủy"
                              onConfirm={() =>
                                storeMut.update.mutate({
                                  id: st.id,
                                  status:
                                    st.status === "active"
                                      ? "locked"
                                      : "active",
                                  lockedBy:
                                    st.status === "active" ? "admin" : null,
                                } as any)
                              }
                            >
                              <button className="text-amber-600 bg-transparent border-0 cursor-pointer text-xs">
                                {st.status === "active" ? "Khóa" : "Mở"}
                              </button>
                            </Popconfirm>
                            <Popconfirm
                              title={`Xóa shop "${st.name}"?`}
                              description="Không thể hoàn tác."
                              okText="Xóa"
                              cancelText="Hủy"
                              okButtonProps={{ danger: true }}
                              onConfirm={() => storeMut.remove.mutate(st.id)}
                            >
                              <button className="text-red-500 bg-transparent border-0 cursor-pointer text-xs">
                                Xóa
                              </button>
                            </Popconfirm>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-400 italic">
                      Chưa có cửa hàng nào.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
      </Modal>

      {/* Thanh thao tác khi chọn nhiều đơn */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0F172A] text-white px-5 py-3 flex items-center gap-3 flex-wrap shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
          <span className="bg-[#2563EB] text-white text-sm font-semibold rounded-lg px-3 py-1.5">
            {selectedIds.length} đơn đã chọn
          </span>
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <Popconfirm
              title={`Xóa vĩnh viễn ${selectedIds.length} đơn?`}
              description="Hành động này không thể hoàn tác."
              okText="Xóa vĩnh viễn"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={handleBulkDelete}
            >
              <button className="flex items-center gap-1.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer">
                <FiTrash2 size={15} /> Xóa vĩnh viễn
              </button>
            </Popconfirm>
            <button
              onClick={handleExportSelected}
              className="flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer"
            >
              <FiDownload size={15} /> Tải CSV
            </button>
            <button
              onClick={handleAssignPrinter}
              className="flex items-center gap-1.5 bg-[#059669] hover:bg-[#047857] text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer"
            >
              <FiTruck size={15} /> Phân bổ Nhà In
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-gray-300 hover:text-white text-sm bg-transparent border-0 cursor-pointer px-2"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
