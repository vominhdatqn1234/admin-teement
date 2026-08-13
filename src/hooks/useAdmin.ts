/** Data hooks cho Admin Portal — chạy trên Supabase qua lib/db (flat mode) */
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  firestoreInstance as db,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "../lib/db";
import { sbSelectAll, sbDeleteMany, sbUpsert } from "../lib/supabase";
import {
  BaseProduct,
  DesignRequest,
  ImportBatch,
  LedgerEntry,
  PodColor,
  PodOrder,
  CsEmployee,
  PendingOrderId,
  PodPrice,
  PodVariant,
  PrintHouseItem,
  PrintHouseSku,
  PrintOrder,
  TrackingRow,
  Seller,
  ServiceItem,
  ShippingPrice,
  Store,
} from "../models/admin";

const sellersRef = collection(db, "employee");
const storesRef = collection(db, "stores");
const ordersRef = collection(db, "podOrders");
const ledgerRef = collection(db, "ledgerEntries");
const shippingRef = collection(db, "shippingPrices");
const designReqRef = collection(db, "designRequests");
const servicesRef = collection(db, "services");
const productsRef = collection(db, "baseProducts");
const podPricesRef = collection(db, "podPrices");
const colorsRef = collection(db, "podColors");
const variantsRef = collection(db, "podVariants");
const printOrdersRef = collection(db, "printOrders");
const trackingsRef = collection(db, "trackings");
const printHousesRef = collection(db, "printHouses");
const printHouseSkusRef = collection(db, "printHouseSkus");
const importQueueRef = collection(db, "podImportQueue");

// Sinh id ngẫu nhiên cho dòng import chưa có id.
function genId(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 20; i++)
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function toList<T>(snapshot: any): T[] {
  const out: T[] = [];
  snapshot?.forEach((d: any) => out.push({ id: d.id, ...d.data() }));
  return out;
}

function crud(ref: any, key: string) {
  return function useCrud() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries([key]);
    const add = useMutation((data: any) => addDoc(ref, data), {
      onSuccess: invalidate,
    });
    const update = useMutation(
      ({ id, ...data }: any) => updateDoc(doc(ref, id), data),
      { onSuccess: invalidate }
    );
    const remove = useMutation((id: string) => deleteDoc(doc(ref, id)), {
      onSuccess: invalidate,
    });
    const removeMany = useMutation(
      async (
        arg:
          | string[]
          | { ids: string[]; onProgress?: (done: number, total: number) => void }
      ) => {
        const ids = Array.isArray(arg) ? arg : arg.ids;
        const onProgress = Array.isArray(arg) ? undefined : arg.onProgress;
        // Xoá hàng loạt trong ít request nhất (id=in.(...)) -> nhanh hơn nhiều.
        await sbDeleteMany(ref.table, ids, onProgress);
      },
      { onSuccess: invalidate }
    );
    return { add, update, remove, removeMany };
  };
}

/* ---------- Sellers (employee) ---------- */
export function useSellers() {
  const q = useQuery(["adm-sellers"], () =>
    getDocs(query(sellersRef, orderBy("created", "desc")))
  );
  return { ...q, sellers: toList<Seller>(q.data) };
}
export const useSellerMutations = crud(sellersRef, "adm-sellers");

/**
 * Xóa seller kèm cascade: xoá TẤT CẢ đơn (podOrders) và các lô import PDF
 * chờ duyệt (podImportQueue) của seller đó, rồi mới xoá bản ghi seller.
 */
export function useSellerCascade() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries(["adm-sellers"]);
    qc.invalidateQueries(["adm-orders"]);
    qc.invalidateQueries(["adm-import-queue"]);
  };

  const removeSeller = useMutation(
    async ({
      id,
      onProgress,
    }: {
      id: string;
      onProgress?: (done: number, total: number) => void;
    }) => {
      // Sở hữu đơn xác định qua SHOP: đơn thuộc seller nếu shop của đơn thuộc
      // seller. KHÔNG dùng userId để nhận sở hữu, vì userId là tài khoản ĐÃ
      // IMPORT đơn (một người có thể import hộ shop của seller khác) -> nếu xoá
      // theo userId sẽ xoá nhầm đơn của seller khác.
      const allStores = await sbSelectAll("stores");
      const storeIds = new Set(
        allStores.filter((s: any) => s.userId === id).map((s: any) => s.id)
      );
      const belongs = (row: any) =>
        row.storeId ? storeIds.has(row.storeId) : row.userId === id;

      // 1) Toàn bộ đơn của seller (khớp userId HOẶC storeId) — không giới hạn 1000.
      const allOrders = await sbSelectAll("podOrders");
      const orderIds = allOrders.filter(belongs).map((o: any) => o.id);
      // 2) Các lô import PDF của seller.
      const allQueue = await sbSelectAll("podImportQueue");
      const queueIds = allQueue.filter(belongs).map((q: any) => q.id);

      const total = orderIds.length + queueIds.length + 1;
      // Xoá hàng loạt trong ít request nhất thay vì từng đơn một.
      await sbDeleteMany("podOrders", orderIds, (d) => onProgress?.(d, total));
      await sbDeleteMany("podImportQueue", queueIds, (d) =>
        onProgress?.(orderIds.length + d, total)
      );
      // 3) Xoá seller sau cùng -> lần guard kế tiếp bên client sẽ đá user ra.
      await deleteDoc(doc(sellersRef, id));
      onProgress?.(total, total);

      return { orders: orderIds.length, queue: queueIds.length };
    },
    { onSuccess: invalidate }
  );

  return { removeSeller };
}

/**
 * Xoá 1 shop kèm cascade: xoá tất cả đơn (podOrders) và lô import PDF
 * (podImportQueue) thuộc shop đó, rồi mới xoá bản ghi shop.
 */
export function useStoreCascade() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries(["adm-stores"]);
    qc.invalidateQueries(["adm-orders"]);
    qc.invalidateQueries(["adm-import-queue"]);
  };

  const removeStore = useMutation(
    async ({
      storeId,
      onProgress,
    }: {
      storeId: string;
      onProgress?: (done: number, total: number) => void;
    }) => {
      if (!storeId) return { orders: 0, queue: 0 };
      // Chỉ xoá đơn khi khớp CẢ storeId LẪN tên shop (hoặc tên shop trống) — tránh
      // xoá nhầm đơn đang hiển thị shop khác (vd shop từng đổi tên, storeName cũ).
      const allStores = await sbSelectAll("stores");
      const store = allStores.find((s: any) => s.id === storeId);
      const nm = (store?.name || "").trim().toLowerCase();
      const belongs = (o: any) => {
        if (o.storeId !== storeId) return false;
        const on = (o.storeName || "").trim().toLowerCase();
        return !on || on === nm;
      };
      const allOrders = await sbSelectAll("podOrders");
      const orderIds = allOrders.filter(belongs).map((o: any) => o.id);
      const allQueue = await sbSelectAll("podImportQueue");
      const queueIds = allQueue.filter(belongs).map((q: any) => q.id);

      const total = orderIds.length + queueIds.length + 1;
      await sbDeleteMany("podOrders", orderIds, (d) => onProgress?.(d, total));
      await sbDeleteMany("podImportQueue", queueIds, (d) =>
        onProgress?.(orderIds.length + d, total)
      );
      await deleteDoc(doc(storesRef, storeId));
      onProgress?.(total, total);

      return { orders: orderIds.length, queue: queueIds.length };
    },
    { onSuccess: invalidate }
  );

  return { removeStore };
}

/* ---------- Stores ---------- */
export function useStores() {
  const q = useQuery(["adm-stores"], () => getDocs(storesRef));
  return { ...q, stores: toList<Store>(q.data) };
}
export const useStoreMutations = crud(storesRef, "adm-stores");

/* ---------- Orders (toàn hệ thống) ---------- */
export function useOrders() {
  const q = useQuery(["adm-orders"], () =>
    // Thêm khóa phụ "id" để thứ tự ỔN ĐỊNH — nhiều đơn cùng ngày `created`
    // nếu chỉ sort theo created sẽ bị đảo chỗ mỗi lần refetch (row nhảy sau
    // khi lưu). Sort thêm theo id đảm bảo mỗi lần trả về đúng một thứ tự.
    getDocs(
      query(ordersRef, orderBy("created", "desc"), orderBy("id", "asc"))
    )
  );
  return { ...q, orders: toList<PodOrder>(q.data) };
}
export const useOrderMutations = crud(ordersRef, "adm-orders");

/* ---------- Nhân viên CS (danh sách để gán vào đơn) ---------- */
const csEmployeesRef = collection(db, "csEmployees");
export function useCsEmployees() {
  const q = useQuery(["adm-cs-employees"], () =>
    getDocs(query(csEmployeesRef, orderBy("created", "desc")))
  );
  return { ...q, employees: toList<CsEmployee>(q.data) };
}

/** Mã nhân viên kế tiếp theo dạng NV001, NV002... */
export function nextEmployeeCode(employees: CsEmployee[]): string {
  const max = employees.reduce((m, e) => {
    const n = Number(String(e.code || "").replace(/\D/g, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `NV${String(max + 1).padStart(3, "0")}`;
}
export const useCsEmployeeMutations = crud(csEmployeesRef, "adm-cs-employees");

/* ---------- "Add ID": mã đơn khách gửi trước khi đơn được úp lên ---------- */
const pendingIdsRef = collection(db, "pendingOrderIds");
export function usePendingOrderIds() {
  const q = useQuery(["adm-pending-ids"], () =>
    getDocs(query(pendingIdsRef, orderBy("created", "desc")))
  );
  return { ...q, pendingIds: toList<PendingOrderId>(q.data) };
}
export const usePendingOrderIdMutations = crud(
  pendingIdsRef,
  "adm-pending-ids"
);

/* ---------- Hàng đợi import PDF (seller gửi, chờ admin duyệt) ---------- */
export function useImportQueue() {
  const q = useQuery(["adm-import-queue"], () =>
    getDocs(query(importQueueRef, orderBy("created", "desc")))
  );
  return { ...q, batches: toList<ImportBatch>(q.data) };
}

export function useImportQueueMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries(["adm-import-queue"]);
    qc.invalidateQueries(["adm-orders"]);
  };

  /**
   * Duyệt cả lô: ghi từng đơn sang "podOrders" (giữ userId của seller),
   * rồi đánh dấu lô "approved". Dùng id đơn có sẵn (etsy-...) để idempotent.
   */
  const approve = useMutation(
    async ({
      batch,
      reviewedBy,
      onProgress,
    }: {
      batch: ImportBatch;
      reviewedBy?: string;
      onProgress?: (done: number, total: number) => void;
    }) => {
      const list = batch.orders || [];
      // Chèn cả lô 500 đơn cho NHANH; lô nào lỗi mới chèn lại từng đơn để đơn
      // hợp lệ vẫn vào. Upsert theo id nên duyệt lại không nhân đôi.
      const rows = list.map((row) => ({
        id: row.id || genId(),
        ...(row.data as any),
        userId: batch.userId || "",
      }));
      const CHUNK = 500;
      let failed = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        try {
          await sbUpsert("podOrders", chunk);
        } catch {
          for (const r of chunk) {
            try {
              await sbUpsert("podOrders", [r]);
            } catch {
              failed += 1;
            }
          }
        }
        onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
      }
      await updateDoc(doc(importQueueRef, batch.id), {
        status: "approved",
        reviewedBy: reviewedBy || "admin",
        reviewedAt: new Date().toISOString(),
      });
      return { total: list.length, failed };
    },
    { onSuccess: invalidate }
  );

  /** Từ chối cả lô: không ghi đơn nào, chỉ lưu lý do. */
  const reject = useMutation(
    ({
      id,
      reason,
      reviewedBy,
    }: {
      id: string;
      reason?: string;
      reviewedBy?: string;
    }) =>
      updateDoc(doc(importQueueRef, id), {
        status: "rejected",
        rejectedReason: reason || "",
        reviewedBy: reviewedBy || "admin",
        reviewedAt: new Date().toISOString(),
      }),
    { onSuccess: invalidate }
  );

  const remove = useMutation(
    (id: string) => deleteDoc(doc(importQueueRef, id)),
    { onSuccess: invalidate }
  );

  const removeMany = useMutation(
    async (ids: string[]) => {
      await sbDeleteMany("podImportQueue", ids);
    },
    { onSuccess: invalidate }
  );

  return { approve, reject, remove, removeMany };
}

/* ---------- Ledger (sổ cái gạch nợ) ---------- */
export function useLedger() {
  const q = useQuery(["adm-ledger"], () =>
    getDocs(query(ledgerRef, orderBy("created", "desc")))
  );
  return { ...q, entries: toList<LedgerEntry>(q.data) };
}
export const useLedgerMutations = crud(ledgerRef, "adm-ledger");

/* ---------- Shipping prices ---------- */
export function useShippingPrices() {
  const q = useQuery(["adm-shipping"], () => getDocs(shippingRef));
  return { ...q, prices: toList<ShippingPrice>(q.data) };
}
export const useShippingMutations = crud(shippingRef, "adm-shipping");

/* ---------- Design requests ---------- */
export function useDesignRequests() {
  const q = useQuery(["adm-design-req"], () =>
    getDocs(query(designReqRef, orderBy("created", "desc")))
  );
  return { ...q, requests: toList<DesignRequest>(q.data) };
}
export const useDesignRequestMutations = crud(designReqRef, "adm-design-req");

/* ---------- Services ---------- */
export function useServices() {
  const q = useQuery(["adm-services"], () => getDocs(servicesRef));
  return { ...q, services: toList<ServiceItem>(q.data) };
}
export const useServiceMutations = crud(servicesRef, "adm-services");

/* ---------- Base products (kho phôi) ---------- */
export function useBaseProducts() {
  const q = useQuery(["adm-products"], () =>
    getDocs(query(productsRef, orderBy("created", "desc")))
  );
  return { ...q, products: toList<BaseProduct>(q.data) };
}
export const useBaseProductMutations = crud(productsRef, "adm-products");

/* ---------- POD base prices (bảng giá phôi theo Loại + Size) ---------- */
export function usePodPrices() {
  const q = useQuery(["adm-pod-prices"], () => getDocs(query(podPricesRef)));
  return { ...q, prices: toList<PodPrice>(q.data) };
}
export const usePodPriceMutations = crud(podPricesRef, "adm-pod-prices");

/* ---------- Danh mục Nhà In ---------- */
export function usePrintHouses() {
  const q = useQuery(["adm-print-houses"], () =>
    getDocs(query(printHousesRef, orderBy("name", "asc")))
  );
  return { ...q, printHouses: toList<PrintHouseItem>(q.data) };
}
export const usePrintHouseMutations = crud(printHousesRef, "adm-print-houses");

/* ---------- Data SKU riêng theo từng Nhà In (file SK2) ---------- */
export function usePrintHouseSkus() {
  // Bảng có thể vài nghìn dòng → phân trang lấy đủ
  const q = useQuery(["adm-ph-skus"], async () => {
    const rows = await sbSelectAll("printHouseSkus", {
      order: [{ column: "brand", ascending: true }],
    });
    return rows.map((r) => {
      const { created_at, ...rest } = r as any;
      return rest as PrintHouseSku;
    });
  });
  return { ...q, phSkus: (q.data as PrintHouseSku[]) || [] };
}
export const usePrintHouseSkuMutations = crud(
  printHouseSkusRef,
  "adm-ph-skus"
);

/* ---------- Tracking vận chuyển ---------- */
export function useTrackings() {
  const q = useQuery(["adm-trackings"], () =>
    getDocs(query(trackingsRef, orderBy("created", "desc")))
  );
  return { ...q, trackings: toList<TrackingRow>(q.data) };
}
export const useTrackingMutations = crud(trackingsRef, "adm-trackings");

/* ---------- Đơn gửi Nhà In (định dạng AK2) ---------- */
export function usePrintOrders() {
  const q = useQuery(["adm-print-orders"], () =>
    getDocs(query(printOrdersRef, orderBy("created", "desc")))
  );
  return { ...q, printOrders: toList<PrintOrder>(q.data) };
}
export const usePrintOrderMutations = crud(printOrdersRef, "adm-print-orders");

/* ---------- Biến thể phôi (Sản phẩm × Màu × Size + giá) ---------- */
export function usePodVariants() {
  // Bảng rất lớn (hàng nghìn dòng) — phân trang để lấy ĐỦ mọi sản phẩm,
  // tránh bị PostgREST cắt còn ~1000 dòng khiến thiếu phôi.
  const q = useQuery(["adm-variants"], async () => {
    const rows = await sbSelectAll("podVariants", {
      order: [{ column: "product", ascending: true }],
    });
    return rows.map((r) => {
      const { created_at, ...rest } = r as any;
      return rest as PodVariant;
    });
  });
  return { ...q, variants: (q.data as PodVariant[]) || [] };
}
export const usePodVariantMutations = crud(variantsRef, "adm-variants");

/* ---------- Mã màu (tên màu phôi -> mã hex, dùng cho nền thiết kế) ---------- */
export function usePodColors() {
  const q = useQuery(["adm-colors"], () =>
    getDocs(query(colorsRef, orderBy("name", "asc")))
  );
  return { ...q, colors: toList<PodColor>(q.data) };
}
export const usePodColorMutations = crud(colorsRef, "adm-colors");
