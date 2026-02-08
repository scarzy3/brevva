import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, Search, Building2, MapPin } from "lucide-react";

export default function Properties() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["properties", page, search],
    queryFn: () =>
      api<{ data: any[]; pagination: any }>("/properties", {
        params: { page, limit: 20, search: search || undefined },
      }),
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Properties</h1>
        <Link
          to="/properties/new"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Add Property
        </Link>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search properties..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full rounded-lg border py-2.5 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.data ?? []).map((p: any) => (
            <Link
              key={p.id}
              to={`/properties/${p.id}`}
              className="rounded-xl border bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold">{p.name}</h3>
              </div>
              <div className="flex items-start gap-1.5 text-sm text-gray-500">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{p.address}, {p.city}, {p.state} {p.zip}</span>
              </div>
              <div className="mt-3 flex gap-3 text-xs">
                <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                  {p._count?.units ?? 0} units
                </span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${p.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {p.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {data.pagination.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.pagination.totalPages}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
