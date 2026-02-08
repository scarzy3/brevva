import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus } from "lucide-react";

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  DRAFT: "bg-gray-100 text-gray-600",
  PENDING_SIGNATURE: "bg-yellow-100 text-yellow-700",
  EXPIRED: "bg-red-100 text-red-700",
  TERMINATED: "bg-red-100 text-red-700",
};

export default function Leases() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["leases", page, status],
    queryFn: () =>
      api<{ data: any[]; pagination: any }>("/leases", {
        params: { page, limit: 20, status: status || undefined },
      }),
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Leases</h1>
        <button
          onClick={() => navigate("/leases/new")}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New Lease
        </button>
      </div>

      <div className="mb-4">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_SIGNATURE">Pending Signature</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
          <option value="TERMINATED">Terminated</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Tenant(s)</th>
              <th className="px-4 py-3">Rent</th>
              <th className="px-4 py-3">Start</th>
              <th className="px-4 py-3">End</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></td></tr>
            ) : (data?.data ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No leases found</td></tr>
            ) : (
              (data?.data ?? []).map((l: any) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/leases/${l.id}`} className="font-medium text-blue-600 hover:underline">
                      {l.unit?.property?.name} #{l.unit?.unitNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {(l.tenants ?? []).map((lt: any) => `${lt.tenant?.firstName} ${lt.tenant?.lastName}`).join(", ") || "\u2014"}
                  </td>
                  <td className="px-4 py-3 font-medium">{currency(Number(l.monthlyRent ?? 0))}</td>
                  <td className="px-4 py-3 text-gray-500">{l.startDate ? new Date(l.startDate).toLocaleDateString() : "\u2014"}</td>
                  <td className="px-4 py-3 text-gray-500">{l.endDate ? new Date(l.endDate).toLocaleDateString() : "\u2014"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[l.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
          <span className="text-sm text-gray-500">Page {page} of {data.pagination.totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.totalPages} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
