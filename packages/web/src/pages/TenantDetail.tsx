import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowLeft, FileText, Car, PawPrint } from "lucide-react";

export default function TenantDetail() {
  const { id } = useParams();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant", id],
    queryFn: () => api<any>(`/tenants/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  if (!tenant) return <p>Tenant not found.</p>;

  return (
    <div>
      <Link to="/tenants" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Tenants
      </Link>

      <div className="mb-6 rounded-xl border bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{tenant.firstName} {tenant.lastName}</h1>
            <p className="text-gray-500">{tenant.email}</p>
            {tenant.phone && <p className="text-gray-500">{tenant.phone}</p>}
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${tenant.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
            {tenant.status}
          </span>
        </div>
        {tenant.currentUnit && (
          <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm">
            <span className="font-medium">Current Unit:</span>{" "}
            {tenant.currentUnit.property?.name} #{tenant.currentUnit.unitNumber}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Documents */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> Documents</h2>
          <div className="space-y-2">
            {(tenant.documents ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">No documents</p>
            ) : (
              tenant.documents.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span>{d.name}</span>
                  <span className="text-xs text-gray-400">{d.type}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Vehicles */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Car className="h-4 w-4" /> Vehicles</h2>
          <div className="space-y-2">
            {(tenant.vehicles ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">No vehicles</p>
            ) : (
              tenant.vehicles.map((v: any) => (
                <div key={v.id} className="text-sm">
                  <p className="font-medium">{v.year} {v.make} {v.model}</p>
                  <p className="text-gray-400">{v.color} — {v.licensePlate} ({v.state})</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pets */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><PawPrint className="h-4 w-4" /> Pets</h2>
          <div className="space-y-2">
            {(tenant.pets ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">No pets</p>
            ) : (
              tenant.pets.map((p: any) => (
                <div key={p.id} className="text-sm">
                  <p className="font-medium">{p.name} ({p.type})</p>
                  <p className="text-gray-400">{p.breed} — {p.weight}lbs</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
