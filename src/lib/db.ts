/**
 * Firestore-compatible API chạy trên Supabase — FLAT MODE.
 * Mỗi field của document = một cột thật trên bảng (không dùng data jsonb).
 * Giữ nguyên API: collection, doc, query, where, orderBy, limit,
 *                 getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc
 */
import {
  sbDelete,
  sbInsert,
  sbSelect,
  sbSelectById,
  sbUpdate,
  sbUpsert,
  SbFilter,
  SbRow,
} from "./supabase";

/* ---------------- Types / references ---------------- */

export type Firestore = { __type: "firestore" };

export interface CollectionReference {
  __type: "collection";
  table: string;
}

export interface DocumentReference {
  __type: "doc";
  table: string;
  id: string;
}

interface WhereConstraint {
  __type: "where";
  field: string;
  op: string;
  value: any;
}
interface OrderByConstraint {
  __type: "orderBy";
  field: string;
  ascending: boolean;
}
interface LimitConstraint {
  __type: "limit";
  n: number;
}
export type QueryConstraint =
  | WhereConstraint
  | OrderByConstraint
  | LimitConstraint;

export interface Query {
  __type: "query";
  table: string;
  constraints: QueryConstraint[];
}

/* ---------------- Snapshots ---------------- */

function rowToData(row: SbRow): Record<string, any> {
  const { id, created_at, ...fields } = row;
  return fields;
}

export class DocumentSnapshot {
  readonly id: string;
  private readonly _data: Record<string, any> | undefined;

  constructor(id: string, data?: Record<string, any>) {
    this.id = id;
    this._data = data;
  }
  data(): any {
    return this._data;
  }
  exists(): boolean {
    return this._data !== undefined;
  }
}

export class QuerySnapshot {
  readonly docs: DocumentSnapshot[];

  constructor(docs: DocumentSnapshot[]) {
    this.docs = docs;
  }
  get empty(): boolean {
    return this.docs.length === 0;
  }
  get size(): number {
    return this.docs.length;
  }
  forEach(callback: (doc: DocumentSnapshot) => void): void {
    this.docs.forEach(callback);
  }
}

/* ---------------- API ---------------- */

export const firestoreInstance: Firestore = { __type: "firestore" };

export function getFirestore(_app?: any): Firestore {
  return firestoreInstance;
}

export function collection(
  _db: Firestore | any,
  name: string
): CollectionReference {
  return { __type: "collection", table: name };
}

export function doc(
  ref: CollectionReference | Firestore | any,
  path?: string,
  ...pathSegments: (string | undefined)[]
): DocumentReference {
  if (ref && ref.__type === "collection") {
    return { __type: "doc", table: ref.table, id: path as string };
  }
  return { __type: "doc", table: path as string, id: pathSegments[0] as string };
}

const OP_MAP: Record<string, string> = {
  "==": "eq",
  "!=": "neq",
  "<": "lt",
  "<=": "lte",
  ">": "gt",
  ">=": "gte",
  in: "in",
};

export function where(
  field: string,
  op: string,
  value: any
): WhereConstraint {
  return { __type: "where", field, op, value };
}

export function orderBy(
  field: string,
  direction: "asc" | "desc" = "asc"
): OrderByConstraint {
  return { __type: "orderBy", field, ascending: direction !== "desc" };
}

export function limit(n: number): LimitConstraint {
  return { __type: "limit", n };
}

export function query(
  ref: CollectionReference | Query,
  ...constraints: QueryConstraint[]
): Query {
  const table = (ref as any).table;
  const prev = (ref as any).constraints || [];
  return { __type: "query", table, constraints: [...prev, ...constraints] };
}

export async function getDocs(
  ref: Query | CollectionReference
): Promise<QuerySnapshot> {
  const constraints: QueryConstraint[] = (ref as any).constraints || [];
  const filters: SbFilter[] = [];
  const order: { column: string; ascending: boolean }[] = [];
  let limitN: number | undefined;

  constraints.forEach((c) => {
    if (c.__type === "where") {
      const op = OP_MAP[c.op];
      if (!op) throw new Error(`Toán tử chưa hỗ trợ: ${c.op}`);
      const value =
        op === "in" ? `(${(c.value as any[]).join(",")})` : c.value;
      filters.push({ column: c.field, op, value });
    } else if (c.__type === "orderBy") {
      order.push({ column: c.field, ascending: c.ascending });
    } else if (c.__type === "limit") {
      limitN = c.n;
    }
  });

  const rows = await sbSelect((ref as any).table, {
    filters,
    order,
    limit: limitN,
  });
  return new QuerySnapshot(
    rows.map((r) => new DocumentSnapshot(r.id, rowToData(r)))
  );
}

export async function getDoc(
  ref: DocumentReference
): Promise<DocumentSnapshot> {
  const row = await sbSelectById(ref.table, ref.id);
  return new DocumentSnapshot(ref.id, row ? rowToData(row) : undefined);
}

function generateId(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 20; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export async function addDoc(
  ref: CollectionReference,
  data: Record<string, any>
): Promise<DocumentReference> {
  const id = generateId();
  await sbInsert(ref.table, [{ id, ...sanitize(data) }]);
  return { __type: "doc", table: ref.table, id };
}

export async function setDoc(
  ref: DocumentReference,
  data: Record<string, any>
): Promise<void> {
  await sbUpsert(ref.table, [{ id: ref.id, ...sanitize(data) }]);
}

/** PATCH partial — chỉ update các cột có trong patch (không cần đọc-merge) */
export async function updateDoc(
  ref: DocumentReference,
  patch: Record<string, any>
): Promise<void> {
  const clean = sanitize(patch);
  delete clean.id;
  delete clean.created_at;
  await sbUpdate(ref.table, ref.id, clean);
}

export async function deleteDoc(ref: DocumentReference): Promise<void> {
  await sbDelete(ref.table, ref.id);
}

// Loại bỏ undefined (JSON không hỗ trợ)
function sanitize(obj: Record<string, any>): Record<string, any> {
  return JSON.parse(JSON.stringify(obj === undefined ? {} : obj));
}
