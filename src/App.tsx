import { ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import Blanks from "./pages/Blanks";
import Colors from "./pages/Colors";
import DesignOrders from "./pages/DesignOrders";
import Finance from "./pages/Finance";
import ImportQueue from "./pages/ImportQueue";
import Login from "./pages/Login";
import Notifications from "./pages/Notifications";
import OrderCare from "./pages/OrderCare";
import PendingIds from "./pages/PendingIds";
import PodPrices from "./pages/PodPrices";
import PrintHouse from "./pages/PrintHouse";
import Tracking from "./pages/Tracking";
import Sellers from "./pages/Sellers";
import Services from "./pages/Services";
import Staff from "./pages/Staff";
import StaffChat from "./pages/StaffChat";
import ShippingPrices from "./pages/ShippingPrices";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/app" element={<AdminLayout />}>
            <Route index element={<Navigate to="/app/finance" />} />
            <Route path="finance" element={<Finance />} />
            <Route path="sellers" element={<Sellers />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="order-care" element={<OrderCare />} />
            <Route path="staff" element={<Staff />} />
            <Route path="pending-ids" element={<PendingIds />} />
            <Route path="staff-chat" element={<StaffChat />} />
            <Route path="import-queue" element={<ImportQueue />} />
            <Route path="services" element={<Services />} />
            <Route path="blanks" element={<Blanks />} />
            <Route path="colors" element={<Colors />} />
            <Route path="print-house" element={<PrintHouse />} />
            <Route path="tracking" element={<Tracking />} />
            <Route path="pod-prices" element={<PodPrices />} />
            <Route path="shipping-prices" element={<ShippingPrices />} />
            <Route path="design-orders" element={<DesignOrders />} />
          </Route>
          <Route path="*" element={<Navigate to="/app/finance" />} />
        </Routes>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
