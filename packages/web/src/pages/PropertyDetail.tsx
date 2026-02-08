import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowLeft, Home } from "lucide-react";

export default function PropertyDetail() {
  const { id } = useParams();

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: () => api<any>(`/properties/${id}`),
    enabled: !!id,
  });

  const { data: unitsData } = useQuery({
    queryKey: ["property-units", id],
    queryFn: () => api<{ data: any[] }>(`/properties/${id}/units`, { params: { limit: 100 } }),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  }

  if (!property) return <p>Property not found.</p>;

  const units = unitsData?.data ?? [];

  return (
    <div>
      <Link to="/properties" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Properties
      </Link>

      <div className="mb-6 rounded-xl border bg-white p-6">
        <h1 className="text-2xl font-bold">{property.name}</h1>
        <p className="mt-1 text-gray-500">{property.address}, {property.city}, {property.state} {property.zip}</p>
        <div className="mt-4 flex gap-3 text-sm">
          <span className={`rounded-full px-3 py-1 font-medium ${property.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
            {property.status}
          </span>
          <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">{property.type}</span>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Units ({units.length})</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {units.map((u: any) => (
          <div key={u.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-blue-600" />
              <span className="font-semibold">Unit {u.unitNumber}</span>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${u.status === "OCCUPIED" ? "bg-green-100 text-green-700" : u.status === "VACANT" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                {u.status}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
              <span>{u.bedrooms} bed</span>
              <span>{u.bathrooms} bath</span>
              <span>{u.sqFt?.toLocaleString()} sqft</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-green-600">
              ${Number(u.rent).toLocaleString()}/mo
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
