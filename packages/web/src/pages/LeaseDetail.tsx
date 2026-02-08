import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function LeaseDetail() {
  const { id } = useParams();

  const { data: lease, isLoading } = useQuery({
    queryKey: ["lease", id],
    queryFn: () => api<any>(`/leases/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  if (!lease) return <p>Lease not found.</p>;

  return (
    <div>
      <Link to="/leases" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Leases
      </Link>

      <div className="mb-6 rounded-xl border bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{lease.unit?.property?.name} #{lease.unit?.unitNumber}</h1>
            <p className="mt-1 text-gray-500">
              {new Date(lease.startDate).toLocaleDateString()} — {new Date(lease.endDate).toLocaleDateString()}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${lease.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
            {lease.status}
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Monthly Rent</p>
            <p className="text-lg font-bold">{currency(Number(lease.monthlyRent))}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Security Deposit</p>
            <p className="text-lg font-bold">{currency(Number(lease.securityDeposit))}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Lease Type</p>
            <p className="text-lg font-bold">{lease.leaseType}</p>
          </div>
        </div>
      </div>

      {/* Tenants */}
      <div className="mb-6 rounded-xl border bg-white p-5">
        <h2 className="mb-3 font-semibold">Tenants</h2>
        <div className="space-y-2">
          {(lease.tenants ?? []).map((lt: any) => (
            <div key={lt.id} className="flex items-center justify-between text-sm">
              <div>
                <Link to={`/tenants/${lt.tenant?.id}`} className="font-medium text-blue-600 hover:underline">
                  {lt.tenant?.firstName} {lt.tenant?.lastName}
                </Link>
                {lt.isPrimary && <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">Primary</span>}
              </div>
              <div className="text-gray-400">
                {lt.signedAt ? `Signed ${new Date(lt.signedAt).toLocaleDateString()}` : "Not signed"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Addendums */}
      {(lease.addendums ?? []).length > 0 && (
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 font-semibold">Addendums</h2>
          <div className="space-y-2">
            {lease.addendums.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{a.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
