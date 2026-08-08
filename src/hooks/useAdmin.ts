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
} from "../lib/db";
import { sbSelectAll } from "../lib/supabase";
import {
  BaseProduct,
  DesignRequest,
  ImportBatch,
  LedgerEntry,
  PodColor,
  PodOrder,
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
        let done = 0;
        for (const id of ids) {
          await deleteDoc(doc(ref, id));
          done += 1;
          onProgress?.(done, ids.length);
        }
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
      // Lấy stores của seller (đơn có thể thiếu userId nhưng luôn có storeId).
      const allStores = await sbSelectAll("stores");
      const storeIds = new Set(
        allStores.filter((s: any) => s.userId === id).map((s: any) => s.id)
      );
      const belongs = (row: any) =>
        row.userId === id || (row.storeId && storeIds.has(row.storeId));

      // 1) Toàn bộ đơn của seller (khớp userId HOẶC storeId) — không giới hạn 1000.
      const allOrders = await sbSelectAll("podOrders");
      const orderIds = allOrders.filter(belongs).map((o: any) => o.id);
      // 2) Các lô import PDF của seller.
      const allQueue = await sbSelectAll("podImportQueue");
      const queueIds = allQueue.filter(belongs).map((q: any) => q.id);

      const total = orderIds.length + queueIds.length + 1;
      let done = 0;
      for (const oid of orderIds) {
        await deleteDoc(doc(ordersRef, oid));
        onProgress?.(++done, total);
      }
      for (const qid of queueIds) {
        await deleteDoc(doc(importQueueRef, qid));
        onProgress?.(++done, total);
      }
      // 3) Xoá seller sau cùng -> lần guard kế tiếp bên client sẽ đá user ra.
      await deleteDoc(doc(sellersRef, id));
      onProgress?.(++done, total);

      return { orders: orderIds.length, queue: queueIds.length };
    },
    { onSuccess: invalidate }
  );

  return { removeSeller };
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
      let done = 0;
      for (const row of list) {
        const data = { ...row.data, userId: batch.userId || "" };
        if (row.id) await setDoc(doc(ordersRef, row.id), data);
        else await addDoc(ordersRef, data);
        done += 1;
        onProgress?.(done, list.length);
      }
      await updateDoc(doc(importQueueRef, batch.id), {
        status: "approved",
        reviewedBy: reviewedBy || "admin",
        reviewedAt: new Date().toISOString(),
      });
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
      for (const id of ids) await deleteDoc(doc(importQueueRef, id));
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
