import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";

const schema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email").max(254),
  phone: z.string().max(20).optional(),
  status: z.enum(["PROSPECT", "APPLICANT", "ACTIVE", "FORMER", "EVICTED"]).optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  employerName: z.string().max(200).optional(),
  monthlyIncome: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  notes: z.string().max(5000).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateTenantModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: "PROSPECT" },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const body: Record<string, unknown> = { ...data };
      if (body.monthlyIncome === "" || body.monthlyIncome === undefined) delete body.monthlyIncome;
      if (!body.phone) delete body.phone;
      if (!body.emergencyContactName) delete body.emergencyContactName;
      if (!body.emergencyContactPhone) delete body.emergencyContactPhone;
      if (!body.employerName) delete body.employerName;
      if (!body.notes) delete body.notes;
      return api("/tenants", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast("Tenant created successfully");
      reset();
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.data?.message || err?.data?.error || "Failed to create tenant";
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

  return (
    <Modal open={open} onClose={handleClose} title="Add Tenant">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>First Name *</label>
            <input {...register("firstName")} className={inputCls} />
            {errors.firstName && <p className={errorCls}>{errors.firstName.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Last Name *</label>
            <input {...register("lastName")} className={inputCls} />
            {errors.lastName && <p className={errorCls}>{errors.lastName.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Email *</label>
            <input {...register("email")} type="email" className={inputCls} />
            {errors.email && <p className={errorCls}>{errors.email.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input {...register("phone")} className={inputCls} placeholder="(555) 123-4567" />
            {errors.phone && <p className={errorCls}>{errors.phone.message}</p>}
          </div>
        </div>

        <div>
          <label className={labelCls}>Status</label>
          <select {...register("status")} className={inputCls}>
            <option value="PROSPECT">Prospect</option>
            <option value="APPLICANT">Applicant</option>
            <option value="ACTIVE">Active</option>
            <option value="FORMER">Former</option>
            <option value="EVICTED">Evicted</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Emergency Contact</label>
            <input {...register("emergencyContactName")} className={inputCls} placeholder="Name" />
          </div>
          <div>
            <label className={labelCls}>Emergency Phone</label>
            <input {...register("emergencyContactPhone")} className={inputCls} placeholder="Phone" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Employer</label>
            <input {...register("employerName")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Monthly Income</label>
            <input {...register("monthlyIncome")} type="number" step="0.01" className={inputCls} placeholder="0.00" />
          </div>
        </div>

        <div>
          <label className={labelCls}>Notes</label>
          <textarea {...register("notes")} rows={3} className={inputCls} />
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
            {mutation.isPending ? "Creating..." : "Create Tenant"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
