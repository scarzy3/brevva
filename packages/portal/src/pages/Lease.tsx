import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { FileText, Users, ClipboardList } from "lucide-react";

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function Lease() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-lease"],
    queryFn: () => api<any>("/portal/lease"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" /></div>;
  }

  if (!data?.lease) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">My Lease</h1>
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-gray-400">
          No active lease found
        </div>
      </div>
    );
  }

  const lease = data.lease;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Lease</h1>

      <div className="mb-6 rounded-xl border bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {lease.unit?.property?.name} — Unit {lease.unit?.unitNumber}
            </h2>
            <p className="text-sm text-gray-500">
              {lease.unit?.property?.address}, {lease.unit?.property?.city},{" "}
              {lease.unit?.property?.state} {lease.unit?.property?.zip}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${lease.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
            {lease.status}
          </span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Monthly Rent</p>
            <p className="text-lg font-bold">{currency(Number(lease.monthlyRent))}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Security Deposit</p>
            <p className="text-lg font-bold">{currency(Number(lease.securityDeposit))}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Start Date</p>
            <p className="text-lg font-bold">{new Date(lease.startDate).toLocaleDateString()}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">End Date</p>
            <p className="text-lg font-bold">{new Date(lease.endDate).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {data.signedAt && (
        <p className="mb-6 text-sm text-gray-500">
          You signed this lease on {new Date(data.signedAt).toLocaleDateString()}.
          {data.isPrimary && " (Primary tenant)"}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tenants */}
        <div className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <Users className="h-4 w-4" /> Tenants on Lease
          </h3>
          <div className="space-y-2">
            {(lease.tenants ?? []).map((lt: any) => (
              <div key={lt.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {lt.tenant?.firstName} {lt.tenant?.lastName}
                </span>
                <div className="flex gap-2">
                  {lt.isPrimary && (
                    <span className="rounded bg-teal-100 px-1.5 py-0.5 text-xs text-teal-700">Primary</span>
                  )}
                  {lt.signedAt ? (
                    <span className="text-xs text-green-600">Signed</span>
                  ) : (
                    <span className="text-xs text-yellow-600">Not signed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Addendums */}
        <div className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <ClipboardList className="h-4 w-4" /> Addendums
          </h3>
          <div className="space-y-2">
            {(lease.addendums ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">No addendums</p>
            ) : (
              lease.addendums.map((a: any) => (
                <div key={a.id} className="text-sm">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-gray-400">
                    Added {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
