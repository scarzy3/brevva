import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";

const schema = z.object({
  propertyId: z.string().min(1, "Property is required"),
  unitId: z.string().min(1, "Unit is required"),
  tenantId: z.string().min(1, "Tenant is required"),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().min(1, "Description is required").max(5000),
  priority: z.enum(["EMERGENCY", "URGENT", "ROUTINE", "COSMETIC"]),
  category: z.string().max(100).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateMaintenanceModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: propertiesData } = useQuery({
    queryKey: ["properties-list"],
    queryFn: () => api<{ data: any[] }>("/properties", { params: { limit: 100 } }),
    enabled: open,
  });

  const { data: tenantsData } = useQuery({
    queryKey: ["tenants-list"],
    queryFn: () => api<{ data: any[] }>("/tenants", { params: { limit: 100 } }),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: "ROUTINE" },
  });

  const selectedPropertyId = watch("propertyId");

  const { data: unitsData } = useQuery({
    queryKey: ["property-units", selectedPropertyId],
    queryFn: () =>
      api<{ data: any[] }>(`/properties/${selectedPropertyId}/units`, {
        params: { limit: 100 },
      }),
    enabled: !!selectedPropertyId,
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const body: Record<string, unknown> = { ...data };
      if (!body.category) delete body.category;
      return api("/maintenance", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      toast("Maintenance request created successfully");
      reset();
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.data?.message || err?.data?.error || "Failed to create request";
      toast(msg, "error");
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const inputCls =
    "w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";
  const labelCls = "mb-1 block text-sm font-medium text-gray-700";
  const errorCls = "mt-1 text-xs text-red-600";

  const properties = propertiesData?.data ?? [];
  const units = unitsData?.data ?? [];
  const tenants = tenantsData?.data ?? [];

  return (
    <Modal open={open} onClose={handleClose} title="New Maintenance Request">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <div>
          <label className={labelCls}>Property *</label>
          <select {...register("propertyId")} className={inputCls}>
            <option value="">Select a property</option>
            {properties.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.propertyId && <p className={errorCls}>{errors.propertyId.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Unit *</label>
            <select {...register("unitId")} className={inputCls} disabled={!selectedPropertyId}>
              <option value="">Select a unit</option>
              {units.map((u: any) => (
                <option key={u.id} value={u.id}>
                  Unit {u.unitNumber}
                </option>
              ))}
            </select>
            {errors.unitId && <p className={errorCls}>{errors.unitId.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Tenant *</label>
            <select {...register("tenantId")} className={inputCls}>
              <option value="">Select a tenant</option>
              {tenants.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                </option>
              ))}
            </select>
            {errors.tenantId && <p className={errorCls}>{errors.tenantId.message}</p>}
          </div>
        </div>

        <div>
          <label className={labelCls}>Title *</label>
          <input {...register("title")} className={inputCls} placeholder="e.g. Leaky faucet in kitchen" />
          {errors.title && <p className={errorCls}>{errors.title.message}</p>}
        </div>

        <div>
          <label className={labelCls}>Description *</label>
          <textarea {...register("description")} rows={3} className={inputCls} placeholder="Describe the issue..." />
          {errors.description && <p className={errorCls}>{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Priority *</label>
            <select {...register("priority")} className={inputCls}>
              <option value="ROUTINE">Routine</option>
              <option value="COSMETIC">Cosmetic</option>
              <option value="URGENT">Urgent</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <input {...register("category")} className={inputCls} placeholder="e.g. Plumbing" />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t pt-4">
          <button type="button" onClick={handleClose} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Creating..." : "Create Request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
