/**
 * Xuất file đơn cho XƯỞNG — MỖI NHÀ IN MỘT TEMPLATE RIÊNG, dựng đúng theo
 * file mẫu của từng nhà in:
 *
 *   - FlashShip : 32 cột "Order ID ... Card Code"  (sheet "Nhà In Flashship")
 *   - AK2       : 41 cột "Order Date ... Note"     (sheet "Nhà In AK2")
 *
 * Cả 2 template đều được nối thêm cột nội bộ "Nhân viên xử lý" (và "Note" nếu
 * template gốc chưa có) để theo dõi nội bộ.
 *
 * Mỗi SẢN PHẨM là 1 dòng (Order ID lặp lại). Hàng tiêu đề tô màu theo template;
 * dòng dữ liệu nền trắng, ô chứa link tự thành hyperlink bấm mở được.
 *
 * Danh sách xuất có nhiều nhà in -> tách thành nhiều file, mỗi nhà in 1 file.
 */
import dayjs from "dayjs";
import { OrderItem, PodOrder } from "../models/admin";
import { SheetRow, downloadXlsx } from "./xlsx";

/* ------------------------------ Helpers ------------------------------ */

const str = (v: any) => String(v || "").trim();

/** Tên nước dài -> mã 2 ký tự như file mẫu */
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
  const s = str(v);
  if (!s) return "";
  if (s.length === 2) return s.toUpperCase();
  return COUNTRY_CODE[s.toLowerCase()] || s;
}

/** Tách "Megan Strickland" -> { first: "Megan", last: "Strickland" } */
function splitName(full?: string): { first: string; last: string } {
  const parts = str(full).split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Tìm link theo tên vùng in phụ (Left Hand, Neck, Hood, Pocket...) */
function areaUrl(it: any, keys: string[]): string {
  const areas = Array.isArray(it?.extraAreas) ? it.extraAreas : [];
  const hit = areas.find((a: any) => {
    const n = String(a?.name || "").toLowerCase().replace(/[^a-z]/g, "");
    return keys.some((k) => n.includes(k));
  });
  return str(hit?.url);
}

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

export type FactoryRowState = "red" | "green" | "yellow" | "default";

/** Tình trạng đơn — dùng cho chip màu trên bảng admin (file xuất để nền trắng) */
export function factoryRowStyle(o: PodOrder): FactoryRowState {
  if (str(o.factoryNote)) return "red";
  if (str(o.tracking)) return "green";
  if (str(o.sentToFactoryAt)) return "yellow";
  return "default";
}

/* ------------------------------ Template ------------------------------ */

export interface FactoryExportOptions {
  /** Tra Variant ID / SKU theo Nhà In + phôi/màu/size của item */
  findVariantId: (house: string | undefined, it: OrderItem) => string;
  /** Đổi csAssignee thành "Phương(NV001)" — mặc định giữ nguyên tên */
  staffLabel?: (assignee?: string) => string;
}

export interface CellCtx {
  o: PodOrder;
  it: any;
  opts: FactoryExportOptions;
}

export interface FactoryColumn {
  header: string;
  /** Màu nền ô tiêu đề */
  fill: string;
  /** Màu chữ ô tiêu đề (mặc định đen) */
  headerColor?: string;
  width: number;
  value: (c: CellCtx) => string | number;
}

export interface FactoryTemplate {
  key: string;
  label: string;
  /** Khớp nhà in nào (so sánh sau khi bỏ dấu cách / ký tự đặc biệt) */
  match: string[];
  sheetName: string;
  filePrefix: string;
  columns: FactoryColumn[];
}

/* Màu tiêu đề: FlashShip theo đúng sheet gốc, AK2 dùng tông cam để phân biệt */
const FS = {
  amber: "#FFC000",
  peach: "#F4B183",
  cream: "#FDF2E3",
  white: "#FFFFFF",
  green: "#00FF00",
  yellow: "#FFFF00",
  red: "#FF0000",
  blue: "#DAE3F3",
  teal: "#4BACC6",
  note: "#D9D2E9",
  staff: "#D9EAD3",
};

/* AK2: toàn bộ tiêu đề nền ĐEN chữ TRẮNG như sheet gốc; riêng SKU chữ đỏ và
   2 cột Front/Back Design URL nền VÀNG chữ XANH. */
const AK = {
  head: "#000000",
  headText: "#FFFFFF",
  skuText: "#FF0000",
  designFill: "#FFFF00",
  designText: "#0000FF",
  staff: "#D9EAD3",
};

/** Vùng in -> kích thước in ghi cho xưởng (theo quy ước đang dùng) */
function printSize(it: any, has: boolean): string {
  if (!has) return "";
  if (it.printArea === "special") return "16x21";
  if (it.printArea === "full") return "16x21";
  return "14x16";
}

/* --------- Template FlashShip: đúng 32 cột của sheet "Nhà In Flashship" --------- */
const FLASHSHIP_COLUMNS: FactoryColumn[] = [
  { header: "Order ID", fill: FS.amber, width: 14, value: ({ o }) => o.orderCode || "" },
  { header: "Shipping method", fill: FS.cream, width: 8, value: () => 1 },
  { header: "Customer's name", fill: FS.white, width: 22, value: ({ o }) => o.customerName || "" },
  { header: "Email", fill: FS.cream, width: 24, value: ({ o }) => o.customerEmail || "" },
  { header: "Phone", fill: FS.cream, width: 14, value: ({ o }) => o.customerPhone || "" },
  { header: "Country", fill: FS.peach, width: 9, value: ({ o }) => countryCode(o.country) },
  { header: "State", fill: FS.peach, width: 8, value: ({ o }) => o.state || "" },
  { header: "Address line 1", fill: FS.peach, width: 30, value: ({ o }) => o.address1 || "" },
  { header: "Address line 2", fill: FS.peach, width: 16, value: ({ o }) => o.address2 || "" },
  { header: "City", fill: FS.peach, width: 18, value: ({ o }) => o.city || "" },
  { header: "Zip", fill: FS.peach, width: 12, value: ({ o }) => o.zip || "" },
  { header: "Link Label", fill: FS.green, width: 12, value: () => "" },
  { header: "Quantity", fill: FS.amber, width: 9, value: ({ it }) => Number(it.quantity || 1) },
  {
    header: "Variant ID",
    fill: FS.amber,
    width: 14,
    value: ({ o, it, opts }) => opts.findVariantId(o.printHouse, it),
  },
  ...DESIGN_FIELDS.map((f, i) => ({
    header: f.label,
    fill: i === 0 ? FS.yellow : i === 1 ? FS.red : FS.blue,
    width: i < 2 ? 34 : 18,
    value: ({ it }: CellCtx) => f.url(it),
  })),
  {
    header: "Special Print",
    fill: FS.teal,
    width: 12,
    value: ({ it }) =>
      it.printArea === "special" ? "x" : it.printArea === "full" ? "FULL" : "",
  },
  ...MOCKUP_FIELDS.map((f, i) => ({
    header: f.label,
    fill: i === 0 ? FS.red : FS.cream,
    width: i === 0 ? 34 : 18,
    value: ({ it }: CellCtx) => f.url(it),
  })),
  { header: "Product Note", fill: FS.cream, width: 24, value: ({ it }) => productNote(it) },
  { header: "DTF/DTG", fill: FS.cream, width: 10, value: ({ o }) => str(o.dtfDtg) },
  { header: "Card Code", fill: FS.cream, width: 12, value: ({ o }) => str(o.cardCode) },
  // 2 cột nội bộ
  { header: "Note", fill: FS.note, width: 28, value: ({ o }) => str(o.factoryNote) },
  {
    header: "Nhân viên xử lý",
    fill: FS.staff,
    width: 18,
    value: ({ o, opts }) =>
      opts.staffLabel ? opts.staffLabel(o.csAssignee) : str(o.csAssignee),
  },
];

/* ----------- Template AK2: đúng 41 cột của sheet "Nhà In AK2" ----------- */
const AK2_COLUMNS: FactoryColumn[] = [
  {
    header: "Order Date",
    fill: AK.head, headerColor: AK.headText,
    width: 12,
    value: ({ o }) => {
      const d = o.datePaid || o.created;
      return d ? dayjs(d).format("M/D/YYYY") : "";
    },
  },
  { header: "Order ID", fill: AK.head, headerColor: AK.headText, width: 14, value: ({ o }) => o.orderCode || "" },
  { header: "Order Source", fill: AK.head, headerColor: AK.headText, width: 12, value: () => "" },
  { header: "Shipping Address 1", fill: AK.head, headerColor: AK.headText, width: 30, value: ({ o }) => o.address1 || "" },
  { header: "Shipping Address 2", fill: AK.head, headerColor: AK.headText, width: 16, value: ({ o }) => o.address2 || "" },
  { header: "City", fill: AK.head, headerColor: AK.headText, width: 18, value: ({ o }) => o.city || "" },
  { header: "Country Code", fill: AK.head, headerColor: AK.headText, width: 12, value: ({ o }) => countryCode(o.country) },
  {
    header: "Customer First Name",
    fill: AK.head, headerColor: AK.headText,
    width: 18,
    value: ({ o }) => splitName(o.customerName).first,
  },
  {
    header: "Customer Last Name",
    fill: AK.head, headerColor: AK.headText,
    width: 18,
    value: ({ o }) => splitName(o.customerName).last,
  },
  {
    header: "Customer Phone Number",
    fill: AK.head, headerColor: AK.headText,
    width: 18,
    // File mẫu dùng số placeholder khi đơn không có SĐT
    value: ({ o }) => str(o.customerPhone) || "252525252525",
  },
  { header: "State or Region", fill: AK.head, headerColor: AK.headText, width: 14, value: ({ o }) => o.state || "" },
  { header: "Zip", fill: AK.head, headerColor: AK.headText, width: 12, value: ({ o }) => o.zip || "" },
  { header: "Shipping Method", fill: AK.head, headerColor: AK.headText, width: 14, value: () => "Standard" },
  { header: "Shipping Label URL", fill: AK.head, headerColor: AK.headText, width: 16, value: () => "" },
  { header: "Product Code", fill: AK.head, headerColor: AK.headText, width: 14, value: () => "" },
  { header: "Size", fill: AK.head, headerColor: AK.headText, width: 8, value: () => "" },
  { header: "Color", fill: AK.head, headerColor: AK.headText, width: 12, value: () => "" },
  {
    header: "SKU",
    fill: AK.head,
    headerColor: AK.skuText,
    width: 20,
    value: ({ o, it, opts }) => opts.findVariantId(o.printHouse, it),
  },
  { header: "Quantity", fill: AK.head, headerColor: AK.headText, width: 9, value: ({ it }) => Number(it.quantity || 1) },
  {
    header: "Front Design URL",
    fill: AK.designFill,
    headerColor: AK.designText,
    width: 34,
    value: ({ it }) => str(it.frontUrl),
  },
  {
    header: "Front Mockup URL",
    fill: AK.head, headerColor: AK.headText,
    width: 34,
    value: ({ it }) => (str(it.frontUrl) ? str(it.mockupUrl) : ""),
  },
  {
    header: "Back Design URL",
    fill: AK.designFill,
    headerColor: AK.designText,
    width: 34,
    value: ({ it }) => str(it.backUrl),
  },
  {
    header: "Back Mockup URL",
    fill: AK.head, headerColor: AK.headText,
    width: 34,
    value: ({ it }) => (str(it.backUrl) ? str(it.mockupUrl) : ""),
  },
  {
    header: "Left Sleeve Design URL",
    fill: AK.head, headerColor: AK.headText,
    width: 22,
    value: ({ it }) => areaUrl(it, ["lefthand", "leftsleeve", "left"]),
  },
  { header: "Left Sleeve Mockup URL", fill: AK.head, headerColor: AK.headText, width: 22, value: () => "" },
  {
    header: "Right Sleeve Design URL",
    fill: AK.head, headerColor: AK.headText,
    width: 22,
    value: ({ it }) => areaUrl(it, ["righthand", "rightsleeve", "right"]),
  },
  { header: "Right Sleeve Mockup URL", fill: AK.head, headerColor: AK.headText, width: 22, value: () => "" },
  { header: "Special Front Design URL", fill: AK.head, headerColor: AK.headText, width: 22, value: () => "" },
  { header: "Special Front Mockup URL", fill: AK.head, headerColor: AK.headText, width: 22, value: () => "" },
  { header: "Special Back Design URL", fill: AK.head, headerColor: AK.headText, width: 22, value: () => "" },
  { header: "Special Back Mockup URL", fill: AK.head, headerColor: AK.headText, width: 22, value: () => "" },
  { header: "Special Left Sleeve Design URL", fill: AK.head, headerColor: AK.headText, width: 22, value: () => "" },
  { header: "Special Left Sleeve Mockup URL", fill: AK.head, headerColor: AK.headText, width: 22, value: () => "" },
  { header: "Special Right Sleeve Design URL", fill: AK.head, headerColor: AK.headText, width: 22, value: () => "" },
  { header: "Special Right Sleeve Mockup URL", fill: AK.head, headerColor: AK.headText, width: 22, value: () => "" },
  {
    header: "Front Print Size",
    fill: AK.head, headerColor: AK.headText,
    width: 14,
    value: ({ it }) => printSize(it, !!str(it.frontUrl)),
  },
  {
    header: "Back Print Size",
    fill: AK.head, headerColor: AK.headText,
    width: 14,
    value: ({ it }) => printSize(it, !!str(it.backUrl)),
  },
  { header: "Producing Service", fill: AK.head, headerColor: AK.headText, width: 16, value: () => "Standard" },
  {
    header: "Technology",
    fill: AK.head, headerColor: AK.headText,
    width: 14,
    // DTF/DTG admin nhập -> "DTF Print" / "DTG Print"
    value: ({ o }) =>
      str(o.dtfDtg).toUpperCase().includes("DTF") ? "DTF Print" : "DTG Print",
  },
  { header: "Push Tracking", fill: AK.head, headerColor: AK.headText, width: 13, value: () => "No" },
  { header: "Note", fill: AK.head, headerColor: AK.headText, width: 28, value: ({ o }) => str(o.factoryNote) },
  // cột nội bộ
  {
    header: "Nhân viên xử lý",
    fill: AK.staff,
    width: 18,
    value: ({ o, opts }) =>
      opts.staffLabel ? opts.staffLabel(o.csAssignee) : str(o.csAssignee),
  },
];

export const FLASHSHIP_TEMPLATE: FactoryTemplate = {
  key: "flashship",
  label: "FlashShip",
  match: ["flashship", "flasship", "fashship", "flash"],
  sheetName: "Nhà In Flashship",
  filePrefix: "FlashShip",
  columns: FLASHSHIP_COLUMNS,
};

export const AK2_TEMPLATE: FactoryTemplate = {
  key: "ak2",
  label: "AK2",
  match: ["ak2", "a2k"],
  sheetName: "Nhà In AK2",
  filePrefix: "AK2",
  columns: AK2_COLUMNS,
};

/** Nhà in chưa có template riêng -> dùng mẫu FlashShip (32 cột quen thuộc) */
export const DEFAULT_TEMPLATE: FactoryTemplate = {
  ...FLASHSHIP_TEMPLATE,
  key: "standard",
  label: "Mẫu chuẩn",
  sheetName: "Orders",
  filePrefix: "don-gui-xuong",
};

export const FACTORY_TEMPLATES = [AK2_TEMPLATE, FLASHSHIP_TEMPLATE];

const normHouse = (s?: string) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Template dùng cho 1 nhà in (không khớp -> mẫu chuẩn) */
export function templateForHouse(house?: string): FactoryTemplate {
  const n = normHouse(house);
  if (!n) return DEFAULT_TEMPLATE;
  return (
    FACTORY_TEMPLATES.find((t) => t.match.some((m) => n.includes(m))) ||
    DEFAULT_TEMPLATE
  );
}

/* ------------------------------ Build & xuất ------------------------------ */

export function buildFactoryRows(
  orders: PodOrder[],
  tpl: FactoryTemplate,
  opts: FactoryExportOptions
): SheetRow[] {
  const rows: SheetRow[] = [
    tpl.columns.map((c) => ({
      value: c.header,
      fill: c.fill,
      fontColor: c.headerColor,
      bold: true,
    })),
  ];
  orders.forEach((o) => {
    const items: any[] =
      Array.isArray(o.items) && o.items.length ? o.items : [{}];
    items.forEach((it) => {
      rows.push(tpl.columns.map((c) => ({ value: c.value({ o, it, opts }) })));
    });
  });
  return rows;
}

export interface FactoryExportResult {
  files: { house: string; template: string; fileName: string; lines: number }[];
}

/**
 * Gom đơn theo NHÀ IN, mỗi nhà in xuất 1 file theo template của họ.
 */
export function exportFactoryXlsx(
  orders: PodOrder[],
  opts: FactoryExportOptions & { stamp?: string }
): FactoryExportResult {
  const stamp = opts.stamp || "";
  const groups = new Map<string, PodOrder[]>();
  orders.forEach((o) => {
    const key = str(o.printHouse) || "Chưa gán nhà in";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  });

  const files: FactoryExportResult["files"] = [];
  let delay = 0;
  groups.forEach((list, house) => {
    const realHouse = house === "Chưa gán nhà in" ? "" : house;
    const tpl = templateForHouse(realHouse);
    const rows = buildFactoryRows(list, tpl, opts);
    const safeHouse = house.replace(/[^a-zA-Z0-9-_]+/g, "-");
    const fileName = `${tpl.filePrefix}_${safeHouse}${
      stamp ? `_${stamp}` : ""
    }.xlsx`;
    // Trình duyệt chặn nhiều lần tải liên tiếp -> giãn mỗi file 300ms
    setTimeout(() => {
      downloadXlsx(fileName, rows, {
        sheetName: tpl.sheetName,
        widths: tpl.columns.map((c) => c.width),
      });
    }, delay);
    delay += 300;
    files.push({ house, template: tpl.label, fileName, lines: rows.length - 1 });
  });
  return { files };
}
