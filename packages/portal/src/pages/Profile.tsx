import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { User, Home, Car, PawPrint, FileText } from "lucide-react";

export default function Profile() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["portal-profile"],
    queryFn: () => api<any>("/portal/profile"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" /></div>;
  }

  if (!profile) return null;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Profile</h1>

      {/* Personal Info */}
      <div className="mb-6 rounded-xl border bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><User className="h-4 w-4" /> Personal Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-gray-500">Full Name</p>
            <p className="font-medium">{profile.firstName} {profile.lastName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Email</p>
            <p className="font-medium">{profile.email}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Phone</p>
            <p className="font-medium">{profile.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Emergency Contact</p>
            <p className="font-medium">{profile.emergencyContact ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* Current Unit */}
      {profile.currentUnit && (
        <div className="mb-6 rounded-xl border bg-white p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><Home className="h-4 w-4" /> Current Unit</h2>
          <p className="font-medium">{profile.currentUnit.property?.name} — Unit {profile.currentUnit.unitNumber}</p>
          <p className="text-sm text-gray-500">
            {profile.currentUnit.property?.address}, {profile.currentUnit.property?.city},{" "}
            {profile.currentUnit.property?.state} {profile.currentUnit.property?.zip}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Vehicles */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Car className="h-4 w-4" /> Vehicles</h2>
          {(profile.vehicles ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No vehicles registered</p>
          ) : (
            <div className="space-y-3">
              {profile.vehicles.map((v: any) => (
                <div key={v.id} className="text-sm">
                  <p className="font-medium">{v.year} {v.make} {v.model}</p>
                  <p className="text-gray-400">{v.color} — {v.licensePlate} ({v.state})</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pets */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><PawPrint className="h-4 w-4" /> Pets</h2>
          {(profile.pets ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No pets registered</p>
          ) : (
            <div className="space-y-3">
              {profile.pets.map((p: any) => (
                <div key={p.id} className="text-sm">
                  <p className="font-medium">{p.name} ({p.type})</p>
                  <p className="text-gray-400">{p.breed} — {p.weight}lbs</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> Documents</h2>
          {(profile.documents ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No documents uploaded</p>
          ) : (
            <div className="space-y-2">
              {profile.documents.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-gray-400">{d.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
