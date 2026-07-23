export interface Seller {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  permission?: string;
  markup?: number;
  perOrderFee?: number;
  discount?: number;
  created?: string;
}

export interface Store {
  id: string;
  name: string;
  systemCode?: string;
  status: "active" | "locked";
  lockedBy?: "admin" | "seller" | null; // ai khóa shop
  logo?: string;
  taxCode?: string;
  userId?: string;
  created?: string;
  /** Phí do admin nhập cho từng shop (hiển thị trên Overview seller theo shop) */
  designSupportFee?: number; // Hỗ trợ design ($)
  mgmtFee?: number; // Chi phí quản lý ($)
  discountAmount?: number; // Mức chiết khấu ($)
}

export interface OrderItem {
  productName?: string;
  productSku?: string;
  sku?: string;
  color?: string;
  size?: string;
  /** Bản GỐC khách up lên (Etsy) — giữ nguyên, không đổi khi seller chọn phôi */
  origTitle?: string;
  origType?: string;
  origColor?: string;
  origSize?: string;
  /** Vùng in: "" = Mặc định, "special" = Vùng in đặc biệt 16*21 (+$2/sp) */
  printArea?: string;
  personalization?: string;
  quantity: number;
  price: number;
  frontUrl?: string;
  backUrl?: string;
  mockupUrl?: string;
  note?: string;
}

export interface PodOrder {
  id: string;
  orderCode: string;
  storeId?: string;
  storeName?: string;
  status: string;
  tracking?: string;
  printHouse?: string; // Nhà In được phân bổ
  source?: string;
  userId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  items: OrderItem[];
  note?: string;
  total: number;
  created: string;
  /** Hạn giao Etsy (Scheduled to ship by) */
  shipBy?: string | null;
  datePaid?: string | null;
  dateShipped?: string | null;
  /** Trạng thái trước khi gửi Yêu cầu Hỗ trợ */
  prevStatus?: string | null;
}

export interface LedgerEntry {
  id: string;
  txnId?: string;
  sellerId?: string;
  sellerName?: string;
  storeId?: string;
  storeName?: string;
  period?: string;
  orderCount?: number;
  amount: number;
  note?: string;
  created?: string;
}

export interface ShippingPrice {
  id: string;
  region?: string;
  method?: string;
  firstItem?: number;
  additionalItem?: number;
  estimatedDays?: string;
  note?: string;
  created?: string;
}

export interface DesignRequest {
  id: string;
  sellerId?: string;
  sellerName?: string;
  title?: string;
  description?: string;
  referenceUrl?: string;
  resultUrl?: string;
  status: "pending" | "in_progress" | "done" | "cancelled";
  price?: number;
  created?: string;
}

export interface ServiceItem {
  id: string;
  title?: string;
  description?: string;
  tags?: string[];
  hot?: boolean;
  active?: boolean;
  icon?: string; // mã SVG thuần
  created?: string;
}

export interface PodPrice {
  id: string;
  productType: string; // Loại Sản Phẩm
  size: string; // Size
  baseCost: number; // Giá Gốc (Base Cost)
  extraPrintFee: number; // Phí In Mặt Phụ (in thêm/mặt)
  created?: string;
}

export interface BaseProduct {
  id: string;
  name: string;
  sku: string;
  category?: string;
  baseCost: number;
  inStock: boolean;
  image?: string;
  colors?: string[];
  sizes?: string[];
  material?: string; // chất liệu
  specs?: string; // mô tả thông số chi tiết
  created?: string;
}

/** Biến thể phôi theo file "Giá Sản Phẩm Teement": Sản phẩm × Màu × Size + các loại giá */
export interface PodVariant {
  id: string;
  product: string;
  color?: string;
  size?: string;
  price?: number; // Giá
  shipPrice?: number; // Giá ship
  printOneSide?: number; // In 1 mặt
  printExtraArea?: number; // In vùng phụ
  priceAK2?: number; // Giá AK2
  priceFashship?: number; // Giá Fashship
  price3D?: number; // Giá 3D
  priceTeement?: number; // Giá Teement
  created?: string;
}

/** Danh mục Nhà In (tên nhà in để phân bổ đơn) */
export interface PrintHouseItem {
  id: string;
  name: string;
  created?: string;
}

/**
 * Data SKU riêng của từng Nhà In (import từ file SK2).
 * Key tra cứu: printHouse + brand (=tên sản phẩm) + color + size → variantId.
 */
export interface PrintHouseSku {
  id: string;
  printHouse: string; // tên nhà in sở hữu data này
  productName?: string;
  style?: string;
  brand: string; // tương ứng tên sản phẩm
  color?: string;
  size?: string;
  variantId: string;
  created?: string;
}

/** Tracking vận chuyển: Order ID -> mã tracking + nhà vận chuyển */
export interface TrackingRow {
  id: string;
  orderId?: string;
  tracking?: string;
  carrier?: string;
  created?: string;
}

/** Đơn gửi Nhà In (định dạng file "Nhà In AK2") */
export interface PrintOrder {
  id: string;
  orderDate?: string;
  orderId?: string;
  orderSource?: string;
  address1?: string;
  address2?: string;
  city?: string;
  countryCode?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  state?: string;
  zip?: string;
  shippingMethod?: string;
  shippingLabelUrl?: string;
  productCode?: string;
  size?: string;
  color?: string;
  sku?: string;
  quantity?: number;
  frontDesignUrl?: string;
  frontMockupUrl?: string;
  backDesignUrl?: string;
  backMockupUrl?: string;
  leftSleeveDesignUrl?: string;
  leftSleeveMockupUrl?: string;
  rightSleeveDesignUrl?: string;
  rightSleeveMockupUrl?: string;
  specialFrontDesignUrl?: string;
  specialFrontMockupUrl?: string;
  specialBackDesignUrl?: string;
  specialBackMockupUrl?: string;
  specialLeftSleeveDesignUrl?: string;
  specialLeftSleeveMockupUrl?: string;
  specialRightSleeveDesignUrl?: string;
  specialRightSleeveMockupUrl?: string;
  frontPrintSize?: string;
  backPrintSize?: string;
  producingService?: string;
  technology?: string;
  pushTracking?: string;
  note?: string;
  /** Nhà in được phân bổ (đồng bộ từ Quản lý Seller) */
  printHouse?: string;
  created?: string;
}

/** Mã màu phôi: tên màu (Black, Dark heather...) -> hex, dùng làm nền thiết kế */
export interface PodColor {
  id: string;
  name: string;
  hex: string;
  created?: string;
}

export const ORDER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: "Chưa thanh toán", color: "#B7791F", bg: "#FEF9E7" },
  pending_approval: { label: "Chờ duyệt", color: "#6B46C1", bg: "#F3EBFF" },
  in_production: { label: "Đang sản xuất", color: "#2563EB", bg: "#EBF2FF" },
  shipping: { label: "Đang giao hàng", color: "#0E7490", bg: "#E0F7FA" },
  completed: { label: "Hoàn thành", color: "#15803D", bg: "#E8F7EC" },
  cancelled: { label: "Đã hủy", color: "#B91C1C", bg: "#FDECEC" },
  support: { label: "Yêu cầu Hỗ trợ", color: "#C2410C", bg: "#FFF1E7" },
  reship: { label: "Đơn Reship", color: "#4338CA", bg: "#EEF0FF" },
  refund: { label: "Hoàn tiền", color: "#BE123C", bg: "#FFE4E6" },
};

/** Trạng thái được tính là đơn thành công (đã thanh toán trở đi) */
export const PAID_STATUSES = [
  "pending_approval",
  "in_production",
  "shipping",
  "completed",
  "reship",
  "support",
];
