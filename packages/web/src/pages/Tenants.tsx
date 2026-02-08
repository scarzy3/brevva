import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, Search } from "lucide-react";
import CreateTenantModal from "@/components/CreateTenantModal";

export default function Tenants() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tenants", page, search],
    queryFn: () =>
      api<{ data: any[]; pagination: any }>("/tenants", {
        params: { page, limit: 20, search: search || undefined },
      }),
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Tenants</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Add Tenant
        </button>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search tenants..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full rounded-lg border py-2.5 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></td></tr>
            ) : (data?.data ?? []).length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No tenants found</td></tr>
            ) : (
              (data?.data ?? []).map((t: any) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/tenants/${t.id}`} className="font-medium text-blue-600 hover:underline">
                      {t.firstName} {t.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.email}</td>
                  <td className="px-4 py-3 text-gray-500">{t.phone ?? "\u2014"}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {t.currentUnit ? `${t.currentUnit.property?.name ?? ""} #${t.currentUnit.unitNumber}` : "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.status === "ACTIVE" ? "bg-green-100 text-green-700" : t.status === "PENDING" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>
                      {t.status}
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

      <CreateTenantModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
