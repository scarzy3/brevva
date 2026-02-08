import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus } from "lucide-react";

const statusColors: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  ON_HOLD: "bg-gray-100 text-gray-600",
  COMPLETED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-600",
};

const priorityColors: Record<string, string> = {
  EMERGENCY: "bg-red-100 text-red-700",
  URGENT: "bg-orange-100 text-orange-700",
  ROUTINE: "bg-blue-100 text-blue-700",
  COSMETIC: "bg-gray-100 text-gray-600",
};

export default function Maintenance() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-maintenance", page],
    queryFn: () =>
      api<{ data: any[]; pagination: any }>("/portal/maintenance", {
        params: { page, limit: 20 },
      }),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Maintenance Requests</h1>
        <button className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" /> New Request
        </button>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
          </div>
        ) : (data?.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-8 text-center text-gray-400">
            No maintenance requests
          </div>
        ) : (
          (data?.data ?? []).map((r: any) => (
            <div key={r.id} className="rounded-xl border bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{r.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{r.description}</p>
                  <p className="mt-2 text-xs text-gray-400">
                    {r.property?.name} — Unit {r.unit?.unitNumber} · {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {r.status}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityColors[r.priority] ?? "bg-gray-100 text-gray-600"}`}>
                    {r.priority}
                  </span>
                </div>
              </div>
              {r.vendor && (
                <p className="mt-2 text-xs text-gray-500">
                  Assigned to: {r.vendor.companyName}
                </p>
              )}
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
    </div>
  );
}
