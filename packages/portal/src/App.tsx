import { Routes, Route } from "react-router";
import Layout from "@/components/Layout";
import PrivateRoute from "@/components/PrivateRoute";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Lease from "@/pages/Lease";
import Payments from "@/pages/Payments";
import Maintenance from "@/pages/Maintenance";
import Messages from "@/pages/Messages";
import Profile from "@/pages/Profile";
import SignLease from "@/pages/SignLease";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/sign/:token" element={<SignLease />} />
      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="lease" element={<Lease />} />
        <Route path="payments" element={<Payments />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="messages" element={<Messages />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
