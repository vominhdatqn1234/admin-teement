/**
 * Chat nội bộ Admin <-> Nhân viên.
 *
 * - Admin: chọn nhân viên ở cột trái, nhắn vấn đề cần xử lý (kèm mã đơn nếu có).
 * - Nhân viên: thấy đúng luồng chat của mình, nhận badge đỏ khi admin nhắn,
 *   bấm "Đã xử lý" để báo lại và trả lời trực tiếp trong khung chat.
 */
import { Empty, Tooltip, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiExternalLink,
  FiHash,
  FiMessageSquare,
  FiSend,
  FiUser,
} from "react-icons/fi";
import { useQueryClient } from "react-query";
import { useNavigate } from "react-router-dom";
import {
  useCsEmployees,
  useStaffMessageMutations,
  useStaffMessages,
} from "../../hooks/useAdmin";
import { sbDeleteMany } from "../../lib/supabase";
import { isAdminRole, useAdminUser } from "../../hooks/useAdminAuth";
import { StaffMessage } from "../../models/admin";

/** Tin nhắn nội bộ chỉ giữ 7 ngày, cũ hơn thì tự xoá */
export const KEEP_DAYS = 7;

/** Mốc thời gian: tin tạo trước mốc này coi như đã hết hạn */
export function msgCutoff() {
  return dayjs().subtract(KEEP_DAYS, "day");
}

/** Tin còn trong hạn 7 ngày (tin thiếu `created` coi như còn mới) */
export function isFreshMsg(m: StaffMessage): boolean {
  return !m.created || dayjs(m.created).isAfter(msgCutoff());
}

/** Tin admin gửi mà nhân viên chưa đọc (badge phía nhân viên) */
export function unreadForStaff(
  messages: StaffMessage[],
  staffId: string
): number {
  return messages.filter(
    (m) =>
      m.staffId === staffId &&
      m.senderRole !== "staff" &&
      !m.readByStaff &&
      isFreshMsg(m)
  ).length;
}

/** Tin nhân viên trả lời mà admin chưa đọc (badge phía admin) */
export function unreadForAdmin(messages: StaffMessage[]): number {
  return messages.filter(
    (m) => m.senderRole === "staff" && !m.readByAdmin && isFreshMsg(m)
  ).length;
}

export default function StaffChat() {
  const navigate = useNavigate();
  const admin = useAdminUser();
  const isAdmin = isAdminRole(admin);
  const me = admin?.name || admin?.email || "admin";
  const { employees } = useCsEmployees();
  const { messages: allMessages } = useStaffMessages();
  const mut = useStaffMessageMutations();
  const qc = useQueryClient();
  const cleaning = useRef(false);

  // Chỉ dùng tin trong 7 ngày; tin cũ hơn sẽ bị xoá hẳn khỏi DB bên dưới
  const messages = useMemo(
    () => allMessages.filter(isFreshMsg),
    [allMessages]
  );

  /** Dọn tin nhắn quá 7 ngày (chạy khi mở trang / khi có dữ liệu mới) */
  useEffect(() => {
    if (cleaning.current) return;
    const expired = allMessages
      .filter((m) => !isFreshMsg(m))
      .map((m) => m.id);
    if (!expired.length) return;
    cleaning.current = true;
    sbDeleteMany("staffMessages", expired)
      .then(() => qc.invalidateQueries(["adm-staff-messages"]))
      .catch(() => {
        /* lỗi mạng thì để lần mở sau dọn tiếp */
      })
      .finally(() => {
        cleaning.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMessages]);

  const [activeId, setActiveId] = useState("");
  const [text, setText] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [focused, setFocused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Nhân viên chỉ có luồng của chính mình; admin chọn nhân viên ở cột trái
  const staffId = isAdmin ? activeId : admin?.id || "";
  useEffect(() => {
    if (isAdmin && !activeId && employees.length) setActiveId(employees[0].id);
  }, [isAdmin, activeId, employees]);

  const thread = useMemo(
    () =>
      messages
        .filter((m) => m.staffId === staffId)
        .sort((a, b) => (a.created || "").localeCompare(b.created || "")),
    [messages, staffId]
  );

  // Mở luồng nào thì đánh dấu đã đọc luồng đó
  useEffect(() => {
    if (!staffId) return;
    const unread = messages.filter((m) =>
      isAdmin
        ? m.staffId === staffId && m.senderRole === "staff" && !m.readByAdmin
        : m.staffId === staffId && m.senderRole !== "staff" && !m.readByStaff
    );
    unread.forEach((m) =>
      mut.update.mutate({
        id: m.id,
        ...(isAdmin ? { readByAdmin: true } : { readByStaff: true }),
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, staffId]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    if (!staffId) return message.warning("Chọn nhân viên cần nhắn");
    const staff = employees.find((e) => e.id === staffId);
    await mut.add.mutateAsync({
      staffId,
      staffName: staff?.name || admin?.name || "",
      senderRole: isAdmin ? "admin" : "staff",
      senderName: me,
      content,
      orderCode: orderCode.trim(),
      // Người gửi coi như đã đọc tin của chính mình
      readByAdmin: isAdmin,
      readByStaff: !isAdmin,
      doneAt: "",
      created: new Date().toISOString(),
    });
    setText("");
    setOrderCode("");
  };

  const markDone = (m: StaffMessage) =>
    mut.update.mutate(
      { id: m.id, doneAt: new Date().toISOString() },
      {
        onSuccess: () => {
          message.success("Đã báo xử lý xong");
        },
      }
    );

  /** Tin cuối + số tin chưa đọc của từng nhân viên (cột trái của admin) */
  const summaryOf = (id: string) => {
    const list = messages.filter((m) => m.staffId === id);
    const last = list[list.length - 1];
    const unread = list.filter(
      (m) => m.senderRole === "staff" && !m.readByAdmin
    ).length;
    return { last, unread, total: list.length };
  };

  const activeStaff = employees.find((e) => e.id === staffId);

  const bubble = (m: StaffMessage) => {
    const mine = isAdmin ? m.senderRole !== "staff" : m.senderRole === "staff";
    const fromAdmin = m.senderRole !== "staff";
    return (
      <div
        key={m.id}
        className={`flex ${mine ? "justify-end" : "justify-start"}`}
      >
        <div className="max-w-[70%]">
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
              mine
                ? "bg-[#171826] text-white rounded-br-sm shadow-[0_6px_16px_-10px_rgba(23,24,38,0.9)]"
                : "bg-white text-[#171826] rounded-bl-sm border border-gray-200 shadow-sm"
            }`}
          >
            {m.content}
            {m.orderCode && (
              <button
                onClick={() =>
                  navigate(
                    `/app/sellers?code=${encodeURIComponent(m.orderCode || "")}`
                  )
                }
                className={`mt-2 flex items-center gap-1.5 text-[11px] font-bold rounded-lg px-2 py-1 border-0 cursor-pointer ${
                  mine
                    ? "bg-white/15 text-white"
                    : "bg-white text-[#2563EB] border border-gray-200"
                }`}
              >
                <FiExternalLink size={11} /> Đơn {m.orderCode}
              </button>
            )}
          </div>
          <div
            className={`flex items-center gap-2 mt-1 text-[11px] text-gray-400 ${
              mine ? "justify-end" : ""
            }`}
          >
            <span>{m.senderName || (fromAdmin ? "Admin" : "Nhân viên")}</span>
            <span>
              {m.created ? dayjs(m.created).format("DD/MM HH:mm") : ""}
            </span>
            {m.doneAt && (
              <span className="text-[#15803D] font-bold inline-flex items-center gap-0.5">
                <FiCheckCircle size={11} /> đã xử lý
              </span>
            )}
            {/* Nhân viên báo đã xử lý cho việc admin giao */}
            {!isAdmin && fromAdmin && !m.doneAt && (
              <button
                onClick={() => markDone(m)}
                className="text-[#2563EB] bg-transparent border-0 p-0 cursor-pointer underline"
              >
                Đã xử lý
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const composer = (
    <div className="border-t border-gray-100 bg-gradient-to-b from-gray-50/60 to-white p-4">
      <div
        className={`rounded-2xl border bg-white p-3 transition-shadow ${
          focused
            ? "border-[#171826] shadow-[0_8px_24px_-12px_rgba(23,24,38,0.35)]"
            : "border-gray-200 shadow-sm hover:shadow-md"
        }`}
      >
        {/* Mã đơn liên quan */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 border border-gray-200 pl-3 pr-1 py-1 focus-within:border-[#C6A15B] focus-within:bg-white transition-colors">
            <FiHash size={12} className="text-gray-400 shrink-0" />
            <input
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              placeholder="Mã đơn liên quan"
              className="w-[150px] bg-transparent border-0 outline-none text-[12px] text-gray-700 placeholder:text-gray-400 py-0.5"
            />
            {orderCode && (
              <button
                onClick={() => setOrderCode("")}
                className="w-5 h-5 rounded-full text-gray-400 hover:text-red-500 border-0 bg-transparent cursor-pointer leading-none"
              >
                ×
              </button>
            )}
          </div>
          <span className="text-[11px] text-gray-400">
            Không bắt buộc — gắn để người nhận bấm mở thẳng đơn đó.
          </span>
        </div>

        {/* Ô nhập + nút gửi */}
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              isAdmin
                ? "Nhập vấn đề cần nhân viên xử lý…"
                : "Trả lời admin…"
            }
            className="flex-1 min-h-[64px] max-h-[160px] resize-none border-0 outline-none text-[14px] leading-6 text-[#171826] placeholder:text-gray-400 bg-transparent px-1"
          />
          <Tooltip title={text.trim() ? "Gửi (Enter)" : "Nhập nội dung trước"}>
            <button
              onClick={send}
              disabled={!text.trim() || mut.add.isLoading}
              className={`h-[42px] px-5 rounded-xl border-0 font-bold text-sm inline-flex items-center gap-2 transition-all ${
                text.trim() && !mut.add.isLoading
                  ? "bg-[#171826] text-white cursor-pointer shadow-[0_6px_16px_-6px_rgba(23,24,38,0.6)] hover:-translate-y-[1px]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              <FiSend size={14} />
              {mut.add.isLoading ? "Đang gửi..." : "Gửi"}
            </button>
          </Tooltip>
        </div>

        <div className="flex items-center justify-between mt-1 px-1">
          <span className="text-[11px] text-gray-300">
            Enter để gửi · Shift + Enter xuống dòng
          </span>
          <span className="text-[11px] text-gray-300">{text.length} ký tự</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#171826] m-0 flex items-center gap-2">
          <FiMessageSquare /> Chat nội bộ
        </h1>
        <p className="text-gray-500 text-sm mt-1 mb-0">
          {isAdmin
            ? "Nhắn vấn đề cần xử lý tới từng nhân viên. Nhân viên sẽ nhận thông báo và trả lời lại ngay tại đây."
            : "Tin nhắn từ admin về các vấn đề cần bạn xử lý. Bấm “Đã xử lý” khi xong, hoặc trả lời trực tiếp."}{" "}
          <span className="text-gray-400">
            Tin nhắn quá {KEEP_DAYS} ngày sẽ tự xoá.
          </span>
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_-20px_rgba(23,24,38,0.45)] flex overflow-hidden min-h-[540px]">
        {/* Cột trái: danh sách nhân viên (chỉ admin) */}
        {isAdmin && (
          <div className="w-[260px] shrink-0 border-r border-gray-100 overflow-y-auto max-h-[70vh]">
            <div className="px-4 py-3 text-[11px] font-bold tracking-widest text-gray-400 border-b border-gray-100">
              NHÂN VIÊN
            </div>
            {employees.map((e) => {
              const { last, unread } = summaryOf(e.id);
              const active = e.id === staffId;
              return (
                <button
                  key={e.id}
                  onClick={() => setActiveId(e.id)}
                  className={`w-full text-left px-4 py-3 border-0 border-b border-gray-50 cursor-pointer transition-colors ${
                    active ? "bg-[#F5F6FA]" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#171826] text-sm truncate">
                      {e.name}
                    </span>
                    {e.code && (
                      <span className="font-mono text-[10px] text-[#4338CA]">
                        {e.code}
                      </span>
                    )}
                    {unread > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center">
                        {unread}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 truncate mt-0.5">
                    {last
                      ? `${last.senderRole === "staff" ? "NV: " : "Admin: "}${
                          last.content
                        }`
                      : "Chưa có tin nhắn"}
                  </div>
                </button>
              );
            })}
            {!employees.length && (
              <div className="p-6 text-center text-xs text-gray-400">
                Chưa có nhân viên nào
              </div>
            )}
          </div>
        )}

        {/* Khung chat */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center gap-2 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
            <span className="w-7 h-7 rounded-full bg-[#EEF0FF] text-[#4338CA] text-[11px] font-bold flex items-center justify-center">
              {(isAdmin ? activeStaff?.name || "?" : "A").charAt(0).toUpperCase()}
            </span>
            <div>
              <div className="font-semibold text-[#171826] text-sm">
                {isAdmin ? activeStaff?.name || "Chọn nhân viên" : "Admin"}
              </div>
              <div className="text-[11px] text-gray-400">
                {isAdmin
                  ? activeStaff?.username
                    ? `@${activeStaff.username}`
                    : "Chưa có tài khoản đăng nhập"
                  : "Quản trị hệ thống"}
              </div>
            </div>
            {isAdmin && activeStaff && (
              <Tooltip title="Mở trang Nhân viên & Tài khoản">
                <button
                  onClick={() => navigate("/app/staff")}
                  className="ml-auto group inline-flex items-center gap-2 h-[34px] pl-2 pr-2.5 rounded-full border border-gray-200 bg-white text-[12px] font-semibold text-gray-600 cursor-pointer shadow-sm transition-all hover:border-[#C6A15B] hover:text-[#171826] hover:shadow-[0_6px_16px_-8px_rgba(198,161,91,0.85)] hover:-translate-y-[1px]"
                >
                  <span className="w-6 h-6 rounded-full bg-[#FBF6EC] text-[#B79351] flex items-center justify-center shrink-0">
                    <FiUser size={12} />
                  </span>
                  Hồ sơ nhân viên
                  <FiChevronRight
                    size={13}
                    className="text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#C6A15B]"
                  />
                </button>
              </Tooltip>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[52vh] p-4 space-y-3 bg-[#FAFAFB]">
            {!staffId ? (
              <div className="h-full flex items-center justify-center">
                <Empty description="Chọn một nhân viên ở cột trái để bắt đầu" />
              </div>
            ) : !thread.length ? (
              <div className="h-full flex items-center justify-center">
                <Empty
                  description={
                    isAdmin
                      ? "Chưa có tin nhắn — nhắn việc đầu tiên cho nhân viên này"
                      : "Chưa có tin nhắn nào từ admin"
                  }
                />
              </div>
            ) : (
              <>
                {thread.map(bubble)}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {(staffId || !isAdmin) && composer}
        </div>
      </div>

      {isAdmin && (
        <div className="text-xs text-gray-400 flex items-center gap-1.5">
          <FiCheck size={13} /> Nhân viên bấm “Đã xử lý” trên tin của bạn thì
          tin đó sẽ hiện nhãn xanh “đã xử lý”.
        </div>
      )}
    </div>
  );
}
