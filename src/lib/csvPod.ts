/** CSV helpers cho POD portal (parse có quote + xuất file) */

export function parseCSV(text: string): Record<string, string>[] {
  text = text.replace(/^\uFEFF/, ""); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((x) => x !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h.trim()] = (r[i] ?? "").trim()));
    return obj;
  });
}

export function toCSV(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join(
    "\n"
  );
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse Variations của Etsy: "Unisex shirt size:L US letter,Personalization:Merced -10" */
export function parseVariations(v: string): {
  color: string;
  size: string;
  personalization: string;
} {
  const out = { color: "", size: "", personalization: "" };
  (v || "").split(",").forEach((part) => {
    const idx = part.indexOf(":");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (key.includes("color")) out.color = value;
    else if (key.includes("size")) out.size = value;
    else if (key.includes("personalization")) out.personalization = value;
  });
  return out;
}
