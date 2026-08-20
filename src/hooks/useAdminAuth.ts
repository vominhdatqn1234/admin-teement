/**
 * Đăng nhập admin portal — 2 loại tài khoản:
 *   - Admin    : bảng "employee", permission = 'Admin', đăng nhập bằng EMAIL.
 *   - Nhân viên: bảng "csEmployees", đăng nhập bằng USERNAME do admin cấp
 *                trong tab "Quản lý nhân viên". Nhân viên chỉ vào được một số
 *                trang và KHÔNG thấy các cột tiền (Giá / Phí / Tổng /
 *                Giá đối chiếu).
 */
import { useEffect, useState } from "react";
import {
  collection,
  firestoreInstance as db,
  getDocs,
  limit,
  query,
  where,
} from "../lib/db";
import { useLocalStorage } from "./useLocalStorage";

const accountRef = collection(db, "employee");
const csEmployeesRef = collection(db, "csEmployees");

export type AdminRole = "admin" | "staff";

export interface AdminUser {
  id: string;
  name?: string;
  email?: string;
  permission?: string;
  /** 'admin' = toàn quyền | 'staff' = nhân viên CS (quyền hạn chế) */
  role?: AdminRole;
  /** Nhân viên: username đăng nhập + mã NV */
  username?: string;
  code?: string;
}

/** Tài khoản lưu từ trước (chưa có role) mặc định là admin */
export function roleOf(user: AdminUser | null | undefined): AdminRole {
  return user?.role === "staff" ? "staff" : "admin";
}

export function isAdminRole(user: AdminUser | null | undefined): boolean {
  return !!user && roleOf(user) === "admin";
}

/** Các trang nhân viên được phép vào (admin vào được tất cả) */
export const STAFF_PATHS = [
  "/app/sellers",
  "/app/order-care",
  "/app/pending-ids",
  "/app/staff-chat",
  "/app/notifications",
  // Nhân viên được vào hàng đợi import PDF và duyệt lô luôn (không phải chờ
  // admin). Cột tiền và thao tác xoá lô vẫn chỉ dành cho admin.
  "/app/import-queue",
];

/** Trang mặc định sau khi đăng nhập theo từng vai trò */
export function homePathOf(user: AdminUser | null | undefined): string {
  return roleOf(user) === "staff" ? "/app/sellers" : "/app/finance";
}

export function useAdminAuth() {
  const [adminUser, setAdminUser] = useLocalStorage("admin-user", null);
  const [checking, setChecking] = useState(false);

  /** account = email (admin) hoặc username (nhân viên) */
  const login = async (account: string, password: string) => {
    setChecking(true);
    try {
      // 1) Tài khoản Admin (email + permission Admin)
      const snap = await getDocs(
        query(
          accountRef,
          where("email", "==", account),
          where("password", "==", password),
          where("permission", "==", "Admin"),
          limit(1)
        )
      );
      let user: any = null;
      snap.forEach(
        (d) =>
          (user = {
            id: d.id,
            ...d.data(),
            password: null,
            role: "admin" as AdminRole,
          })
      );
      if (user) {
        setAdminUser(user);
        return user as AdminUser;
      }

      // 2) Tài khoản nhân viên CS (username + password, chưa bị khóa)
      const staffSnap = await getDocs(
        query(
          csEmployeesRef,
          where("username", "==", account),
          where("password", "==", password),
          limit(1)
        )
      );
      let staff: any = null;
      staffSnap.forEach((d) => (staff = { id: d.id, ...d.data() }));
      if (!staff || staff.active === false) return null;

      const staffUser: AdminUser = {
        id: staff.id,
        name: staff.name,
        email: staff.username,
        username: staff.username,
        code: staff.code,
        permission: "Staff",
        role: "staff",
      };
      setAdminUser(staffUser);
      return staffUser;
    } finally {
      setChecking(false);
    }
  };

  const logout = () => setAdminUser(null);

  return { adminUser: adminUser as AdminUser | null, login, logout, checking };
}

/** Guard đơn giản: sync localStorage giữa các tab */
export function useAdminUser(): AdminUser | null {
  const [adminUser] = useLocalStorage("admin-user", null);
  const [, force] = useState(0);
  useEffect(() => {
    const onStorage = () => force((x) => x + 1);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return adminUser;
}

/** true khi người đang đăng nhập là Admin (không phải nhân viên CS) */
export function useIsAdmin(): boolean {
  return isAdminRole(useAdminUser());
}
