import { Routes, Route } from "react-router";
import Layout from "@/components/Layout";
import PrivateRoute from "@/components/PrivateRoute";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Properties from "@/pages/Properties";
import PropertyDetail from "@/pages/PropertyDetail";
import Tenants from "@/pages/Tenants";
import TenantDetail from "@/pages/TenantDetail";
import Leases from "@/pages/Leases";
import LeaseDetail from "@/pages/LeaseDetail";
import Payments from "@/pages/Payments";
import Transactions from "@/pages/Transactions";
import Maintenance from "@/pages/Maintenance";
import Vendors from "@/pages/Vendors";
import Messages from "@/pages/Messages";
import Reports from "@/pages/Reports";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="properties" element={<Properties />} />
        <Route path="properties/:id" element={<PropertyDetail />} />
        <Route path="tenants" element={<Tenants />} />
        <Route path="tenants/:id" element={<TenantDetail />} />
        <Route path="leases" element={<Leases />} />
        <Route path="leases/:id" element={<LeaseDetail />} />
        <Route path="payments" element={<Payments />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="messages" element={<Messages />} />
        <Route path="reports" element={<Reports />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
