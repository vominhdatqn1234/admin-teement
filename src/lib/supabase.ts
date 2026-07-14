/**
 * Supabase REST client (không cần dependency).
 * Flat mode: mỗi field là một cột thật trên bảng (không dùng data jsonb).
 */

export const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = process.env
  .REACT_APP_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.error(
    "Thiếu REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY trong .env"
  );
}

const baseHeaders: Record<string, string> = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

export interface SbFilter {
  column: string;
  op: string; // eq | neq | lt | lte | gt | gte | in
  value: any;
}

export interface SbSelectOptions {
  filters?: SbFilter[];
  order?: { column: string; ascending: boolean }[];
  limit?: number;
}

export type SbRow = { id: string } & Record<string, any>;

async function handle(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function buildQuery(options: SbSelectOptions): string {
  const params: string[] = ["select=*"];
  (options.filters || []).forEach((f) => {
    params.push(
      `${encodeURIComponent(f.column)}=${f.op}.${encodeURIComponent(
        String(f.value)
      )}`
    );
  });
  if (options.order && options.order.length) {
    const order = options.order
      .map((o) => `${o.column}.${o.ascending ? "asc" : "desc"}`)
      .join(",");
    params.push(`order=${encodeURIComponent(order)}`);
  }
  if (options.limit) params.push(`limit=${options.limit}`);
  return params.join("&");
}

export async function sbSelect(
  table: string,
  options: SbSelectOptions = {}
): Promise<SbRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${buildQuery(options)}`,
    { headers: baseHeaders }
  );
  return (await handle(res)) || [];
}

export async function sbSelectById(
  table: string,
  id: string
): Promise<SbRow | null> {
  const rows = await sbSelect(table, {
    filters: [{ column: "id", op: "eq", value: id }],
    limit: 1,
  });
  return rows[0] || null;
}

export async function sbInsert(table: string, rows: SbRow[]): Promise<SbRow[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      ...baseHeaders,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  return (await handle(res)) || [];
}

export async function sbUpsert(table: string, rows: SbRow[]): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`,
    {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(rows),
    }
  );
  await handle(res);
}

/** PATCH partial: chỉ update các cột có trong patch */
export async function sbUpdate(
  table: string,
  id: string,
  patch: Record<string, any>
): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { ...baseHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  );
  await handle(res);
}

export async function sbDelete(table: string, id: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: baseHeaders }
  );
  await handle(res);
}

/* ---------------- Storage ---------------- */

export const STORAGE_BUCKET = "uploads";

export async function sbStorageUpload(
  path: string,
  file: Blob
): Promise<void> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        ...baseHeaders,
        "x-upsert": "true",
        "Content-Type": (file as any).type || "application/octet-stream",
      },
      body: file,
    }
  );
  await handle(res);
}

export function sbStoragePublicUrl(path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}`;
}
