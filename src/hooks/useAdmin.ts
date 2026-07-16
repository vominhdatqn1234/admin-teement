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
  updateDoc,
} from "../lib/db";
import {
  BaseProduct,
  DesignRequest,
  LedgerEntry,
  PodColor,
  PodOrder,
  PodPrice,
  PodVariant,
  PrintHouseItem,
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

/* ---------- Stores ---------- */
export function useStores() {
  const q = useQuery(["adm-stores"], () => getDocs(storesRef));
  return { ...q, stores: toList<Store>(q.data) };
}
export const useStoreMutations = crud(storesRef, "adm-stores");

/* ---------- Orders (toàn hệ thống) ---------- */
export function useOrders() {
  const q = useQuery(["adm-orders"], () =>
    getDocs(query(ordersRef, orderBy("created", "desc")))
  );
  return { ...q, orders: toList<PodOrder>(q.data) };
}
export const useOrderMutations = crud(ordersRef, "adm-orders");

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
  const q = useQuery(["adm-variants"], () =>
    getDocs(query(variantsRef, orderBy("product", "asc")))
  );
  return { ...q, variants: toList<PodVariant>(q.data) };
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
