import { ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import Blanks from "./pages/Blanks";
import Colors from "./pages/Colors";
import DesignOrders from "./pages/DesignOrders";
import Finance from "./pages/Finance";
import Login from "./pages/Login";
import PodPrices from "./pages/PodPrices";
import PrintHouse from "./pages/PrintHouse";
import Sellers from "./pages/Sellers";
import Services from "./pages/Services";
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
            <Route path="services" element={<Services />} />
            <Route path="blanks" element={<Blanks />} />
            <Route path="colors" element={<Colors />} />
            <Route path="print-house" element={<PrintHouse />} />
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
