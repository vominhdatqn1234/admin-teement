/** Đăng nhập admin: bảng employee, permission = 'Admin' */
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

export interface AdminUser {
  id: string;
  name?: string;
  email?: string;
  permission?: string;
}

export function useAdminAuth() {
  const [adminUser, setAdminUser] = useLocalStorage("admin-user", null);
  const [checking, setChecking] = useState(false);

  const login = async (email: string, password: string) => {
    setChecking(true);
    try {
      const snap = await getDocs(
        query(
          accountRef,
          where("email", "==", email),
          where("password", "==", password),
          where("permission", "==", "Admin"),
          limit(1)
        )
      );
      if (snap.empty) return null;
      let user: any = null;
      snap.forEach((d) => (user = { id: d.id, ...d.data(), password: null }));
      setAdminUser(user);
      return user as AdminUser;
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
