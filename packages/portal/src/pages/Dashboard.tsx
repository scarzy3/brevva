import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "react-router";
import {
  FileText,
  CreditCard,
  Wrench,
  MessageSquare,
  AlertTriangle,
  Home,
} from "lucide-react";

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-dashboard"],
    queryFn: () => api<any>("/portal/dashboard"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">
        Welcome, {data.tenant?.firstName}!
      </h1>
      <p className="mb-6 text-gray-500">Here's an overview of your tenancy.</p>

      {/* Lease Card */}
      {data.lease ? (
        <Link
          to="/lease"
          className="mb-6 block rounded-xl border bg-white p-5 transition-shadow hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-teal-50 p-2.5">
              <Home className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Current Residence</p>
              <p className="font-semibold">
                {data.lease.unit?.property?.name} — Unit {data.lease.unit?.unitNumber}
              </p>
              <p className="text-sm text-gray-400">
                {data.lease.unit?.property?.address}, {data.lease.unit?.property?.city},{" "}
                {data.lease.unit?.property?.state} {data.lease.unit?.property?.zip}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-lg font-bold text-teal-600">
                {currency(Number(data.lease.monthlyRent))}/mo
              </p>
              <p className="text-xs text-gray-400">
                Lease ends {new Date(data.lease.endDate).toLocaleDateString()}
              </p>
            </div>
          </div>
        </Link>
      ) : (
        <div className="mb-6 rounded-xl border border-dashed bg-white p-5 text-center text-gray-400">
          No active lease found
        </div>
      )}

      {/* Quick Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/payments" className="rounded-xl border bg-white p-4 transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 p-2"><CreditCard className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Recent Payments</p>
              <p className="text-lg font-bold">{data.recentPayments?.length ?? 0}</p>
            </div>
          </div>
        </Link>

        <Link to="/maintenance" className="rounded-xl border bg-white p-4 transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2"><Wrench className="h-5 w-5 text-amber-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Open Requests</p>
              <p className="text-lg font-bold">{data.openMaintenanceRequests ?? 0}</p>
            </div>
          </div>
        </Link>

        <Link to="/messages" className="rounded-xl border bg-white p-4 transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2"><MessageSquare className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Unread Messages</p>
              <p className="text-lg font-bold">{data.unreadMessages ?? 0}</p>
            </div>
          </div>
        </Link>

        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-50 p-2"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Late Fees</p>
              <p className="text-lg font-bold">
                {currency((data.outstandingLateFees ?? []).reduce((sum: number, f: any) => sum + Number(f.amount), 0))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="rounded-xl border bg-white p-5">
        <h2 className="mb-4 font-semibold">Recent Payments</h2>
        <div className="space-y-3">
          {(data.recentPayments ?? []).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium">{currency(Number(p.amount))}</p>
                <p className="text-gray-400">{p.method}</p>
              </div>
              <div className="text-right">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.status === "COMPLETED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {p.status}
                </span>
                <p className="mt-0.5 text-xs text-gray-400">
                  {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "Pending"}
                </p>
              </div>
            </div>
          ))}
          {(data.recentPayments ?? []).length === 0 && (
            <p className="text-sm text-gray-400">No recent payments</p>
          )}
        </div>
      </div>
    </div>
  );
}
