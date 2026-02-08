import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, Search } from "lucide-react";
import CreateVendorModal from "@/components/CreateVendorModal";

export default function Vendors() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["vendors", page, search],
    queryFn: () =>
      api<{ data: any[]; pagination: any }>("/vendors", {
        params: { page, limit: 20, search: search || undefined },
      }),
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Vendors</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Add Vendor
        </button>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search vendors..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full rounded-lg border py-2.5 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : (data?.data ?? []).length === 0 ? (
          <p className="col-span-full text-center text-gray-400 py-12">No vendors found</p>
        ) : (
          (data?.data ?? []).map((v: any) => (
            <div key={v.id} className="rounded-xl border bg-white p-5">
              <h3 className="font-semibold">{v.companyName}</h3>
              {v.contactName && <p className="text-sm text-gray-500">{v.contactName}</p>}
              <div className="mt-2 space-y-1 text-sm text-gray-500">
                {v.email && <p>{v.email}</p>}
                {v.phone && <p>{v.phone}</p>}
              </div>
              {v.specialty && (
                <span className="mt-3 inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {v.specialty}
                </span>
              )}
              <div className="mt-3 flex gap-3 text-xs text-gray-400">
                <span>{v._count?.maintenanceRequests ?? 0} jobs</span>
                <span>{v._count?.transactions ?? 0} transactions</span>
              </div>
            </div>
          ))
        )}
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
          <span className="text-sm text-gray-500">Page {page} of {data.pagination.totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.totalPages} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
        </div>
      )}

      <CreateVendorModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
