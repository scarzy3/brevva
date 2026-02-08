import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  CreditCard,
  DollarSign,
  Wrench,
  HardHat,
  MessageSquare,
  BarChart3,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/properties", icon: Building2, label: "Properties" },
  { to: "/tenants", icon: Users, label: "Tenants" },
  { to: "/leases", icon: FileText, label: "Leases" },
  { to: "/payments", icon: CreditCard, label: "Payments" },
  { to: "/transactions", icon: DollarSign, label: "Transactions" },
  { to: "/maintenance", icon: Wrench, label: "Maintenance" },
  { to: "/vendors", icon: HardHat, label: "Vendors" },
  { to: "/messages", icon: MessageSquare, label: "Messages" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-gray-900 text-white transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-gray-700 px-6">
          <Building2 className="h-7 w-7 text-blue-400" />
          <Link to="/" className="text-xl font-bold tracking-tight">
            Brevva
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-700 p-4">
          <div className="mb-3 text-sm">
            <p className="font-medium">{user?.firstName} {user?.lastName}</p>
            <p className="text-gray-400">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center gap-4 border-b bg-white px-4 lg:px-8">
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 uppercase">
            {user?.role?.replace("_", " ")}
          </span>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
