import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Building2,
  Users,
  DollarSign,
  Wrench,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "blue",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`rounded-lg p-2.5 ${colors[color] ?? colors.blue}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<{ kpis: Record<string, any>; recentActivity: Record<string, any[]> }>("/dashboard"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  }

  const kpis = data?.kpis;
  if (!kpis) return null;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>

      {/* KPI Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Properties" value={kpis.properties} icon={Building2} />
        <StatCard
          label="Occupancy Rate"
          value={`${kpis.units?.occupancyRate ?? 0}%`}
          sub={`${kpis.units?.byStatus?.OCCUPIED ?? 0} / ${kpis.units?.total ?? 0} units`}
          icon={Users}
          color="green"
        />
        <StatCard
          label="Monthly Income"
          value={currency(kpis.financials?.monthlyIncome ?? 0)}
          sub={`Net: ${currency(kpis.financials?.netIncome ?? 0)}`}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          label="Collection Rate"
          value={`${kpis.financials?.collectionRate ?? 0}%`}
          sub={`${currency(kpis.financials?.collectedRent ?? 0)} / ${currency(kpis.financials?.expectedRent ?? 0)}`}
          icon={TrendingUp}
          color="purple"
        />
        <StatCard
          label="Open Maintenance"
          value={kpis.openMaintenanceRequests ?? 0}
          icon={Wrench}
          color="amber"
        />
        <StatCard
          label="Unread Messages"
          value={kpis.unreadMessages ?? 0}
          icon={AlertTriangle}
          color="red"
        />
        <StatCard
          label="Monthly Expenses"
          value={currency(kpis.financials?.monthlyExpenses ?? 0)}
          icon={DollarSign}
          color="red"
        />
        <StatCard
          label="Outstanding Late Fees"
          value={currency(kpis.outstandingLateFees?.total ?? 0)}
          sub={`${kpis.outstandingLateFees?.count ?? 0} fees`}
          icon={AlertTriangle}
          color="amber"
        />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 font-semibold">Recent Payments</h2>
          <div className="space-y-3">
            {(data?.recentActivity?.payments ?? []).slice(0, 5).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{p.tenant?.firstName} {p.tenant?.lastName}</p>
                  <p className="text-gray-400">{p.lease?.unit?.property?.name} #{p.lease?.unit?.unitNumber}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{currency(Number(p.amount))}</p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${p.status === "COMPLETED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
            {(data?.recentActivity?.payments ?? []).length === 0 && (
              <p className="text-sm text-gray-400">No recent payments</p>
            )}
          </div>
        </div>

        {/* Leases Expiring Soon */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 font-semibold">Leases Expiring Soon</h2>
          <div className="space-y-3">
            {(data?.recentActivity?.leasesExpiringSoon ?? []).slice(0, 5).map((l: any) => (
              <div key={l.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{l.unit?.property?.name} #{l.unit?.unitNumber}</p>
                  <p className="text-gray-400">
                    {l.tenants?.[0]?.tenant?.firstName} {l.tenants?.[0]?.tenant?.lastName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-amber-600">
                    {new Date(l.endDate).toLocaleDateString()}
                  </p>
                  <p className="text-gray-400">{currency(Number(l.monthlyRent))}/mo</p>
                </div>
              </div>
            ))}
            {(data?.recentActivity?.leasesExpiringSoon ?? []).length === 0 && (
              <p className="text-sm text-gray-400">No leases expiring soon</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
