import {
  AutoComplete,
  Button,
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Popover,
  Select,
  Tooltip,
  message,
} from "antd";
import dayjs from "dayjs";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  FiDownload,
  FiCheck,
  FiCheckCircle,
  FiEdit3,
  FiEye,
  FiInfo,
  FiMaximize2,
  FiMinimize2,
  FiRefreshCw,
  FiUsers,
  FiChevronLeft,
  FiRotateCcw,
  FiTrash2,
  FiTruck,
  FiUpload,
  FiXCircle,
} from "react-icons/fi";
import {
  useBaseProducts,
  useOrderMutations,
  useOrders,
  useCsEmployees,
  usePendingOrderIdMutations,
  usePendingOrderIds,
  usePodColors,
  usePodVariants,
  usePrintHouses,
  usePrintHouseSkus,
  useSellerCascade,
  useSellerMutations,
  useSellers,
  useStoreCascade,
  useStoreMutations,
  useStores,
} from "../../hooks/useAdmin";
import { DEFAULT_COLOR_HEX } from "../../lib/colorHex";
import { sbUpdateMany, sbUpsert } from "../../lib/supabase";
import { useQueryClient } from "react-query";
import {
  ORDER_STATUS,
  OrderItem,
  PodOrder,
  Seller,
  splitSizeFromColor,
  staffLabels,
} from "../../models/admin";
import UploadImgButton from "../../components/UploadImgButton";
import { downloadCSV, parseCSV, toCSV } from "../../lib/csvPod";
import {
  DESIGN_FIELDS,
  MOCKUP_FIELDS,
  exportFactoryXlsx,
  factoryRowStyle,
  productNote,
} from "../../lib/factoryExport";
import { imageUrlCandidates } from "../../lib/imageUrl";

const STATUS_TABS = [
  { key: "pending_approval", label: "Đơn chờ duyệt" },
  { key: "in_production", label: "Đang sản xuất" },
  { key: "shipping", label: "Đang giao hàng" },
  { key: "completed", label: "Hoàn thành" },
  { key: "support", label: "Yêu cầu Hỗ trợ" },
  { key: "reship", label: "Đơn Reship (RS)" },
  { key: "refund", label: "Hoàn tiền" },
  { key: "all", label: "Tất cả đơn" },
];

/**
 * 1 ô link thiết kế: ảnh nhỏ (bấm xem lớn) + nhãn + ô dán link ngay dưới ảnh
 * + nút upload ảnh. Dùng cho FRONT / BACK / MOCKUP trong bảng đơn.
 */
function DesignLinkCell({
  label,
  color,
  value,
  bg,
  onCommit,
}: {
  label: string;
  color: string;
  value?: string;
  /** Màu phôi để làm nền ảnh (vd Maroon) */
  bg?: string;
  onCommit: (v: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const cands = value ? imageUrlCandidates(value) : [];
  const src = idx < cands.length ? cands[idx] : "";
  const bgStyle = bg ? { background: bg, borderColor: bg } : undefined;
  const thumb = (
    <span
      style={bgStyle}
      className={`w-10 h-10 shrink-0 rounded-md border border-gray-200 bg-gray-50 inline-flex items-center justify-center overflow-hidden ${
        src ? "cursor-zoom-in" : ""
      } ${bg ? "p-[2px]" : ""}`}
    >
      {src ? (
        <img
          src={src}
          alt={label}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          className="w-full h-full object-contain rounded-[3px]"
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <span className="text-[7px] font-bold tracking-wider text-gray-300">
          {label}
        </span>
      )}
    </span>
  );
  return (
    <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg p-1.5 bg-white w-[210px]">
      {src ? (
        <Popover
          placement="right"
          content={
            <div
              style={bgStyle}
              className={`w-[260px] h-[260px] flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden ${
                bg ? "p-2" : ""
              }`}
            >
              <img
                src={src}
                alt={label}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-full object-contain rounded"
              />
            </div>
          }
        >
          {thumb}
        </Popover>
      ) : (
        thumb
      )}
      <div className="flex-1 min-w-0">
        <div
          className="text-[9px] font-bold tracking-wider leading-none mb-0.5"
          style={{ color }}
        >
          {label}
        </div>
        {/* input thuần (nhẹ hơn antd Input) — bảng có hàng trăm ô link */}
        <input
          key={value || ""}
          defaultValue={value || ""}
          placeholder="Dán link..."
          className="w-full text-[11px] border-0 outline-none bg-transparent p-0 text-gray-600"
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (value || "")) onCommit(v);
          }}
        />
      </div>
      <UploadImgButton size="small" onUploaded={onCommit} />
    </div>
  );
}

/**
 * Ô "Phôi Fulfill" của 1 sản phẩm: mặc định chỉ hiển thị (nhẹ, không tạo
 * Select cho từng dòng -> bảng cuộn mượt). Bấm vào mới bung UI chỉnh sửa.
 */
const FulfillItemCell = memo(function FulfillItemCell({
  it,
  blankName,
  productOptions,
  colorOptions,
  onPatch,
}: {
  it: any;
  blankName: (sku?: string) => string;
  /** Đã memo hoá ở component cha — tránh dựng lại danh sách mỗi lần gõ */
  productOptions: { value: string; label: string }[];
  colorOptions: { value: string }[];
  onPatch: (patch: any) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing)
    return (
      <Tooltip title="Bấm để sửa phôi fulfill">
        <div
          onClick={() => setEditing(true)}
          className="bg-[#F5F8FF] border border-[#DBE7FF] rounded-lg px-3 py-1.5 text-[12px] whitespace-nowrap cursor-pointer hover:border-[#2563EB]"
        >
          <span className="bg-[#DBE7FF] text-[#2563EB] font-bold rounded px-1.5 py-0.5 mr-2">
            {it.quantity || 1}x
          </span>
          <span className="font-bold text-gray-800">
            {blankName(it.productSku)}
          </span>
          {(it.color || it.size) && (
            <span className="text-gray-400 italic">
              {" "}
              ({[it.color, it.size].filter(Boolean).join(" - ")})
            </span>
          )}
        </div>
      </Tooltip>
    );

  return (
    <div className="bg-[#F5F8FF] border border-[#2563EB] rounded-lg p-1.5 flex items-center gap-1 flex-wrap w-[310px]">
      <Tooltip title="Số lượng">
        <InputNumber
          size="small"
          min={1}
          controls={false}
          className="w-[46px]"
          value={it.quantity || 1}
          onChange={(v) => {
            const q = Number(v) || 1;
            if (q !== (it.quantity || 1)) onPatch({ quantity: q });
          }}
        />
      </Tooltip>
      <Tooltip title="Phôi fulfill (Kho Phôi POD)">
        <Select
          size="small"
          className="w-[125px]"
          showSearch
          autoFocus
          placeholder="Chọn phôi..."
          value={it.productSku || undefined}
          options={productOptions}
          listHeight={220}
          virtual
          dropdownStyle={{ overscrollBehavior: "contain" }}
          filterOption={(input, opt) =>
            `${opt?.label || ""} ${opt?.value || ""}`
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          onChange={(v) => onPatch({ productSku: v })}
        />
      </Tooltip>
      <Tooltip title="Màu phôi">
        <AutoComplete
          key={`c-${it.color || ""}`}
          size="small"
          className="w-[100px]"
          placeholder="Màu"
          defaultValue={it.color || ""}
          options={colorOptions}
          listHeight={220}
          dropdownStyle={{ overscrollBehavior: "contain" }}
          filterOption={(input, opt) =>
            String(opt?.value || "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          onSelect={(v) => v !== (it.color || "") && onPatch({ color: String(v) })}
          onBlur={(e) => {
            const v = (e.target as HTMLInputElement).value.trim();
            if (v !== (it.color || "")) onPatch({ color: v });
          }}
        />
      </Tooltip>
      <Tooltip title="Size">
        <Input
          key={`s-${it.size || ""}`}
          size="small"
          className="w-[56px]"
          placeholder="Size"
          defaultValue={it.size || ""}
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (it.size || "")) onPatch({ size: v });
          }}
        />
      </Tooltip>
      <Tooltip title="Xong">
        <button
          onClick={() => setEditing(false)}
          className="w-6 h-6 rounded-md border-0 bg-[#171826] text-white inline-flex items-center justify-center cursor-pointer text-[11px]"
        >
          ✓
        </button>
      </Tooltip>
    </div>
  );
});

/** Ô "Vùng in" của 1 sản phẩm — bấm mới hiện ô chọn (giữ bảng nhẹ) */
const PrintAreaItemCell = memo(function PrintAreaItemCell({
  it,
  onPatch,
}: {
  it: any;
  onPatch: (patch: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const special = it.printArea === "special";

  if (!editing)
    return (
      <Tooltip title="Bấm để đổi vùng in">
        <span
          onClick={() => setEditing(true)}
          className={`inline-block text-[11px] rounded-md px-2 py-1 whitespace-nowrap cursor-pointer ${
            special
              ? "bg-orange-50 border border-orange-200 text-orange-600 font-bold"
              : "text-gray-400 border border-transparent hover:border-gray-200"
          }`}
        >
          {special ? "Đặc biệt +$2" : "Mặc định"}
        </span>
      </Tooltip>
    );

  return (
    <Select
      size="small"
      autoFocus
      defaultOpen
      className="w-[140px]"
      value={special ? "special" : ""}
      options={[
        { value: "", label: "Mặc định" },
        { value: "special", label: "Vùng in đặc biệt (+$2)" },
      ]}
      onChange={(v) => {
        if (v !== (it.printArea || "")) onPatch({ printArea: v });
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
    />
  );
});

function money(n: number) {
  return `$${(n || 0).toFixed(2)}`;
}

export default function Sellers() {
  const { sellers } = useSellers();
  const { stores } = useStores();
  const { orders } = useOrders();
  const { products } = useBaseProducts();
  const { employees } = useCsEmployees();
  // "Add ID" bên tab Quản lý nhân viên: mã đơn khách báo trước + ghi chú thay đổi
  const { pendingIds } = usePendingOrderIds();
  const pendingMut = usePendingOrderIdMutations();
  const pendingByCode = useMemo(() => {
    const m = new Map<string, any>();
    pendingIds.forEach((p: any) =>
      m.set(String(p.orderCode || "").trim().toLowerCase(), p)
    );
    return m;
  }, [pendingIds]);
  const { colors: podColors } = usePodColors();
  // Tên phôi trong Kho Phôi POD theo SKU (vd TM-000-16 -> T-Shirt Comfort)
  const blankName = (sku?: string) =>
    products.find((p) => p.sku === sku)?.name || sku || "Unknown";
  // Màu item -> hex làm nền thiết kế (ưu tiên bảng Mã màu phôi)
  const colorCss = (name?: string): string | undefined => {
    if (!name) return undefined;
    const k = name.trim().toLowerCase();
    const db = podColors.find((c) => c.name.trim().toLowerCase() === k);
    return db?.hex || DEFAULT_COLOR_HEX[k] || undefined;
  };
  // Danh sách option dựng 1 lần — dropdown màu/phôi có hàng trăm dòng,
  // nếu map lại mỗi lần render sẽ giật khi cuộn/gõ.
  const productOptions = useMemo(
    () =>
      products.map((pd) => ({ value: pd.sku, label: pd.name || pd.sku })),
    [products]
  );
  const colorOptions = useMemo(
    () => podColors.map((c) => ({ value: c.name })),
    [podColors]
  );

  const sellerMut = useSellerMutations();
  const { removeSeller } = useSellerCascade();
  const storeMut = useStoreMutations();
  const { removeStore } = useStoreCascade();
  const orderMut = useOrderMutations();
  const qc = useQueryClient();

  const [statusTab, setStatusTab] = useState("all");
  const [filterSeller, setFilterSeller] = useState<string>("");
  const [filterShop, setFilterShop] = useState<string>("");
  const [trackingFilter, setTrackingFilter] = useState<
    "all" | "missing" | "available"
  >("all");
  const [printHouseFilter, setPrintHouseFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [designFilter, setDesignFilter] = useState<
    "all" | "missing" | "ready"
  >("all");
  const [shipByFilter, setShipByFilter] = useState<
    "all" | "overdue" | "today" | "next_2_days" | "missing"
  >("all");
  const [searchCode, setSearchCode] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tableFull, setTableFull] = useState(false);
  const [sellerPanelOpen, setSellerPanelOpen] = useState(true);
  const [profitFilter, setProfitFilter] = useState<"all" | "profit" | "loss">(
    "all"
  );
  const [exportingFactory, setExportingFactory] = useState(false);
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
  const compareRef = useRef<HTMLInputElement>(null);

  const realSellers = sellers.filter((s) => s.permission !== "Admin");
  const fulfilProducts = useMemo(
    () =>
      Array.from(
        new Set(
          orders.flatMap((order) =>
            (order.items || [])
              .map((item) => item.productSku?.trim())
              .filter(Boolean) as string[]
          )
        )
      ).sort((a, b) => a.localeCompare(b)),
    [orders]
  );

  // 3 loại phí của seller sở hữu đơn — nhập 1 lần cho seller là tự áp cho
  // tất cả đơn thuộc mọi shop của seller đó (kể cả đơn đang chờ duyệt).
  // Tổng đơn = Giá + Markup + Phí xử lý đơn - Ưu đãi.
  const feesOf = (userId?: string) => {
    const s = sellers.find((x) => x.id === userId);
    const markup = s?.markup || 0;
    const perOrderFee = s?.perOrderFee || 0;
    const discount = s?.discount || 0;
    return {
      markup,
      perOrderFee,
      discount,
      extra: markup + perOrderFee - discount,
    };
  };

  // ---- Tìm kiếm nhanh: gom mọi thông tin dễ nhớ của đơn thành 1 chuỗi ----
  // Gõ nhiều từ khoá cách nhau bởi dấu cách = phải khớp TẤT CẢ (AND).
  const sellerById = useMemo(() => {
    const m = new Map<string, Seller>();
    sellers.forEach((s) => m.set(s.id, s));
    return m;
  }, [sellers]);

  const searchIndex = useMemo(() => {
    const m = new Map<string, string>();
    orders.forEach((o: any) => {
      const seller = o.userId ? sellerById.get(o.userId) : undefined;
      const items = Array.isArray(o.items) ? o.items : [];
      m.set(
        o.id,
        [
          o.orderCode,
          o.storeName,
          o.customerName,
          o.customerEmail,
          o.customerPhone,
          o.tracking,
          o.printHouse,
          o.note,
          o.status,
          ORDER_STATUS[o.status]?.label,
          seller?.name,
          seller?.email,
          o.address1,
          o.address2,
          o.city,
          o.state,
          o.zip,
          o.country,
          o.created ? dayjs(o.created).format("DD/MM/YYYY") : "",
          ...items.flatMap((it: any) => [
            it?.productName,
            it?.productSku,
            it?.sku,
            it?.color,
            it?.size,
            it?.origType,
            it?.origColor,
            it?.origSize,
            it?.origTitle,
            it?.personalization,
            it?.note,
            it?.transactionId,
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
      );
    });
    return m;
  }, [orders, sellerById]);

  const searchTerms = useMemo(
    () =>
      searchCode
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean),
    [searchCode]
  );

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusTab !== "all" && o.status !== statusTab) return false;
      if (filterSeller && o.userId !== filterSeller) return false;
      if (filterShop && o.storeId !== filterShop) return false;
      const hasTracking = Boolean(String(o.tracking || "").trim());
      if (trackingFilter === "missing" && hasTracking) return false;
      if (trackingFilter === "available" && !hasTracking) return false;
      const hasPrintHouse = Boolean(String(o.printHouse || "").trim());
      if (printHouseFilter === "__unassigned__" && hasPrintHouse) return false;
      if (printHouseFilter === "__assigned__" && !hasPrintHouse) return false;
      if (
        printHouseFilter &&
        printHouseFilter !== "__unassigned__" &&
        printHouseFilter !== "__assigned__" &&
        o.printHouse !== printHouseFilter
      )
        return false;
      if (
        productFilter &&
        !(o.items || []).some((item) => item.productSku === productFilter)
      )
        return false;
      const hasMissingDesign = (o.items || []).some(
        (item) => !String(item.frontUrl || "").trim()
      );
      if (designFilter === "missing" && !hasMissingDesign) return false;
      if (designFilter === "ready" && hasMissingDesign) return false;
      const shipBy = o.shipBy ? dayjs(o.shipBy).startOf("day") : null;
      const hasShipBy = Boolean(shipBy?.isValid());
      const today = dayjs().startOf("day");
      if (shipByFilter === "missing" && hasShipBy) return false;
      if (shipByFilter === "overdue" && (!hasShipBy || !shipBy!.isBefore(today)))
        return false;
      if (shipByFilter === "today" && (!hasShipBy || !shipBy!.isSame(today, "day")))
        return false;
      if (
        shipByFilter === "next_2_days" &&
        (!hasShipBy ||
          shipBy!.isBefore(today.add(1, "day")) ||
          shipBy!.isAfter(today.add(2, "day")))
      )
        return false;
      if (searchTerms.length) {
        const hay = searchIndex.get(o.id) || "";
        if (!searchTerms.every((t) => hay.includes(t))) return false;
      }
      if (fromDate && dayjs(o.created).isBefore(dayjs(fromDate), "day"))
        return false;
      if (toDate && dayjs(o.created).isAfter(dayjs(toDate), "day"))
        return false;
      return true;
    });
  }, [
    orders,
    statusTab,
    filterSeller,
    filterShop,
    trackingFilter,
    printHouseFilter,
    productFilter,
    designFilter,
    shipByFilter,
    searchTerms,
    searchIndex,
    fromDate,
    toDate,
  ]);

  // ---- Bảng giá phôi + tính Lợi nhuận (Đơn giá − Giá nhà in) ----
  const { variants } = usePodVariants();
  const findVar = (it: any) => {
    const nrm = (x?: string) => (x || "").trim().toLowerCase();
    const brandCands = [it.productName, blankName(it.productSku), it.productSku]
      .map(nrm)
      .filter(Boolean);
    const pool = variants.filter((v) => brandCands.includes(nrm(v.product)));
    if (!pool.length) return undefined;
    const size = nrm(it.size);
    const bySize = size ? pool.filter((v) => nrm(v.size) === size) : pool;
    const p2 = bySize.length ? bySize : pool;
    const color = nrm(it.color);
    return p2.find((v) => nrm(v.color) === color) || p2[0];
  };
  // Đơn giá 1 sp theo bảng giá phôi (giá gốc + ship, + vùng in phụ nếu có)
  const itemUnitPrice = (v: any, it: any) => {
    const twoSide = !!((it.backUrl || "").trim() || (it.mockupUrl || "").trim());
    const special =
      it.printArea === "special" || (it.extraAreas?.length || 0) > 0;
    const extra = special ? v.printExtraArea || 0 : 0;
    const base = twoSide
      ? (v.price || 0) + (v.shipPrice || 0) + (v.printOneSide || 0)
      : v.priceTeement || 0;
    return base + extra;
  };
  // Giá nhà in 1 sp theo nhà in ĐANG GÁN cho đơn (AK2 / Fashship / 3D).
  const houseUnitPrice = (o: PodOrder, v: any) => {
    const name = (o.printHouse || "").toLowerCase();
    if (name.includes("ak2")) return v.priceAK2 || 0;
    if (name.includes("fash") || name.includes("flash"))
      return v.priceFashship || 0;
    if (name.includes("3d")) return v.price3D || 0;
    const arr = [v.priceAK2 || 0, v.priceFashship || 0, v.price3D || 0].filter(
      (x) => x > 0
    );
    return arr.length === 1 ? arr[0] : Math.max(0, ...arr);
  };
  // Lợi nhuận đơn = tổng (Đơn giá − Giá nhà in) cho các sp đã có giá nhà in.
  const orderProfit = (o: PodOrder) => {
    let dono = 0;
    let house = 0;
    let hasHouse = false;
    for (const it of (o.items || []) as any[]) {
      const v = findVar(it);
      if (!v) continue;
      const hu = houseUnitPrice(o, v);
      if (hu > 0) {
        const qty = it.quantity || 1;
        hasHouse = true;
        house += hu * qty;
        dono += itemUnitPrice(v, it) * qty;
      }
    }
    return {
      hasHouse: hasHouse && !!o.printHouse,
      house,
      dono,
      profit: dono - house,
    };
  };

  // Thống kê lãi/lỗ trên tập đơn đang lọc
  const profitStats = useMemo(() => {
    let withHouse = 0;
    let lai = 0;
    let lo = 0;
    let totalLai = 0;
    let totalLo = 0;
    for (const o of filtered) {
      const p = orderProfit(o);
      if (!p.hasHouse) continue;
      withHouse += 1;
      if (p.profit >= 0) {
        lai += 1;
        totalLai += p.profit;
      } else {
        lo += 1;
        totalLo += -p.profit;
      }
    }
    return { withHouse, lai, lo, totalLai, totalLo, net: totalLai - totalLo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, variants]);

  // Áp bộ lọc lãi/lỗ (chỉ tính đơn đã có giá nhà in)
  const visible = useMemo(() => {
    if (profitFilter === "all") return filtered;
    return filtered.filter((o) => {
      const p = orderProfit(o);
      if (!p.hasHouse) return false;
      return profitFilter === "profit" ? p.profit >= 0 : p.profit < 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, profitFilter, variants]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const paged = visible.slice((page - 1) * pageSize, page * pageSize);

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
    // Gộp thông tin từng item của đơn vào 1 ô, ngăn cách bằng " | "
    const joinItems = (o: PodOrder, pick: (it: OrderItem) => string) =>
      (o.items || []).map(pick).join(" | ");

    downloadCSV(
      filename,
      toCSV(
        [
          // Mã & trạng thái
          "Order ID",
          "Status",
          "Shop",
          "Nhà In",
          // Thông tin khách hàng
          "Customer",
          "Email",
          "Phone",
          "Address",
          "City",
          "State",
          "Zip",
          "Country",
          // Sản phẩm khách chọn
          "Sản phẩm",
          "SKU",
          "Variant ID",
          "Màu",
          "Size",
          "Số lượng",
          "Personalization",
          "Print Area",
          // Thiết kế của khách
          "Thiết kế (Front)",
          "Thiết kế (Back)",
          "Mockup",
          // Thời gian & tài chính
          "Date",
          "Paid",
          "Tracking",
          "Price",
          "Markup",
          "Order Fee",
          "Discount",
          "Total",
        ],
        list.map((o) => {
          const f = feesOf(o.userId);
          const printArea = (o.items || []).some(
            (it) => it.printArea === "special"
          )
            ? "Vùng in đặc biệt"
            : "Mặc định";
          const address = [o.address1, o.address2].filter(Boolean).join(", ");
          return [
            o.orderCode,
            ORDER_STATUS[o.status]?.label || o.status,
            o.storeName || "",
            o.printHouse || "",
            // Khách hàng
            o.customerName || "",
            o.customerEmail || "",
            o.customerPhone || "",
            address,
            o.city || "",
            o.state || "",
            o.zip || "",
            o.country || "",
            // Sản phẩm
            joinItems(o, (it) => `${it.quantity}x ${it.productName || it.productSku || ""}`),
            joinItems(o, (it) => it.sku || it.productSku || ""),
            // Variant ID tra theo Nhà In + phôi/màu/size của từng món
            joinItems(o, (it) => findVariantId(o.printHouse, it)),
            joinItems(o, (it) => it.color || ""),
            joinItems(o, (it) => it.size || ""),
            joinItems(o, (it) => String(it.quantity ?? "")),
            joinItems(o, (it) => it.personalization || ""),
            printArea,
            // Thiết kế
            joinItems(o, (it) => it.frontUrl || ""),
            joinItems(o, (it) => it.backUrl || ""),
            joinItems(o, (it) => it.mockupUrl || ""),
            // Thời gian & tài chính
            o.created ? dayjs(o.created).format("DD/MM/YYYY") : "",
            o.datePaid ? dayjs(o.datePaid).format("DD/MM/YYYY") : "Chưa thanh toán",
            o.tracking || "",
            (o.total || 0).toFixed(2),
            f.markup.toFixed(2),
            f.perOrderFee.toFixed(2),
            f.discount.toFixed(2),
            ((o.total || 0) + f.extra).toFixed(2),
          ];
        })
      )
    );
  };
  // Giữ lại để dùng khi cần bật lại nút "Xuất CSV (Kết quả lọc)"
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  /* ---------------- Xuất file cho XƯỞNG (.xlsx có tô màu) ----------------
   * Xuất xong tự đánh dấu các đơn là "đã chuyển xưởng" (sentToFactoryAt) để
   * lần sau nhìn màu là biết đơn nào đã đẩy đi. Đơn đã có mốc này thì giữ
   * nguyên mốc cũ (không ghi đè ngày gửi lần đầu).
   */
  const handleExportFactory = async (list: PodOrder[]) => {
    if (!list.length) {
      message.warning("Không có đơn nào để xuất");
      return;
    }
    setExportingFactory(true);
    try {
      const stamp = dayjs().format("YYYY-MM-DD_HHmm");
      const lines = exportFactoryXlsx(list, {
        findVariantId,
        staffLabel: (assignee) => staffLabels(assignee, employees),
        fileName: `don-gui-xuong_${stamp}.xlsx`,
      });
      const now = new Date().toISOString();
      const fresh = list.filter((o) => !String(o.sentToFactoryAt || "").trim());
      if (fresh.length) {
        // Đánh dấu hàng loạt bằng PATCH theo lô (không dùng upsert: payload
        // thiếu cột sẽ vướng ràng buộc NOT NULL của podOrders)
        await sbUpdateMany(
          "podOrders",
          fresh.map((o) => o.id),
          { sentToFactoryAt: now }
        );
      }
      // Xuất file = đã đẩy cho xưởng -> đơn ĐANG SẢN XUẤT chuyển ĐANG GIAO HÀNG.
      // Các trạng thái khác giữ nguyên.
      const toShipping = list.filter((o) => o.status === "in_production");
      if (toShipping.length) {
        await sbUpdateMany(
          "podOrders",
          toShipping.map((o) => o.id),
          { status: "shipping" }
        );
      }
      if (fresh.length || toShipping.length)
        qc.invalidateQueries(["adm-orders"]);
      message.success(
        `Đã xuất ${list.length} đơn (${lines} dòng sản phẩm)` +
          (fresh.length ? ` · đánh dấu ${fresh.length} đơn đã chuyển xưởng` : "") +
          (toShipping.length
            ? ` · ${toShipping.length} đơn Đang sản xuất → Đang giao hàng`
            : "")
      );
    } catch (e: any) {
      message.error(`Xuất file lỗi: ${e?.message || e}`);
    } finally {
      setExportingFactory(false);
    }
  };

  /** Bỏ đánh dấu đã chuyển xưởng (khi cần gửi lại đơn cho xưởng) */
  const unmarkFactory = async (o: PodOrder) => {
    await orderMut.update.mutateAsync({ id: o.id, sentToFactoryAt: "" } as any);
    message.success(`Đơn ${o.orderCode}: bỏ đánh dấu đã chuyển xưởng`);
  };

  const saveFactoryNote = async (o: PodOrder, note: string) => {
    await orderMut.update.mutateAsync({ id: o.id, factoryNote: note } as any);
  };
  /** Sửa 1 sản phẩm trong đơn (phôi fulfill, link thiết kế...) */
  const patchItem = async (o: PodOrder, idx: number, patch: any) => {
    const items = (o.items || []).map((it, i) =>
      i === idx ? { ...it, ...patch } : it
    );
    await orderMut.update.mutateAsync({ id: o.id, items } as any);
  };

  const saveDtfDtg = async (o: PodOrder, v: string) => {
    await orderMut.update.mutateAsync({ id: o.id, dtfDtg: v } as any);
  };
  const saveCardCode = async (o: PodOrder, v: string) => {
    await orderMut.update.mutateAsync({ id: o.id, cardCode: v } as any);
  };
  const saveAssignee = async (o: PodOrder, name: string) => {
    await orderMut.update.mutateAsync({ id: o.id, csAssignee: name } as any);
  };

  // Trả đơn về trạng thái trước đó trong luồng xử lý.
  // Đơn "Chờ duyệt" không lùi được nữa (không quay về Chưa thanh toán).
  const PREV_STATUS: Record<string, string> = {
    in_production: "pending_approval",
    shipping: "in_production",
    completed: "shipping",
  };
  const revertableSelected = () =>
    selectedOrders().filter((o) => PREV_STATUS[o.status]);

  // Duyệt / Hủy hàng loạt cho các đơn Chờ duyệt trong số đã chọn
  const approvableSelected = () =>
    selectedOrders().filter((o) => o.status === "pending_approval");
  const handleBulkApprove = async () => {
    const list = approvableSelected();
    for (const o of list) {
      await orderMut.update.mutateAsync({ id: o.id, status: "in_production" });
    }
    message.success(`Đã duyệt ${list.length} đơn → Đang sản xuất`);
    setSelectedIds([]);
  };
  const handleBulkCancel = async () => {
    const list = approvableSelected();
    for (const o of list) {
      await orderMut.update.mutateAsync({ id: o.id, status: "cancelled" });
    }
    message.success(`Đã hủy ${list.length} đơn`);
    setSelectedIds([]);
  };

  // Xử lý đơn Yêu cầu Hỗ trợ trong số đã chọn
  const supportSelected = () =>
    selectedOrders().filter((o) => o.status === "support");
  // Duyệt đi lại đơn -> chuyển sang Đơn Reship
  const handleBulkReship = async () => {
    const list = supportSelected();
    for (const o of list) {
      await orderMut.update.mutateAsync({ id: o.id, status: "reship" });
    }
    message.success(`Đã duyệt đi lại ${list.length} đơn (Reship)`);
    setSelectedIds([]);
  };
  // Hủy đơn Reship -> trả đơn về trạng thái trước khi seller gửi yêu cầu hỗ trợ
  const reshipSelected = () =>
    selectedOrders().filter((o) => o.status === "reship");
  const handleBulkUnreship = async () => {
    const list = reshipSelected();
    for (const o of list) {
      await orderMut.update.mutateAsync({
        id: o.id,
        status: (o as any).prevStatus || "completed",
        prevStatus: "",
      } as any);
    }
    message.success(`Đã hủy ${list.length} đơn Reship`);
    setSelectedIds([]);
  };

  // Hủy yêu cầu hỗ trợ -> trả đơn về trạng thái trước khi seller gửi yêu cầu
  const handleBulkUnsupport = async () => {
    const list = supportSelected();
    for (const o of list) {
      await orderMut.update.mutateAsync({
        id: o.id,
        status: (o as any).prevStatus || "in_production",
        prevStatus: "",
      } as any);
    }
    message.success(`Đã hủy yêu cầu hỗ trợ của ${list.length} đơn`);
    setSelectedIds([]);
  };
  const handleBulkRevert = async () => {
    const list = revertableSelected();
    const skipped = selectedIds.length - list.length;
    for (const o of list) {
      await orderMut.update.mutateAsync({
        id: o.id,
        status: PREV_STATUS[o.status],
      });
    }
    if (list.length)
      message.success(`Đã trả ${list.length} đơn về trạng thái trước`);
    if (skipped)
      message.info(`Bỏ qua ${skipped} đơn không có trạng thái trước để lùi`);
    setSelectedIds([]);
  };
  // Phân bổ Nhà In hàng loạt: gán tên + đồng bộ phiếu in sang tab Nhà In
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignHouse, setAssignHouse] = useState<string | null>(null);
  const handleAssignPrinter = async () => {
    if (!assignHouse) return;
    let orderCount = 0;
    let rowCount = 0;
    for (const o of selectedOrders()) {
      await orderMut.update.mutateAsync({
        id: o.id,
        printHouse: assignHouse,
      } as any);
      rowCount += await syncPrintOrders(o, assignHouse);
      orderCount++;
    }
    message.success(
      `Đã phân bổ ${orderCount} đơn cho Nhà In ${assignHouse} (đồng bộ ${rowCount} dòng phiếu in)`
    );
    setAssignOpen(false);
    setAssignHouse(null);
    setSelectedIds([]);
  };

  // Import tracking: CSV cột "Order ID" + "Tracking"
  const handleImportTracking = async (file: File) => {
    const rows = parseCSV(await file.text());
    let count = 0;
    for (const r of rows) {
      // Nhận cả file "Trackking.csv" (Oder ID / Track / Nhà vận chuyển)
      const code =
        r["Order ID"] || r["Oder ID"] || r["orderCode"] || r["Mã đơn"];
      const tracking = r["Tracking"] || r["Track"] || r["tracking"];
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

  // Import file Giá đối chiếu: cột Order ID + Giá (đối chiếu). Đơn có id trong
  // file sẽ được điền comparePrice; không đụng tới tổng tiền/công nợ.
  const handleImportComparePrice = async (file: File) => {
    const rows = parseCSV(await file.text());
    let count = 0;
    for (const r of rows) {
      const code =
        r["Order ID"] || r["Oder ID"] || r["orderCode"] || r["Mã đơn"];
      const raw =
        r["Giá đối chiếu"] ??
        r["Gia doi chieu"] ??
        r["Compare"] ??
        r["Price"] ??
        r["Giá"] ??
        "";
      if (!code) continue;
      const num = String(raw).replace(/[^0-9.\-]/g, "").trim();
      const value = num === "" ? null : Number(num);
      const order = orders.find((o) => o.orderCode === String(code).trim());
      if (!order) continue;
      await orderMut.update.mutateAsync({
        id: order.id,
        comparePrice: value,
      } as any);
      count++;
    }
    message.success(`Đã cập nhật Giá đối chiếu cho ${count} đơn`);
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

  // Giá đối chiếu: chỉ lưu để so sánh với Tổng, không đụng tới tổng tiền/công nợ.
  const saveComparePrice = async (o: PodOrder, value: number | null) => {
    await orderMut.update.mutateAsync({
      id: o.id,
      comparePrice: value,
    } as any);
    message.success(
      value == null
        ? `Đã xóa giá đối chiếu đơn ${o.orderCode}`
        : `Đã lưu giá đối chiếu đơn ${o.orderCode}`
    );
  };

  // Đồng bộ đơn sang tab Nhà In (bảng printOrders) — mỗi item 1 dòng phiếu in.
  // Id cố định theo mã đơn + số thứ tự item nên gán lại nhà in chỉ update, không tạo trùng.
  const syncPrintOrders = async (o: PodOrder, printHouse: string) => {
    const name = (o.customerName || "").trim();
    const parts = name.split(/\s+/);
    const rows = (o.items || []).map((it, i) => ({
      id: `po-${o.orderCode}-${i}`,
      orderDate: o.created ? dayjs(o.created).format("D/M/YYYY") : "",
      orderId: o.orderCode || "",
      orderSource: (o as any).source || "",
      address1: o.address1 || "",
      address2: (o as any).address2 || "",
      city: o.city || "",
      countryCode: o.country || "",
      firstName: parts.slice(0, 1).join(" "),
      lastName: parts.slice(1).join(" "),
      phone: (o as any).customerPhone || "",
      state: o.state || "",
      zip: o.zip || "",
      shippingMethod: "Standard",
      productCode: it.productSku || "",
      size: it.size || "",
      color: it.color || "",
      sku: it.sku || it.productSku || "",
      quantity: it.quantity || 1,
      frontDesignUrl: it.frontUrl || "",
      frontMockupUrl: it.mockupUrl || "",
      backDesignUrl: it.backUrl || "",
      backMockupUrl: it.backUrl ? it.mockupUrl || "" : "",
      // Vùng in -> ghi vào Front Print Size của phiếu in
      frontPrintSize:
        it.printArea === "special" ? "Vùng in đặc biệt" : "Mặc định",
      note: it.note || o.note || "",
      printHouse,
      created: new Date().toISOString(),
    }));
    if (rows.length) {
      await sbUpsert("printOrders", rows);
      qc.invalidateQueries(["adm-print-orders"]);
    }
    return rows.length;
  };

  const savePrintHouse = async (o: PodOrder, printHouse: string) => {
    await orderMut.update.mutateAsync({ id: o.id, printHouse } as any);
    if (printHouse) {
      const n = await syncPrintOrders(o, printHouse);
      message.success(
        `Đơn ${o.orderCode} → Nhà In ${printHouse} (đã đồng bộ ${n} dòng phiếu in)`
      );
    } else {
      message.success(`Đã bỏ Nhà In của đơn ${o.orderCode}`);
    }
  };

  // Gợi ý Nhà In: lấy từ Danh mục Nhà In (tab Nhà In)
  const { printHouses } = usePrintHouses();
  const printHouseOptions = useMemo(
    () => printHouses.map((h) => ({ value: h.name })),
    [printHouses]
  );

  // Data SKU riêng của từng Nhà In (để tra Variant ID theo Brand + Màu + Size)
  const { phSkus } = usePrintHouseSkus();
  const findVariantId = (house?: string, it?: any): string => {
    if (!house || !it || !phSkus.length) return "";
    const color = (it.color || "").trim().toLowerCase();
    const size = (it.size || "").trim().toLowerCase();
    const brandCands = [it.productName, blankName(it.productSku), it.productSku]
      .map((x) => (x || "").trim().toLowerCase())
      .filter(Boolean);
    const row = phSkus.find(
      (r) =>
        r.printHouse === house &&
        brandCands.includes((r.brand || "").trim().toLowerCase()) &&
        (r.color || "").trim().toLowerCase() === color &&
        (r.size || "").trim().toLowerCase() === size
    );
    return row?.variantId || "";
  };

  // Nội dung tooltip breakdown giá cho 1 đơn (hiển thị, không đổi tổng tiền)
  const priceTooltip = (o: PodOrder) => (
    <div className="text-xs leading-5">
      {(o.items || []).map((it: any, i: number) => {
        const v = findVar(it);
        if (!v)
          return (
            <div key={i} className="text-white/70">
              {blankName(it.productSku)}: chưa có trong bảng giá phôi
            </div>
          );
        const twoSide = !!(
          (it.backUrl || "").trim() || (it.mockupUrl || "").trim()
        );
        const special =
          it.printArea === "special" || (it.extraAreas?.length || 0) > 0;
        const extra = special ? v.printExtraArea || 0 : 0;
        const base = twoSide
          ? (v.price || 0) + (v.shipPrice || 0) + (v.printOneSide || 0)
          : v.priceTeement || 0;
        const unit = base + extra;
        const qty = it.quantity || 1;
        const hasHousePrice =
          (v.priceAK2 || 0) > 0 ||
          (v.priceFashship || 0) > 0 ||
          (v.price3D || 0) > 0;
        return (
          <div
            key={i}
            className={i > 0 ? "mt-2 pt-2 border-t border-white/20" : ""}
          >
            {(o.items?.length || 0) > 1 && (
              <div className="font-semibold mb-0.5">
                SP{i + 1}: {blankName(it.productSku)}
              </div>
            )}
            {twoSide ? (
              <>
                <div>Giá gốc: {money(v.price || 0)}</div>
                <div>Giá ship: +{money(v.shipPrice || 0)}</div>
                <div>In 1 mặt (2 mặt): +{money(v.printOneSide || 0)}</div>
              </>
            ) : (
              <div>
                Giá Teement (giá gốc + ship): {money(v.priceTeement || 0)}
              </div>
            )}
            {special && <div>In vùng phụ: +{money(v.printExtraArea || 0)}</div>}
            <div className="font-semibold mt-0.5">
              Đơn giá: {money(unit)} × {qty} = {money(unit * qty)}
            </div>
            {o.printHouse && (
              <div className="mt-1 pt-1 border-t border-white/20">
                <div className="text-white/80">
                  Giá nhà in ({o.printHouse}):
                </div>
                {(v.priceAK2 || 0) > 0 && <div>AK2: {money(v.priceAK2 || 0)}</div>}
                {(v.priceFashship || 0) > 0 && (
                  <div>Fashship: {money(v.priceFashship || 0)}</div>
                )}
                {(v.price3D || 0) > 0 && <div>3D: {money(v.price3D || 0)}</div>}
                {!hasHousePrice && (
                  <div className="text-white/60">— chưa có giá nhà in</div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {(() => {
        const p = orderProfit(o);
        if (!p.hasHouse) return null;
        const win = p.profit >= 0;
        return (
          <div className="mt-2 pt-2 border-t border-white/30">
            <div className="text-white/80">
              Đơn giá: {money(p.dono)} − Giá nhà in: {money(p.house)}
            </div>
            <div
              className={`font-bold ${
                win ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {win ? "Lợi nhuận" : "Lỗ"}: {win ? "+" : "-"}
              {money(Math.abs(p.profit))}
            </div>
          </div>
        );
      })()}
    </div>
  );

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
        <div className="flex items-center gap-3 flex-wrap">
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
        <Button
          icon={<FiUpload />}
          className="h-[40px] rounded-lg font-medium"
          onClick={() => compareRef.current?.click()}
        >
          Import Giá đối chiếu (CSV)
        </Button>
        <input
          ref={compareRef}
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportComparePrice(f);
            e.target.value = "";
          }}
        />
        </div>
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
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1 flex items-center gap-1">
            TÌM KIẾM NHANH
            <Tooltip
              title={
                <div className="text-xs">
                  Tìm trong: mã đơn, tên/email/SĐT khách, tracking, shop,
                  seller, nhà in, SKU &amp; tên phôi, màu, size,
                  personalization, địa chỉ, ngày (DD/MM/YYYY), trạng thái, ghi
                  chú.
                  <br />
                  Gõ nhiều từ cách nhau bởi dấu cách để lọc chồng nhau — ví dụ{" "}
                  <b>gildan black</b>.
                </div>
              }
            >
              <span className="cursor-help text-gray-300">ⓘ</span>
            </Tooltip>
          </div>
          <Input
            className="w-[280px]"
            placeholder="Mã đơn, khách, tracking, SKU, shop..."
            value={searchCode}
            onChange={(e) => {
              setSearchCode(e.target.value);
              setPage(1);
            }}
            allowClear
          />
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            TRACKING
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            {[
              { key: "all", label: "Tất cả" },
              { key: "missing", label: "Chưa có tracking" },
              { key: "available", label: "Đã có tracking" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTrackingFilter(item.key as typeof trackingFilter);
                  setPage(1);
                }}
                className={`px-3 h-[32px] text-xs border-0 border-r last:border-r-0 border-gray-200 cursor-pointer whitespace-nowrap ${
                  trackingFilter === item.key
                    ? "bg-[#171826] text-white font-semibold"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            NHÀ IN
          </div>
          <Select
            className="w-[170px]"
            value={printHouseFilter || undefined}
            placeholder="Tất cả nhà in"
            allowClear
            onChange={(v) => {
              setPrintHouseFilter(v || "");
              setPage(1);
            }}
            options={[
              { value: "__unassigned__", label: "Chưa gán nhà in" },
              { value: "__assigned__", label: "Đã gán nhà in" },
              ...printHouseOptions.map((house) => ({
                value: house.value,
                label: house.value,
              })),
            ]}
          />
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            PHÔI FULFILL
          </div>
          <Select
            className="w-[170px]"
            value={productFilter || undefined}
            placeholder="Tất cả loại phôi"
            allowClear
            showSearch
            onChange={(v) => {
              setProductFilter(v || "");
              setPage(1);
            }}
            options={fulfilProducts.map((product) => ({
              value: product,
              label: product,
            }))}
          />
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            THIẾT KẾ
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            {[
              { key: "all", label: "Tất cả" },
              { key: "missing", label: "Thiếu Front" },
              { key: "ready", label: "Đủ Front" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setDesignFilter(item.key as typeof designFilter);
                  setPage(1);
                }}
                className={`px-3 h-[32px] text-xs border-0 border-r last:border-r-0 border-gray-200 cursor-pointer whitespace-nowrap ${
                  designFilter === item.key
                    ? "bg-[#171826] text-white font-semibold"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-1">
            HẠN SHIP ETSY
          </div>
          <Select
            className="w-[165px]"
            value={shipByFilter}
            onChange={(v) => {
              setShipByFilter(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "Tất cả hạn ship" },
              { value: "overdue", label: "Đã quá hạn" },
              { value: "today", label: "Đến hạn hôm nay" },
              { value: "next_2_days", label: "Trong 1–2 ngày tới" },
              { value: "missing", label: "Chưa có hạn ship" },
            ]}
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
            setTrackingFilter("all");
            setPrintHouseFilter("");
            setProductFilter("");
            setDesignFilter("all");
            setShipByFilter("all");
            setSearchCode("");
            setFromDate("");
            setToDate("");
            setStatusTab("all");
            setPage(1);
          }}
        >
          Làm mới
        </Button>
        {/* Nút "Xuất CSV (Kết quả lọc)" đã ẩn — dùng "Xuất file" (XLSX) bên dưới */}
        <Tooltip
          title={
            <div className="text-xs leading-5">
              Xuất .xlsx đúng mẫu sheet của xưởng (mỗi sản phẩm 1 dòng).
              <br />
              Đơn trong file được đánh dấu <b>đã chuyển xưởng</b>; đơn đang ở{" "}
              <b>Đang sản xuất</b> sẽ tự chuyển sang <b>Đang giao hàng</b> (các
              trạng thái khác giữ nguyên).
            </div>
          }
        >
          <Button
            type="primary"
            icon={<FiDownload />}
            loading={exportingFactory}
            onClick={() => handleExportFactory(filtered)}
          >
            Xuất file
          </Button>
        </Tooltip>
      </div>

      <div className="flex gap-6 mt-6 items-start flex-wrap lg:flex-nowrap">
        {/* Danh sách seller (ẩn được để bảng full width) */}
        <div
          className={`${
            sellerPanelOpen ? "w-full lg:w-[280px]" : "hidden"
          } shrink-0`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] tracking-widest text-gray-500 font-semibold">
              DANH SÁCH SELLER - NEWEST
            </div>
            <Tooltip title="Ẩn danh sách seller">
              <button
                onClick={() => setSellerPanelOpen(false)}
                className="w-6 h-6 rounded-md border border-gray-200 bg-white text-gray-500 inline-flex items-center justify-center cursor-pointer hover:bg-gray-100"
              >
                <FiChevronLeft size={14} />
              </button>
            </Tooltip>
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
                      description="Xoá seller sẽ xoá TẤT CẢ đơn hàng và lô import PDF của seller này. Seller đang đăng nhập sẽ bị đá ra. Không thể hoàn tác."
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{
                        danger: true,
                        loading: removeSeller.isLoading,
                      }}
                      onConfirm={async () => {
                        const hide = message.loading(
                          `Đang xóa seller ${seller.name || seller.email} và dữ liệu liên quan...`,
                          0
                        );
                        try {
                          const res = await removeSeller.mutateAsync({
                            id: seller.id,
                          });
                          hide();
                          message.success(
                            `Đã xóa seller ${seller.name || seller.email} — ${res.orders} đơn, ${res.queue} lô import`
                          );
                        } catch (e) {
                          hide();
                          message.error("Xóa seller thất bại. Vui lòng thử lại.");
                        }
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
            {!sellerPanelOpen && !tableFull && (
              <Tooltip title="Hiện danh sách seller">
                <button
                  onClick={() => setSellerPanelOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] cursor-pointer border border-gray-200 bg-white text-gray-600 font-medium"
                >
                  <FiUsers size={14} /> Seller
                </button>
              </Tooltip>
            )}
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

          {/* Thống kê Lãi/Lỗ (đơn đã gán nhà in) — bấm để lọc nhanh */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-xs text-gray-400 font-medium mr-1">
              Lợi nhuận (đơn có nhà in):
            </span>
            <button
              onClick={() => {
                setProfitFilter("all");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-[13px] cursor-pointer border ${
                profitFilter === "all"
                  ? "bg-[#171826] text-white border-[#171826] font-medium"
                  : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              Có nhà in: {profitStats.withHouse}
            </button>
            <button
              onClick={() => {
                setProfitFilter(profitFilter === "profit" ? "all" : "profit");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-[13px] cursor-pointer border font-medium ${
                profitFilter === "profit"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-emerald-600 border-emerald-200"
              }`}
            >
              🟢 Lãi: {profitStats.lai} đơn ({money(profitStats.totalLai)})
            </button>
            <button
              onClick={() => {
                setProfitFilter(profitFilter === "loss" ? "all" : "loss");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-[13px] cursor-pointer border font-medium ${
                profitFilter === "loss"
                  ? "bg-red-500 text-white border-red-500"
                  : "bg-white text-red-500 border-red-200"
              }`}
            >
              🔴 Lỗ: {profitStats.lo} đơn ({money(profitStats.totalLo)})
            </button>
            <span
              className={`px-3 py-1.5 rounded-lg text-[13px] font-bold border ${
                profitStats.net >= 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-red-50 text-red-600 border-red-200"
              }`}
            >
              Lãi ròng: {profitStats.net >= 0 ? "+" : "-"}
              {money(Math.abs(profitStats.net))}
            </span>
            {profitFilter !== "all" && (
              <span className="text-xs text-gray-400">
                Đang lọc: {visible.length} đơn
              </span>
            )}
          </div>

          <div
            className={`border border-gray-200 rounded-xl overflow-auto bg-white ${
              tableFull ? "max-h-[calc(100vh-160px)]" : "max-h-[72vh]"
            }`}
          >
            <table className="w-full text-[13px] border-collapse min-w-[900px]">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-gray-50">
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
                  <th
                    className="p-3 font-medium w-10"
                    style={{ position: "sticky", left: 0, top: 0, zIndex: 20 }}
                  >
                    <Checkbox
                      checked={allPageSelected}
                      indeterminate={!allPageSelected && somePageSelected}
                      onChange={(e) => togglePage(e.target.checked)}
                    />
                  </th>
                  <th
                    className="p-3 font-medium"
                    style={{ position: "sticky", left: 44, top: 0, zIndex: 20 }}
                  >
                    Mã Đơn / Trạng thái
                  </th>
                  <th className="p-3 font-medium">Shop & Khách</th>
                  <th className="p-3 font-medium">Ngày</th>
                  <th className="p-3 font-bold text-amber-700">
                    Sản phẩm Gốc
                  </th>
                  <th className="p-3 font-bold text-[#2563EB]">
                    Phôi Fulfill
                  </th>
                  <th className="p-3 font-medium">Vùng in</th>
                  <th className="p-3 font-medium">Thiết kế</th>
                  <th className="p-3 font-medium">Nhà In</th>
                  <th className="p-3 font-medium">Variant ID</th>
                  <th className="p-3 font-medium">DTF/DTG</th>
                  <th className="p-3 font-medium">Tracking</th>
                  <th className="p-3 font-medium">
                    <Tooltip title='Thông tin khách báo đổi — nhập ở ô "Add ID" bên tab Quản lý nhân viên'>
                      <span className="cursor-help">Đổi thông tin</span>
                    </Tooltip>
                  </th>
                  <th className="p-3 font-medium">
                    <Tooltip title="Đơn có ghi chú sẽ tô ĐỎ trong file gửi xưởng">
                      <span className="cursor-help">Note (vấn đề)</span>
                    </Tooltip>
                  </th>
                  <th className="p-3 font-medium">Nhân viên xử lý</th>
                  <th className="p-3 font-medium">Gửi xưởng</th>
                  <th className="p-3 font-medium text-right">Giá</th>
                  <th className="p-3 font-medium text-right">Phí</th>
                  <th className="p-3 font-medium text-right">Tổng</th>
                  <th className="p-3 font-medium text-right">Giá đối chiếu</th>
                  <th className="p-3 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((o) => {
                  const st = ORDER_STATUS[o.status];
                  const f = feesOf(o.userId);
                  const sel = selectedIds.includes(o.id);
                  const stickyBg = sel ? "#EFF4FF" : "#fff";
                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-gray-50 align-top ${
                        sel ? "bg-[#EFF4FF]" : ""
                      }`}
                    >
                      <td
                        className="p-3"
                        style={{
                          position: "sticky",
                          left: 0,
                          zIndex: 5,
                          background: stickyBg,
                        }}
                      >
                        <Checkbox
                          checked={sel}
                          onChange={(e) => toggleOne(o.id, e.target.checked)}
                        />
                      </td>
                      <td
                        className="p-3"
                        style={{
                          position: "sticky",
                          left: 44,
                          zIndex: 5,
                          background: stickyBg,
                        }}
                      >
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
                        <div className="text-gray-700">
                          {o.created
                            ? dayjs(o.created).format("DD/MM/YYYY")
                            : "—"}
                        </div>
                        <div className="mt-1">
                          {o.datePaid ? (
                            <span className="inline-block bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-md px-2 py-0.5 text-[11px]">
                              TT {dayjs(o.datePaid).format("D/M HH:mm")}
                            </span>
                          ) : o.status === "pending_payment" ? (
                            <span className="text-gray-400 italic text-[11px]">
                              Chưa thanh toán
                            </span>
                          ) : (
                            <span className="text-emerald-600 text-[11px]">
                              Đã thanh toán
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="space-y-1.5">
                          {(o.items || []).map((it, i) => {
                            // Bản GỐC khách up: ưu tiên field orig; fallback về
                            // productSku (KHÔNG dùng productName vì đó là tên
                            // listing dài, không phải Type)
                            const oType = it.origType ?? it.productSku ?? "";
                            // Tách size bị dính trong color (vd "Gildan 2XL")
                            const { color: oColor, size: oSize } =
                              splitSizeFromColor(
                                it.origColor ?? it.color,
                                it.origSize ?? it.size
                              );
                            const orig =
                              [
                                oType && `Type: ${oType}`,
                                oColor && `Color: ${oColor}`,
                                oSize && `Size: ${oSize}`,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—";
                            return (
                              <Tooltip key={i} title={orig} placement="top">
                                <div className="bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-medium rounded-lg px-3 py-1.5 max-w-[260px] truncate cursor-help">
                                  {orig}
                                </div>
                              </Tooltip>
                            );
                          })}
                          {!o.items?.length && (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {/* Phôi fulfill — bấm vào dòng mới hiện UI chỉnh sửa */}
                        <div className="space-y-1.5">
                          {(o.items || []).map((it, i) => (
                            <FulfillItemCell
                              key={i}
                              it={it}
                              blankName={blankName}
                              productOptions={productOptions}
                              colorOptions={colorOptions}
                              onPatch={(patch) => patchItem(o, i, patch)}
                            />
                          ))}
                          {!o.items?.length && (
                            <span className="bg-[#EFF4FF] text-[#2563EB] text-[11px] font-medium rounded px-2 py-0.5">
                              Unknown Product
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="space-y-1.5">
                          {(o.items || []).map((it, i) => (
                            <div key={i}>
                              <PrintAreaItemCell
                                it={it}
                                onPatch={(patch) => patchItem(o, i, patch)}
                              />
                            </div>
                          ))}
                          {!o.items?.length && (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {/* Thiết kế: ảnh + link ngay dưới + upload, sửa được */}
                        <div className="space-y-2">
                          {(o.items || []).map((it, i) => {
                            const bg = colorCss(it.color);
                            return (
                              <div key={i} className="space-y-1">
                                {(o.items?.length || 0) > 1 && (
                                  <div className="text-[9px] font-bold text-gray-400">
                                    SP{i + 1}
                                  </div>
                                )}
                                <DesignLinkCell
                                  label="FRONT"
                                  color="#2563EB"
                                  bg={bg}
                                  value={it.frontUrl}
                                  onCommit={(v) =>
                                    patchItem(o, i, { frontUrl: v })
                                  }
                                />
                                <DesignLinkCell
                                  label="BACK"
                                  color="#7C3AED"
                                  bg={bg}
                                  value={it.backUrl}
                                  onCommit={(v) =>
                                    patchItem(o, i, { backUrl: v })
                                  }
                                />
                                <DesignLinkCell
                                  label="MOCKUP"
                                  color="#B79351"
                                  bg={bg}
                                  value={it.mockupUrl}
                                  onCommit={(v) =>
                                    patchItem(o, i, { mockupUrl: v })
                                  }
                                />
                              </div>
                            );
                          })}
                          {!o.items?.length && (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <AutoComplete
                          key={o.printHouse || ""}
                          size="small"
                          placeholder="Nhà in..."
                          defaultValue={o.printHouse || ""}
                          className="w-[130px]"
                          options={printHouseOptions}
                          filterOption={(input, opt) =>
                            String(opt?.value || "")
                              .toLowerCase()
                              .includes(input.toLowerCase())
                          }
                          onSelect={(v) => {
                            if (v !== (o.printHouse || ""))
                              savePrintHouse(o, String(v));
                          }}
                          onBlur={(e) => {
                            const v = (
                              e.target as HTMLInputElement
                            ).value.trim();
                            if (v !== (o.printHouse || "")) savePrintHouse(o, v);
                          }}
                        />
                      </td>
                      <td className="p-3">
                        {/* Variant ID tự tra theo Nhà In + phôi/màu/size của từng món */}
                        <div className="space-y-1.5">
                          {(o.items || []).map((it, i) => {
                            const vid = findVariantId(o.printHouse, it);
                            return (
                              <div key={i} className="whitespace-nowrap">
                                {vid ? (
                                  <span className="font-mono text-[11px] bg-[#EFF4FF] text-[#2563EB] rounded px-1.5 py-0.5">
                                    {vid}
                                  </span>
                                ) : (
                                  <span className="text-gray-300 text-[11px] italic">
                                    {o.printHouse ? "Chưa có mã" : "—"}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {!o.items?.length && (
                            <span className="text-gray-300 text-[11px]">—</span>
                          )}
                        </div>
                      </td>
                      {/* DTF/DTG — field riêng, admin tự nhập */}
                      <td className="p-3">
                        <Input
                          key={o.dtfDtg || ""}
                          size="small"
                          placeholder="DTF/DTG..."
                          defaultValue={o.dtfDtg || ""}
                          className="w-[110px]"
                          onPressEnter={(e) =>
                            (e.target as HTMLInputElement).blur()
                          }
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (o.dtfDtg || "")) saveDtfDtg(o, v);
                          }}
                        />
                      </td>
                      <td className="p-3">
                        {/* Cho sửa tracking ở MỌI trạng thái đơn */}
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
                      </td>
                      {/* Đổi thông tin: ghi chú kèm mã đơn khách gửi trước (Add ID) */}
                      <td className="p-3">
                        {(() => {
                          const p = pendingByCode.get(
                            String(o.orderCode || "").trim().toLowerCase()
                          );
                          if (!p)
                            return (
                              <span className="text-gray-300 text-xs">—</span>
                            );
                          const done = !!p.ackAt;
                          return (
                            <div className="w-[190px]">
                              <div
                                className={`rounded-lg px-2 py-1.5 text-[12px] border ${
                                  done
                                    ? "bg-gray-50 border-gray-200 text-gray-500"
                                    : "bg-[#FDECEC] border-[#F5C2C2] text-[#B91C1C] font-semibold"
                                }`}
                              >
                                {p.note || "Khách báo đổi thông tin"}
                              </div>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {p.createdBy || "—"}
                                {p.created
                                  ? ` · ${dayjs(p.created).format(
                                      "DD/MM HH:mm"
                                    )}`
                                  : ""}
                              </div>
                              {!done && (
                                <button
                                  onClick={() =>
                                    pendingMut.update.mutate(
                                      {
                                        id: p.id,
                                        ackAt: new Date().toISOString(),
                                      },
                                      {
                                        onSuccess: () => {
                                          message.success(
                                            `Đã xác nhận xử lý đổi thông tin đơn ${o.orderCode}`
                                          );
                                        },
                                      }
                                    )
                                  }
                                  className="mt-1 text-[10px] text-gray-400 bg-transparent border-0 cursor-pointer underline p-0 hover:text-gray-600"
                                >
                                  Đánh dấu đã xử lý
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {/* Note vấn đề của đơn — có note thì file xuất tô ĐỎ */}
                      <td className="p-3">
                        <Input.TextArea
                          key={o.factoryNote || ""}
                          size="small"
                          placeholder="Đơn có vấn đề gì..."
                          defaultValue={o.factoryNote || ""}
                          autoSize={{ minRows: 1, maxRows: 3 }}
                          className="w-[190px]"
                          status={o.factoryNote ? "error" : undefined}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (o.factoryNote || ""))
                              saveFactoryNote(o, v);
                          }}
                        />
                      </td>
                      {/* Nhân viên xử lý — chọn từ danh sách hoặc gõ tay */}
                      <td className="p-3">
                        <Select
                          size="small"
                          className="w-[150px]"
                          placeholder="Chọn nhân viên"
                          allowClear
                          showSearch
                          value={o.csAssignee || undefined}
                          options={employees.map((e) => ({
                            value: e.name,
                            label: e.code ? `${e.name} (${e.code})` : e.name,
                          }))}
                          filterOption={(input, opt) =>
                            String(opt?.label || "")
                              .toLowerCase()
                              .includes(input.toLowerCase())
                          }
                          onChange={(v) => saveAssignee(o, String(v || ""))}
                        />
                      </td>
                      {/* Tình trạng gửi xưởng — tô màu giống file xuất */}
                      <td className="p-3 whitespace-nowrap">
                        {(() => {
                          const style = factoryRowStyle(o);
                          const map = {
                            red: { bg: "#FFD4D4", fg: "#B91C1C", label: "Có vấn đề" },
                            green: { bg: "#D7F5DF", fg: "#15803D", label: "Đã có track" },
                            yellow: { bg: "#FFF3C4", fg: "#B7791F", label: "Đã gửi xưởng" },
                            default: { bg: "#F3F4F6", fg: "#9CA3AF", label: "Chưa gửi" },
                            header: { bg: "#F3F4F6", fg: "#9CA3AF", label: "Chưa gửi" },
                          } as const;
                          const m = map[style];
                          return (
                            <Tooltip
                              title={
                                o.sentToFactoryAt
                                  ? `Đã đưa vào file xuất lúc ${dayjs(
                                      o.sentToFactoryAt
                                    ).format("DD/MM/YYYY HH:mm")}`
                                  : "Chưa có trong file xuất nào"
                              }
                            >
                              <span
                                className="inline-block text-[10px] font-bold rounded px-1.5 py-0.5"
                                style={{ background: m.bg, color: m.fg }}
                              >
                                {m.label}
                              </span>
                            </Tooltip>
                          );
                        })()}
                        {o.sentToFactoryAt ? (
                          <button
                            onClick={() => unmarkFactory(o)}
                            className="block mt-1 text-[10px] text-gray-400 bg-transparent border-0 cursor-pointer underline p-0 hover:text-gray-600"
                          >
                            Bỏ đánh dấu
                          </button>
                        ) : null}
                      </td>
                      <td className="p-3 text-right font-semibold whitespace-nowrap">
                        <Tooltip title={priceTooltip(o)}>
                          <span className="cursor-help inline-flex items-center gap-1">
                            <FiInfo size={12} className="text-gray-300" />
                            {money(o.total)}
                          </span>
                        </Tooltip>
                        {(() => {
                          const p = orderProfit(o);
                          if (!p.hasHouse) return null;
                          const win = p.profit >= 0;
                          return (
                            <Tooltip
                              title={`Đơn giá ${money(p.dono)} − Giá nhà in ${money(
                                p.house
                              )} = ${win ? "lợi nhuận" : "lỗ"} ${money(
                                Math.abs(p.profit)
                              )}`}
                            >
                              <div
                                className={`text-[11px] font-bold cursor-help ${
                                  win ? "text-emerald-600" : "text-red-500"
                                }`}
                              >
                                {win ? "LN +" : "Lỗ -"}
                                {money(Math.abs(p.profit))}
                              </div>
                            </Tooltip>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <Tooltip
                          title={
                            <div className="text-xs leading-5">
                              <div>Phí in thêm: +{money(f.markup)}</div>
                              <div>Phí xử lý đơn: +{money(f.perOrderFee)}</div>
                              <div>Ưu đãi: -{money(f.discount)}</div>
                            </div>
                          }
                        >
                          <span
                            className={`inline-flex items-center gap-1 cursor-help text-[12px] font-semibold ${
                              f.extra ? "text-orange-600" : "text-gray-300"
                            }`}
                          >
                            <FiInfo size={13} />
                            {f.extra < 0 ? "-" : "+"}
                            {money(Math.abs(f.extra))}
                          </span>
                        </Tooltip>
                      </td>
                      <td className="p-3 text-right font-bold whitespace-nowrap">
                        {money((o.total || 0) + f.extra)}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {(() => {
                          const grand = (o.total || 0) + f.extra;
                          const cp = o.comparePrice;
                          const hasCp = typeof cp === "number";
                          // Chênh lệch = Tổng − Giá đối chiếu
                          const diff = hasCp ? grand - (cp as number) : 0;
                          const pos = diff >= 0;
                          return (
                            <div className="inline-flex flex-col items-end gap-1">
                              <InputNumber
                                key={cp ?? ""}
                                defaultValue={cp ?? undefined}
                                controls={false}
                                prefix="$"
                                placeholder="Nhập giá"
                                className="w-[110px]"
                                onBlur={(e) => {
                                  const raw = (e.target as HTMLInputElement).value
                                    .replace(/[^0-9.\-]/g, "")
                                    .trim();
                                  const v = raw === "" ? null : Number(raw);
                                  if (v !== (cp ?? null)) saveComparePrice(o, v);
                                }}
                              />
                              {hasCp && (
                                <Tooltip
                                  title={
                                    <div className="text-xs leading-5">
                                      <div>Tổng đơn: {money(grand)}</div>
                                      <div>
                                        Giá đối chiếu: {money(cp as number)}
                                      </div>
                                      <div className="border-t border-white/20 my-1" />
                                      <div>
                                        Chênh lệch (Tổng − Giá đối chiếu):{" "}
                                        {pos ? "+" : "-"}
                                        {money(Math.abs(diff))} —{" "}
                                        {diff === 0
                                          ? "bằng nhau"
                                          : pos
                                          ? "Tổng CAO hơn giá đối chiếu"
                                          : "Tổng THẤP hơn giá đối chiếu"}
                                      </div>
                                    </div>
                                  }
                                >
                                  <span
                                    className={`text-[12px] font-bold cursor-help inline-flex items-center gap-1 ${
                                      pos ? "text-emerald-600" : "text-red-500"
                                    }`}
                                  >
                                    <FiInfo size={12} />
                                    {pos ? "+" : "-"}
                                    {money(Math.abs(diff))}
                                  </span>
                                </Tooltip>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <Tooltip title="Chi tiết đơn">
                            <button
                              onClick={() => setDetail(o)}
                              className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 inline-flex items-center justify-center cursor-pointer hover:bg-gray-100"
                            >
                              <FiEye size={14} />
                            </button>
                          </Tooltip>
                          {o.status === "pending_approval" && (
                            <Tooltip title="Duyệt đơn → Đang sản xuất">
                              <button
                                onClick={() => approve(o, "in_production")}
                                className="w-8 h-8 rounded-lg border-0 bg-[#171826] text-white inline-flex items-center justify-center cursor-pointer hover:bg-black"
                              >
                                <FiCheck size={14} />
                              </button>
                            </Tooltip>
                          )}
                          {o.status === "in_production" && (
                            <Tooltip title="Chuyển → Đang giao hàng">
                              <button
                                onClick={() => approve(o, "shipping")}
                                className="w-8 h-8 rounded-lg border border-[#B2EBF2] bg-[#E0F7FA] text-[#0E7490] inline-flex items-center justify-center cursor-pointer hover:bg-[#0E7490] hover:text-white"
                              >
                                <FiTruck size={14} />
                              </button>
                            </Tooltip>
                          )}
                          {o.status === "shipping" && (
                            <Tooltip title="Chuyển → Hoàn thành">
                              <button
                                onClick={() => approve(o, "completed")}
                                className="w-8 h-8 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 inline-flex items-center justify-center cursor-pointer hover:bg-emerald-600 hover:text-white"
                              >
                                <FiCheckCircle size={14} />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!paged.length && (
                  <tr>
                    <td colSpan={16} className="p-12 text-center text-gray-400">
                      Không có đơn hàng nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {visible.length > 0 && (
              <div className="flex items-center justify-between gap-3 flex-wrap p-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  Đang hiện {paged.length} / {visible.length} đơn · Trang {page}/
                  {totalPages}
                </span>
                <Pagination
                  current={page}
                  pageSize={pageSize}
                  total={visible.length}
                  showSizeChanger
                  pageSizeOptions={[20, 50, 100, 200, 500]}
                  showQuickJumper
                  showTotal={(t, [a, b]) => `${a}-${b} / ${t}`}
                  onChange={(p, ps) => {
                    // Đổi số dòng/trang -> về trang 1 để không bị nhảy lung tung
                    setPage(ps !== pageSize ? 1 : p);
                    setPageSize(ps);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal phân bổ Nhà In hàng loạt */}
      <Modal
        open={assignOpen}
        title={`Phân bổ ${selectedIds.length} đơn cho Nhà In`}
        okText="Phân bổ"
        cancelText="Hủy"
        okButtonProps={{ disabled: !assignHouse }}
        onOk={handleAssignPrinter}
        onCancel={() => {
          setAssignOpen(false);
          setAssignHouse(null);
        }}
      >
        <div className="pt-2">
          <div className="text-xs text-gray-500 mb-1">
            Chọn nhà in (quản lý danh mục ở tab Nhà In)
          </div>
          <Select
            className="w-full"
            placeholder="-- Chọn nhà in --"
            value={assignHouse || undefined}
            onChange={(v) => setAssignHouse(v)}
            options={printHouseOptions.map((o) => ({
              value: o.value,
              label: o.value,
            }))}
          />
          <p className="text-xs text-gray-400 mt-3 mb-0">
            Mỗi đơn sẽ được gán tên nhà in và tự đồng bộ phiếu in (mỗi sản phẩm
            1 dòng) sang tab Nhà In.
          </p>
        </div>
      </Modal>

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
                      className="border border-gray-200 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
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
                          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-4">
                            <span>
                              Variant ID:{" "}
                              <b className="font-mono text-[#2563EB]">
                                {findVariantId(detail.printHouse, it) ||
                                  (detail.printHouse
                                    ? "Chưa có mã"
                                    : "Chưa gán nhà in")}
                              </b>
                            </span>
                            <span>
                              Special Print:{" "}
                              <b
                                className={
                                  it.printArea === "special"
                                    ? "text-orange-600"
                                    : "text-gray-400"
                                }
                              >
                                {it.printArea === "special" ? "x" : "—"}
                              </b>
                            </span>
                          </div>
                          {productNote(it) && (
                            <div className="text-xs text-amber-600 mt-0.5">
                              Product Note: {productNote(it)}
                            </div>
                          )}
                        </div>
                        <b>{money((it.price || 0) * (it.quantity || 1))}</b>
                      </div>

                      {/* Design & Mockup — đúng các ô sẽ nằm trong file xưởng */}
                      <div className="grid grid-cols-2 gap-x-4 border-t border-gray-100 pt-2">
                        {[...DESIGN_FIELDS, ...MOCKUP_FIELDS].map((f) => {
                          const url = f.url(it);
                          return (
                            <div
                              key={f.label}
                              className="flex items-baseline gap-1 text-xs py-0.5"
                            >
                              <span className="text-gray-400 shrink-0 w-[120px]">
                                {f.label}
                              </span>
                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#2563EB] underline truncate"
                                  title={url}
                                >
                                  {url}
                                </a>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="border border-dashed border-gray-200 rounded-lg p-3 text-gray-400 italic">
                    Đơn chưa có sản phẩm chi tiết
                  </div>
                )}

                {/* 4 field admin tự nhập — đi thẳng vào file gửi xưởng */}
                <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="text-[11px] tracking-widest text-gray-400 font-medium">
                    ADMIN NHẬP (XUẤT RA FILE XƯỞNG)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">DTF/DTG</div>
                      <Input
                        key={`dtf-${detail.id}-${detail.dtfDtg || ""}`}
                        size="small"
                        placeholder="DTF/DTG..."
                        defaultValue={detail.dtfDtg || ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (detail.dtfDtg || ""))
                            saveDtfDtg(detail, v);
                        }}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Card Code</div>
                      <Input
                        key={`card-${detail.id}-${detail.cardCode || ""}`}
                        size="small"
                        placeholder="Card Code..."
                        defaultValue={detail.cardCode || ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (detail.cardCode || ""))
                            saveCardCode(detail, v);
                        }}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        Note (đơn có vấn đề)
                      </div>
                      <Input.TextArea
                        key={`note-${detail.id}-${detail.factoryNote || ""}`}
                        size="small"
                        placeholder="Đơn có vấn đề gì..."
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        defaultValue={detail.factoryNote || ""}
                        status={detail.factoryNote ? "error" : undefined}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (detail.factoryNote || ""))
                            saveFactoryNote(detail, v);
                        }}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        Nhân viên xử lý
                      </div>
                      <Select
                        size="small"
                        className="w-full"
                        placeholder="Chọn nhân viên"
                        allowClear
                        showSearch
                        value={detail.csAssignee || undefined}
                        options={employees.map((e) => ({
                          value: e.name,
                          label: e.code ? `${e.name} (${e.code})` : e.name,
                        }))}
                        filterOption={(input, opt) =>
                          String(opt?.label || "")
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                        onChange={(v) => saveAssignee(detail, String(v || ""))}
                      />
                    </div>
                  </div>
                </div>

                {(() => {
                  const f = feesOf(detail.userId);
                  return (
                    <div className="text-right space-y-0.5">
                      <div className="text-gray-500">
                        Giá đơn: {money(detail.total)}
                      </div>
                      {f.markup > 0 && (
                        <div className="text-emerald-600">
                          Phí in thêm (Markup): +{money(f.markup)}
                        </div>
                      )}
                      {f.perOrderFee > 0 && (
                        <div className="text-orange-600">
                          Phí xử lý đơn: +{money(f.perOrderFee)}
                        </div>
                      )}
                      {f.discount > 0 && (
                        <div className="text-violet-600">
                          Ưu đãi: -{money(f.discount)}
                        </div>
                      )}
                      <div className="font-bold text-base">
                        Tổng: {money((detail.total || 0) + f.extra)}
                      </div>
                    </div>
                  );
                })()}
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
            const revenue =
              sOrders.reduce((sum, o) => sum + (o.total || 0), 0) +
              ((s.markup || 0) + (s.perOrderFee || 0) - (s.discount || 0)) *
                sOrders.length;
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
                              description="Xoá shop sẽ xoá TẤT CẢ đơn và lô import của shop này. Không thể hoàn tác."
                              okText="Xóa"
                              cancelText="Hủy"
                              okButtonProps={{
                                danger: true,
                                loading: removeStore.isLoading,
                              }}
                              onConfirm={async () => {
                                const hide = message.loading(
                                  `Đang xoá shop "${st.name}" và đơn liên quan...`,
                                  0
                                );
                                try {
                                  const res = await removeStore.mutateAsync({
                                    storeId: st.id,
                                  });
                                  hide();
                                  message.success(
                                    `Đã xoá shop "${st.name}" — ${res.orders} đơn, ${res.queue} lô import`
                                  );
                                } catch (e) {
                                  hide();
                                  message.error("Xoá shop thất bại. Thử lại.");
                                }
                              }}
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
            {approvableSelected().length > 0 && (
              <Popconfirm
                title={`Duyệt ${approvableSelected().length} đơn chờ duyệt?`}
                description="Các đơn sẽ chuyển sang Đang sản xuất."
                okText="Duyệt"
                cancelText="Hủy"
                onConfirm={handleBulkApprove}
              >
                <button className="flex items-center gap-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer">
                  <FiCheckCircle size={15} /> Duyệt hàng loạt (
                  {approvableSelected().length})
                </button>
              </Popconfirm>
            )}
            {approvableSelected().length > 0 && (
              <Popconfirm
                title={`Hủy ${approvableSelected().length} đơn chờ duyệt?`}
                description="Các đơn sẽ chuyển sang Đã hủy."
                okText="Hủy đơn"
                cancelText="Đóng"
                okButtonProps={{ danger: true }}
                onConfirm={handleBulkCancel}
              >
                <button className="flex items-center gap-1.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer">
                  <FiXCircle size={15} /> Hủy hàng loạt (
                  {approvableSelected().length})
                </button>
              </Popconfirm>
            )}
            {supportSelected().length > 0 && (
              <Popconfirm
                title={`Duyệt đi lại ${supportSelected().length} đơn?`}
                description="Các đơn sẽ chuyển sang Đơn Reship (RS)."
                okText="Duyệt Reship"
                cancelText="Đóng"
                onConfirm={handleBulkReship}
              >
                <button className="flex items-center gap-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer">
                  <FiCheckCircle size={15} /> Duyệt đi lại đơn (Reship)
                </button>
              </Popconfirm>
            )}
            {supportSelected().length > 0 && (
              <Popconfirm
                title={`Hủy yêu cầu hỗ trợ của ${supportSelected().length} đơn?`}
                description="Đơn sẽ trả về trạng thái trước khi seller gửi yêu cầu."
                okText="Hủy yêu cầu"
                cancelText="Đóng"
                okButtonProps={{ danger: true }}
                onConfirm={handleBulkUnsupport}
              >
                <button className="flex items-center gap-1.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer">
                  <FiXCircle size={15} /> Hủy yêu cầu hỗ trợ
                </button>
              </Popconfirm>
            )}
            {reshipSelected().length > 0 && (
              <Popconfirm
                title={`Hủy ${reshipSelected().length} đơn Reship?`}
                description="Đơn sẽ trả về trạng thái trước khi có yêu cầu hỗ trợ/reship."
                okText="Hủy Reship"
                cancelText="Đóng"
                okButtonProps={{ danger: true }}
                onConfirm={handleBulkUnreship}
              >
                <button className="flex items-center gap-1.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer">
                  <FiXCircle size={15} /> Hủy đơn Reship
                </button>
              </Popconfirm>
            )}
            {revertableSelected().length > 0 && (
              <Popconfirm
                title={`Trả ${revertableSelected().length} đơn về trạng thái trước?`}
                description="Vd: Hoàn thành → Đang giao hàng, Đang giao hàng → Đang sản xuất..."
                okText="Trả lại"
                cancelText="Hủy"
                onConfirm={handleBulkRevert}
              >
                <button className="flex items-center gap-1.5 bg-[#374151] hover:bg-[#4B5563] text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer">
                  <FiRotateCcw size={15} /> Trả lại trạng thái trước
                </button>
              </Popconfirm>
            )}
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
              onClick={() => handleExportFactory(selectedOrders())}
              disabled={exportingFactory}
              className="flex items-center gap-1.5 bg-[#C6A15B] hover:bg-[#B79351] text-white text-sm font-medium rounded-lg px-3 py-2 border-0 cursor-pointer disabled:opacity-50"
            >
              <FiDownload size={15} /> Gửi xưởng (XLSX)
            </button>
            <button
              onClick={() => setAssignOpen(true)}
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
