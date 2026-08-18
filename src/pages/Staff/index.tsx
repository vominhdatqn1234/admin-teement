/**
 * Trang "Nhân viên & Tài khoản" — quản lý nhân viên CS ở một chỗ cho dễ nhìn:
 * tạo nhân viên kèm tài khoản đăng nhập, sửa username / mật khẩu, khóa hoặc
 * mở đăng nhập, xóa nhân viên.
 *
 * Nhân viên đăng nhập admin portal bằng username + mật khẩu, chỉ vào được các
 * trang được phân quyền và KHÔNG thấy các cột tiền
 * (Giá / Phí / Tổng / Giá đối chiếu).
 */
import { Button, Input, Popconfirm, Switch, Tooltip, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiKey,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiUser,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  nextEmployeeCode,
  useCsEmployeeMutations,
  useCsEmployees,
  useOrders,
} from "../../hooks/useAdmin";
import { useIsAdmin } from "../../hooks/useAdminAuth";
import { CsEmployee } from "../../models/admin";

/** Gợi ý username từ tên nhân viên: "Nguyễn Phương" -> "nguyenphuong" */
export function slugUsername(name: string): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const USERNAME_RE = /^[a-z0-9._-]{3,}$/;

export default function Staff() {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const { employees } = useCsEmployees();
  const empMut = useCsEmployeeMutations();
  const { orders } = useOrders();

  // Form tạo mới
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");

  // Bản nháp đang sửa của từng dòng (id -> giá trị trên form)
  const [draft, setDraft] = useState<
    Record<string, { username: string; password: string; active: boolean }>
  >({});
  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      employees.forEach((e) => {
        if (!next[e.id])
          next[e.id] = {
            username: e.username || "",
            password: e.password || "",
            active: e.active !== false,
          };
      });
      return next;
    });
  }, [employees]);

  const set = (id: string, patch: Partial<(typeof draft)[string]>) =>
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  /** Số đơn mỗi nhân viên đang phụ trách (cột csAssignee có tên nhân viên) */
  const orderCountOf = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => {
      String(o.csAssignee || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .forEach((n) => (map[n] = (map[n] || 0) + 1));
    });
    return map;
  }, [orders]);

  const list = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return employees;
    return employees.filter(
      (e) =>
        String(e.name || "").toLowerCase().includes(kw) ||
        String(e.code || "").toLowerCase().includes(kw) ||
        String(e.username || "").toLowerCase().includes(kw)
    );
  }, [employees, search]);

  /** Kiểm tra username hợp lệ + không trùng người khác */
  const validateUsername = (value: string, selfId?: string): string | null => {
    if (!USERNAME_RE.test(value))
      return "Username tối thiểu 3 ký tự, chỉ gồm chữ thường, số và . _ -";
    if (
      employees.some(
        (e) =>
          e.id !== selfId &&
          String(e.username || "").trim().toLowerCase() === value
      )
    )
      return `Username "${value}" đã được dùng cho nhân viên khác`;
    return null;
  };

  const create = async () => {
    const n = name.trim();
    if (!n) return message.warning("Nhập tên nhân viên");
    if (employees.some((e) => e.name.toLowerCase() === n.toLowerCase()))
      return message.warning("Nhân viên này đã có");
    const u = (username.trim() || slugUsername(n)).toLowerCase();
    const p = password.trim();
    const err = validateUsername(u);
    if (err) return message.error(err);
    if (!p) return message.error("Nhập mật khẩu đăng nhập cho nhân viên");

    const code = nextEmployeeCode(employees);
    await empMut.add.mutateAsync({
      name: n,
      code,
      username: u,
      password: p,
      active: true,
      created: new Date().toISOString(),
    });
    message.success(`Đã tạo nhân viên "${n}" — mã ${code}, đăng nhập "${u}"`);
    setName("");
    setUsername("");
    setPassword("");
  };

  const saveRow = async (e: CsEmployee) => {
    const row = draft[e.id];
    if (!row) return;
    const u = row.username.trim().toLowerCase();
    const p = row.password.trim();
    if (u) {
      const err = validateUsername(u, e.id);
      if (err) return message.error(err);
      if (!p) return message.error(`Nhân viên "${e.name}" chưa có mật khẩu`);
    }
    await empMut.update.mutateAsync({
      id: e.id,
      username: u,
      // Gỡ username = gỡ luôn mật khẩu để không đăng nhập được nữa
      password: u ? p : "",
      active: row.active,
    });
    message.success(
      u
        ? `Đã lưu tài khoản "${u}" cho ${e.name}`
        : `Đã gỡ quyền đăng nhập của ${e.name}`
    );
  };

  const dirty = (e: CsEmployee) => {
    const row = draft[e.id];
    if (!row) return false;
    return (
      row.username.trim().toLowerCase() !==
        String(e.username || "").trim().toLowerCase() ||
      row.password.trim() !== String(e.password || "").trim() ||
      row.active !== (e.active !== false)
    );
  };

  const withAccount = employees.filter((e) => e.username).length;

  if (!isAdmin)
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
        Chỉ tài khoản Admin mới quản lý được nhân viên và tài khoản đăng nhập.
      </div>
    );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate("/app/order-care")}
          className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 bg-transparent border-0 p-0 mb-2 cursor-pointer hover:text-gray-800"
        >
          <FiArrowLeft size={14} /> Về Quản lý nhân viên (đơn)
        </button>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-[#171826] m-0 flex items-center gap-3">
              Nhân viên &amp; Tài khoản
              <span className="text-xs font-bold bg-[#EEF0FF] text-[#4338CA] rounded-full px-2.5 py-1">
                {employees.length} nhân viên · {withAccount} tài khoản
              </span>
            </h1>
            <p className="text-gray-500 m-0 mt-1 max-w-2xl text-sm">
              Nhân viên đăng nhập admin portal bằng <b>username + mật khẩu</b>{" "}
              (cùng ô với email admin ở trang đăng nhập). Nhân viên chỉ vào được{" "}
              <b>Quản lý Seller</b>, <b>Quản lý nhân viên</b>, <b>Thông báo</b>{" "}
              và <b>không thấy</b> các cột <b>Giá / Phí / Tổng / Giá đối chiếu</b>.
            </p>
          </div>
          <Input
            prefix={<FiSearch className="text-gray-400" />}
            placeholder="Tìm tên / mã NV / username..."
            className="w-full sm:w-[260px] rounded-lg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </div>
      </div>

      {/* Tạo nhân viên mới */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="text-[11px] font-bold tracking-widest text-gray-400 mb-3">
          TẠO NHÂN VIÊN MỚI
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <div className="text-xs text-gray-500 mb-1.5">Tên nhân viên *</div>
            <Input
              size="large"
              placeholder="Vd: Nguyễn Phương"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onPressEnter={create}
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1.5">
              Username đăng nhập
            </div>
            <Input
              size="large"
              prefix={<FiUser className="text-gray-300" size={14} />}
              placeholder={slugUsername(name) || "nguyenphuong"}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onPressEnter={create}
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1.5">Mật khẩu *</div>
            <Input.Password
              size="large"
              prefix={<FiKey className="text-gray-300" size={14} />}
              placeholder="Mật khẩu đăng nhập"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onPressEnter={create}
            />
          </div>
          <Button
            type="primary"
            size="large"
            icon={<FiPlus />}
            loading={empMut.add.isLoading}
            onClick={create}
            className="bg-[#171826] border-0 font-bold"
          >
            Tạo nhân viên
          </Button>
        </div>
        <div className="text-[11px] text-gray-400 mt-2">
          Bỏ trống username sẽ tự lấy theo tên (
          {slugUsername(name) || "nguyenphuong"}). Mã nhân viên (NV00x) hệ thống
          tự cấp.
        </div>
      </div>

      {/* Danh sách nhân viên */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="text-left text-[11px] tracking-widest text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="p-4">NHÂN VIÊN</th>
              <th className="p-4">USERNAME</th>
              <th className="p-4">MẬT KHẨU</th>
              <th className="p-4 text-center">CHO ĐĂNG NHẬP</th>
              <th className="p-4">ĐƠN PHỤ TRÁCH</th>
              <th className="p-4">NGÀY TẠO</th>
              <th className="p-4 text-right">THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => {
              const row = draft[e.id] || {
                username: "",
                password: "",
                active: true,
              };
              const locked = e.active === false;
              const changed = dirty(e);
              return (
                <tr
                  key={e.id}
                  className="border-b border-gray-50 hover:bg-gray-50/60"
                >
                  <td className="p-4">
                    <div className="font-bold text-[#171826]">{e.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {e.code && (
                        <span className="font-mono text-[10px] text-[#4338CA] bg-[#EEF0FF] rounded px-1.5 py-[1px]">
                          {e.code}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold rounded px-1.5 py-[1px] ${
                          !e.username
                            ? "bg-gray-100 text-gray-400"
                            : locked
                            ? "bg-[#FDECEC] text-[#B91C1C]"
                            : "bg-[#E8F7EC] text-[#15803D]"
                        }`}
                      >
                        {!e.username
                          ? "CHƯA CÓ TÀI KHOẢN"
                          : locked
                          ? "ĐANG KHÓA"
                          : "ĐĂNG NHẬP ĐƯỢC"}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <Input
                      prefix={<FiUser className="text-gray-300" size={13} />}
                      className="w-[180px]"
                      placeholder={slugUsername(e.name) || "username"}
                      value={row.username}
                      onChange={(ev) =>
                        set(e.id, { username: ev.target.value })
                      }
                      onPressEnter={() => saveRow(e)}
                    />
                  </td>
                  <td className="p-4">
                    <Input.Password
                      className="w-[170px]"
                      placeholder="Mật khẩu"
                      value={row.password}
                      onChange={(ev) =>
                        set(e.id, { password: ev.target.value })
                      }
                      onPressEnter={() => saveRow(e)}
                    />
                  </td>
                  <td className="p-4 text-center">
                    <Tooltip
                      title={
                        row.active
                          ? "Tắt để tạm khóa đăng nhập"
                          : "Bật để cho đăng nhập lại"
                      }
                    >
                      <Switch
                        checked={row.active}
                        onChange={(v) => set(e.id, { active: v })}
                      />
                    </Tooltip>
                  </td>
                  <td className="p-4 text-gray-600">
                    {orderCountOf[e.name.toLowerCase()] || 0} đơn
                  </td>
                  <td className="p-4 text-gray-500 whitespace-nowrap">
                    {e.created ? dayjs(e.created).format("DD/MM/YYYY") : "—"}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type={changed ? "primary" : "default"}
                        className={changed ? "bg-[#171826] border-0" : ""}
                        disabled={!changed}
                        loading={empMut.update.isLoading}
                        onClick={() => saveRow(e)}
                      >
                        Lưu
                      </Button>
                      <Popconfirm
                        title={`Xóa nhân viên "${e.name}"?`}
                        description="Nhân viên sẽ không đăng nhập được nữa."
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => empMut.remove.mutate(e.id)}
                      >
                        <Tooltip title="Xóa nhân viên">
                          <button className="w-9 h-9 rounded-lg border border-red-100 bg-red-50 text-red-500 flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white transition-colors">
                            <FiTrash2 size={15} />
                          </button>
                        </Tooltip>
                      </Popconfirm>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={7} className="p-16 text-center text-gray-400">
                  {search.trim()
                    ? "Không tìm thấy nhân viên nào"
                    : "Chưa có nhân viên nào — tạo ở khung phía trên"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
