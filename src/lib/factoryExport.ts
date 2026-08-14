/**
 * Xuất file đơn cho XƯỞNG — đúng thứ tự cột của Google Sheet đang dùng,
 * cộng thêm 2 cột cuối: "Note" và "Nhân viên xử lý".
 *
 * Mỗi SẢN PHẨM là 1 dòng (Order ID lặp lại), giống sheet gốc.
 *
 * Chỉ hàng TIÊU ĐỀ được tô màu theo từng cột (giống sheet gốc); các dòng dữ
 * liệu để nền trắng cho dễ đọc. Ô chứa link (design/mockup) tự thành hyperlink
 * bấm mở được.
 *
 * Tình trạng "đã gửi xưởng / có tracking / có vấn đề" xem bằng chip màu ở cột
 * "Gửi xưởng" trên bảng admin.
 */
import { OrderItem, PodOrder } from "../models/admin";
import { SheetRow, downloadXlsx } from "./xlsx";

/** Bảng màu tiêu đề — copy theo đúng sheet xưởng đang dùng */
const HEAD = {
  amber: "#FFC000", // Order ID, Quantity, Variant ID
  peach: "#F4B183", // khối địa chỉ
  cream: "#FDF2E3", // các cột phụ / mockup
  white: "#FFFFFF", // Customer's name
  green: "#00FF00", // Link Label
  yellow: "#FFFF00", // Design front
  red: "#FF0000", // Design back, Mockup Front
  blue: "#DAE3F3", // các vùng in phụ
  teal: "#4BACC6", // Special Print
  note: "#D9D2E9", // Note (nội bộ)
  staff: "#D9EAD3", // Nhân viên xử lý (nội bộ)
};

/** Đúng 32 cột của sheet xưởng + 2 cột nội bộ, kèm màu tiêu đề */
export const FACTORY_COLUMNS: { header: string; fill: string }[] = [
  { header: "Order ID", fill: HEAD.amber },
  { header: "Shipping method", fill: HEAD.cream },
  { header: "Customer's name", fill: HEAD.white },
  { header: "Email", fill: HEAD.cream },
  { header: "Phone", fill: HEAD.cream },
  { header: "Country", fill: HEAD.peach },
  { header: "State", fill: HEAD.peach },
  { header: "Address line 1", fill: HEAD.peach },
  { header: "Address line 2", fill: HEAD.peach },
  { header: "City", fill: HEAD.peach },
  { header: "Zip", fill: HEAD.peach },
  { header: "Link Label", fill: HEAD.green },
  { header: "Quantity", fill: HEAD.amber },
  { header: "Variant ID", fill: HEAD.amber },
  { header: "Design front", fill: HEAD.yellow },
  { header: "Design back", fill: HEAD.red },
  { header: "Design Left Hand", fill: HEAD.blue },
  { header: "Design Right Hand", fill: HEAD.blue },
  { header: "Design Neck", fill: HEAD.blue },
  { header: "Design Hood", fill: HEAD.blue },
  { header: "Design Pocket", fill: HEAD.blue },
  { header: "Special Print", fill: HEAD.teal },
  { header: "Mockup Front", fill: HEAD.red },
  { header: "Mockup Back", fill: HEAD.cream },
  { header: "Mockup Left Hand", fill: HEAD.cream },
  { header: "Mockup Right Hand", fill: HEAD.cream },
  { header: "Mockup Neck", fill: HEAD.cream },
  { header: "Mockup Hood", fill: HEAD.cream },
  { header: "Mockup Pocket", fill: HEAD.cream },
  { header: "Product Note", fill: HEAD.cream },
  { header: "DTF/DTG", fill: HEAD.cream },
  { header: "Card Code", fill: HEAD.cream },
  // 2 cột thêm cho nội bộ
  { header: "Note", fill: HEAD.note },
  { header: "Nhân viên xử lý", fill: HEAD.staff },
];

export const FACTORY_HEADERS = FACTORY_COLUMNS.map((c) => c.header);

const WIDTHS = [
  14, 8, 22, 24, 14, 9, 8, 30, 16, 18, 12, 12, 9, 12, 34, 34, 18, 18, 14, 14,
  14, 12, 34, 20, 18, 18, 14, 14, 14, 24, 10, 12, 28, 18,
];

/** Tên nước dài -> mã 2 ký tự như sheet đang dùng */
const COUNTRY_CODE: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  us: "US",
  canada: "CA",
  "united kingdom": "GB",
  uk: "GB",
  australia: "AU",
  germany: "DE",
  france: "FR",
  italy: "IT",
  spain: "ES",
  netherlands: "NL",
  japan: "JP",
  vietnam: "VN",
  "viet nam": "VN",
};

function countryCode(v?: string): string {
  const s = (v || "").trim();
  if (!s) return "";
  if (s.length === 2) return s.toUpperCase();
  return COUNTRY_CODE[s.toLowerCase()] || s;
}

const str = (v: any) => String(v || "").trim();

/**
 * Định nghĩa các ô Design/Mockup — DÙNG CHUNG cho file xuất và modal chi tiết
 * đơn, để cái nhìn trên màn hình luôn khớp với cái gửi cho xưởng.
 */
export const DESIGN_FIELDS: { label: string; url: (it: any) => string }[] = [
  { label: "Design front", url: (it) => str(it.frontUrl) },
  { label: "Design back", url: (it) => str(it.backUrl) },
  {
    label: "Design Left Hand",
    url: (it) => areaUrl(it, ["lefthand", "leftsleeve", "left"]),
  },
  {
    label: "Design Right Hand",
    url: (it) => areaUrl(it, ["righthand", "rightsleeve", "right"]),
  },
  { label: "Design Neck", url: (it) => areaUrl(it, ["neck", "collar"]) },
  { label: "Design Hood", url: (it) => areaUrl(it, ["hood"]) },
  { label: "Design Pocket", url: (it) => areaUrl(it, ["pocket"]) },
];

export const MOCKUP_FIELDS: { label: string; url: (it: any) => string }[] = [
  { label: "Mockup Front", url: (it) => str(it.mockupUrl) },
  { label: "Mockup Back", url: () => "" },
  { label: "Mockup Left Hand", url: () => "" },
  { label: "Mockup Right Hand", url: () => "" },
  { label: "Mockup Neck", url: () => "" },
  { label: "Mockup Hood", url: () => "" },
  { label: "Mockup Pocket", url: () => "" },
];

/** Product Note của 1 item — giống hệt ô trong file xuất */
export function productNote(it: any): string {
  return [it?.note, it?.personalization && `Personalization: ${it.personalization}`]
    .filter(Boolean)
    .join(" | ");
}

/** Tìm link theo tên vùng in phụ (Left Hand, Neck, Hood, Pocket...) */
function areaUrl(it: any, keys: string[]): string {
  const areas = Array.isArray(it?.extraAreas) ? it.extraAreas : [];
  const hit = areas.find((a: any) => {
    const n = String(a?.name || "").toLowerCase().replace(/[^a-z]/g, "");
    return keys.some((k) => n.includes(k));
  });
  return String(hit?.url || "").trim();
}

export type FactoryRowState = "red" | "green" | "yellow" | "default";

/** Tình trạng đơn — dùng cho chip màu trên bảng admin (file xuất để nền trắng) */
export function factoryRowStyle(o: PodOrder): FactoryRowState {
  if (String(o.factoryNote || "").trim()) return "red";
  if (String(o.tracking || "").trim()) return "green";
  if (String(o.sentToFactoryAt || "").trim()) return "yellow";
  return "default";
}

export interface FactoryExportOptions {
  /** Tra Variant ID theo Nhà In + phôi/màu/size của item */
  findVariantId: (house: string | undefined, it: OrderItem) => string;
  /** Đổi csAssignee thành "Phương(NV001)" — mặc định giữ nguyên tên */
  staffLabel?: (assignee?: string) => string;
  fileName?: string;
}

export function buildFactoryRows(
  orders: PodOrder[],
  opts: FactoryExportOptions
): SheetRow[] {
  const rows: SheetRow[] = [
    FACTORY_COLUMNS.map((c) => ({
      value: c.header,
      fill: c.fill,
      bold: true,
    })),
  ];

  orders.forEach((o) => {
    const items: any[] = Array.isArray(o.items) && o.items.length ? o.items : [{}];
    items.forEach((it) => {
      const values: (string | number)[] = [
        o.orderCode || "",
        1, // Shipping method — sheet đang dùng cố định 1 (standard)
        o.customerName || "",
        o.customerEmail || "",
        o.customerPhone || "",
        countryCode(o.country),
        o.state || "",
        o.address1 || "",
        o.address2 || "",
        o.city || "",
        o.zip || "",
        "", // Link Label — xưởng tự điền khi mua label
        Number(it.quantity || 1),
        opts.findVariantId(o.printHouse, it),
        ...DESIGN_FIELDS.map((f) => f.url(it)),
        it.printArea === "special" ? "x" : it.printArea === "full" ? "FULL" : "",
        ...MOCKUP_FIELDS.map((f) => f.url(it)),
        productNote(it),
        str(o.dtfDtg), // DTF/DTG — admin nhập
        str(o.cardCode), // Card Code — admin nhập
        str(o.factoryNote),
        // Nhân viên xử lý kèm mã: "Phương(NV001)"
        opts.staffLabel ? opts.staffLabel(o.csAssignee) : str(o.csAssignee),
      ];
      // Dòng dữ liệu để nền trắng; ô nào là link sẽ tự thành hyperlink
      rows.push(values.map((value) => ({ value })));
    });
  });

  return rows;
}

export function exportFactoryXlsx(
  orders: PodOrder[],
  opts: FactoryExportOptions
) {
  const rows = buildFactoryRows(orders, opts);
  downloadXlsx(opts.fileName || "don-gui-xuong.xlsx", rows, {
    sheetName: "Orders",
    widths: WIDTHS,
  });
  return rows.length - 1; // số dòng sản phẩm đã xuất
}
