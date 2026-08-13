/**
 * Bộ xuất .xlsx tối giản, KHÔNG cần thư viện ngoài.
 *
 * Vì sao tự viết: cần tô màu nền từng dòng (CSV không lưu được màu) mà không
 * muốn thêm dependency nặng vào admin-portal. File tạo ra là .xlsx chuẩn
 * (OOXML trong ZIP), mở được bằng Excel và import thẳng vào Google Sheets.
 *
 * Hỗ trợ: 1 sheet, chuỗi inline, tô nền theo "style" đặt sẵn, freeze dòng
 * tiêu đề, auto filter, độ rộng cột.
 */

export interface SheetCell {
  value: string | number | null | undefined;
  /** Màu nền dạng "#RRGGBB" (bỏ trống = không tô) */
  fill?: string;
  bold?: boolean;
  underline?: boolean;
  /** Màu chữ dạng "#RRGGBB" */
  fontColor?: string;
  /**
   * Link ngoài cho ô. Bỏ trống mà giá trị bắt đầu bằng http(s) thì tự thành
   * link (xanh + gạch chân, bấm mở được).
   */
  link?: string;
}

const LINK_COLOR = "#0563C1";
const isUrl = (v: unknown) =>
  typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());

export type SheetRow = SheetCell[];

/* ------------------------------ XML helpers ------------------------------ */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function esc(s: string): string {
  return s
    // Bỏ ký tự điều khiển XML không cho phép (dữ liệu import đôi khi dính)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 0 -> A, 25 -> Z, 26 -> AA ... */
export function colName(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** "#RRGGBB" | "RRGGBB" | "FFRRGGBB" -> "FFRRGGBB" (ARGB của OOXML) */
function argb(hex?: string): string | null {
  if (!hex) return null;
  const h = hex.replace("#", "").trim().toUpperCase();
  if (h.length === 8) return h;
  if (h.length === 6) return `FF${h}`;
  return null;
}

/**
 * Gom style của mọi ô thành bảng fonts/fills/cellXfs.
 * Mỗi tổ hợp (nền, in đậm, màu chữ) chỉ sinh 1 xf và được tái sử dụng.
 */
class StyleRegistry {
  private fills: string[] = []; // ARGB, index thực = +2 (0 none, 1 gray125)
  private fonts: string[] = ["<font><sz val=\"11\"/><name val=\"Calibri\"/></font>"];
  private fontKeys = new Map<string, number>([["||", 0]]);
  private xfs = new Map<string, number>();
  private xfList: { fill: number; font: number }[] = [
    { fill: 0, font: 0 },
  ];

  /** Trả về chỉ số style (s=...) cho 1 ô */
  indexOf(cell: SheetCell): number {
    const fill = argb(cell.fill);
    const fontColor = argb(cell.fontColor);
    const key = `${fill || ""}|${cell.bold ? "b" : ""}${
      cell.underline ? "u" : ""
    }|${fontColor || ""}`;
    const cached = this.xfs.get(key);
    if (cached !== undefined) return cached;

    let fillIdx = 0;
    if (fill) {
      let at = this.fills.indexOf(fill);
      if (at < 0) at = this.fills.push(fill) - 1;
      fillIdx = at + 2;
    }

    const fontKey = `${cell.bold ? "b" : ""}|${cell.underline ? "u" : ""}|${
      fontColor || ""
    }`;
    let fontIdx = this.fontKeys.get(fontKey);
    if (fontIdx === undefined) {
      this.fonts.push(
        `<font>${cell.bold ? "<b/>" : ""}${
          cell.underline ? "<u/>" : ""
        }<sz val="11"/>${
          fontColor ? `<color rgb="${fontColor}"/>` : ""
        }<name val="Calibri"/></font>`
      );
      fontIdx = this.fonts.length - 1;
      this.fontKeys.set(fontKey, fontIdx);
    }

    const idx = this.xfList.push({ fill: fillIdx, font: fontIdx }) - 1;
    this.xfs.set(key, idx);
    return idx;
  }

  toXml(): string {
    const fills = [
      '<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>',
      ...this.fills.map(
        (c) =>
          `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`
      ),
    ];
    const xfs = this.xfList.map(
      (x) =>
        `<xf numFmtId="0" fontId="${x.font}" fillId="${x.fill}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>`
    );
    return `${XML_HEADER}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>
<fills count="${fills.length}">${fills.join("")}</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }
}

function sheetXml(
  rows: SheetRow[],
  styles: StyleRegistry,
  links: { ref: string; target: string }[],
  opts: { widths?: number[]; sheetName: string }
): string {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const cols = (opts.widths || []).length
    ? `<cols>${(opts.widths || [])
        .map(
          (w, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`
        )
        .join("")}</cols>`
    : "";
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((raw, c) => {
          const ref = `${colName(c)}${r + 1}`;
          // Ô là link -> tự tô xanh + gạch chân và ghi nhận để tạo hyperlink
          const target = raw.link || (isUrl(raw.value) ? String(raw.value).trim() : "");
          const cell: SheetCell = target
            ? {
                ...raw,
                underline: true,
                fontColor: raw.fontColor || LINK_COLOR,
              }
            : raw;
          if (target) links.push({ ref, target });
          const s = styles.indexOf(cell);
          const sAttr = s ? ` s="${s}"` : "";
          const v = cell.value;
          if (v === null || v === undefined || v === "")
            return `<c r="${ref}"${sAttr}/>`;
          if (typeof v === "number" && Number.isFinite(v))
            return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
          return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(
            String(v)
          )}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const filter =
    rows.length > 1 && maxCols
      ? `<autoFilter ref="A1:${colName(maxCols - 1)}${rows.length}"/>`
      : "";
  const hyperlinks = links.length
    ? `<hyperlinks>${links
        .map(
          (l, i) => `<hyperlink ref="${l.ref}" r:id="rId${i + 1}"/>`
        )
        .join("")}</hyperlinks>`
    : "";
  return `${XML_HEADER}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols}
<sheetData>${body}</sheetData>
${filter}
${hyperlinks}
</worksheet>`;
}

/* --------------------------------- ZIP ---------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u8(...bytes: number[]) {
  return new Uint8Array(bytes);
}
function u16(n: number) {
  return u8(n & 0xff, (n >>> 8) & 0xff);
}
function u32(n: number) {
  return u8(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}
function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(size);
  let off = 0;
  chunks.forEach((c) => {
    out.set(c, off);
    off += c.length;
  });
  return out;
}

/** ZIP không nén (method 0) — đủ cho file XML, tránh phải dùng thư viện nén */
function zip(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  files.forEach((f) => {
    const nameBytes = enc.encode(f.name);
    const dataBytes = enc.encode(f.data);
    const crc = crc32(dataBytes);
    const header = concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0x0800), // flag: tên file UTF-8
      u16(0), // method: store
      u16(0), // time
      u16(0x2100), // date (2016-01-01, cố định cho file ổn định)
      u32(crc),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    local.push(header, dataBytes);
    central.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0x2100),
        u32(crc),
        u32(dataBytes.length),
        u32(dataBytes.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ])
    );
    offset += header.length + dataBytes.length;
  });

  const centralBytes = concat(central);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBytes.length),
    u32(offset),
    u16(0),
  ]);
  return new Blob([concat(local), centralBytes, eocd], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* -------------------------------- Public -------------------------------- */

export function buildXlsx(
  rows: SheetRow[],
  opts: { sheetName?: string; widths?: number[] } = {}
): Blob {
  const sheetName = (opts.sheetName || "Sheet1").slice(0, 31);
  const styles = new StyleRegistry();
  const links: { ref: string; target: string }[] = [];
  // Phải sinh sheet TRƯỚC để gom đủ style + link rồi mới xuất styles/rels
  const sheet = sheetXml(rows, styles, links, {
    widths: opts.widths,
    sheetName,
  });
  const files: { name: string; data: string }[] = [];
  if (links.length) {
    files.push({
      name: "xl/worksheets/_rels/sheet1.xml.rels",
      data: `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${links
  .map(
    (l, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(
        l.target
      )}" TargetMode="External"/>`
  )
  .join("")}
</Relationships>`,
    });
  }
  return zip([
    ...files,
    {
      name: "[Content_Types].xml",
      data: `${XML_HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `${XML_HEADER}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: "xl/styles.xml", data: styles.toXml() },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
}

export function downloadXlsx(
  filename: string,
  rows: SheetRow[],
  opts: { sheetName?: string; widths?: number[] } = {}
) {
  const blob = buildXlsx(rows, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
