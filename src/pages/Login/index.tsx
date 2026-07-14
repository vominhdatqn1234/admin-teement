import { Button, Input, message } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../hooks/useAdminAuth";

export default function Login() {
  const { login, checking } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!email || !password)
      return message.error("Nhập email và mật khẩu admin");
    const user = await login(email.trim(), password);
    if (user) {
      message.success("Đăng nhập admin thành công");
      navigate("/app/finance");
    } else {
      message.error("Sai thông tin hoặc tài khoản không có quyền Admin");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px] bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-8 h-8 rounded-lg bg-[#171826] text-white text-sm font-bold flex items-center justify-center">
            T
          </span>
          <div>
            <div className="font-bold text-gray-900">Teement Admin Portal</div>
            <div className="text-xs text-gray-400">
              Quản lý Seller & Tài chính
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1.5">
              Email admin
            </div>
            <Input
              className="h-[42px] rounded-lg"
              placeholder="admin@teementpod.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onPressEnter={handleLogin}
            />
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1.5">
              Mật khẩu
            </div>
            <Input.Password
              className="h-[42px] rounded-lg"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onPressEnter={handleLogin}
            />
          </div>
          <Button
            type="primary"
            block
            loading={checking}
            onClick={handleLogin}
            className="h-[44px] rounded-lg bg-[#171826] font-bold"
          >
            Đăng nhập
          </Button>
          <div className="text-[11px] text-gray-400 text-center">
            Chỉ tài khoản có quyền Admin mới truy cập được portal này
          </div>
        </div>
      </div>
    </div>
  );
}
