import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";

const schema = z.object({
  companyName: z.string().min(1, "Company name is required").max(200),
  contactName: z.string().max(200).optional(),
  email: z.string().email("Invalid email").max(254).or(z.literal("")).optional(),
  phone: z.string().max(20).optional(),
  specialty: z.string().max(100).optional(),
  serviceArea: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateVendorModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const body: Record<string, unknown> = { ...data };
      if (!body.contactName) delete body.contactName;
      if (!body.email) delete body.email;
      if (!body.phone) delete body.phone;
      if (!body.specialty) delete body.specialty;
      if (!body.serviceArea) delete body.serviceArea;
      if (!body.notes) delete body.notes;
      return api("/vendors", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast("Vendor added successfully");
      reset();
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.data?.message || err?.data?.error || "Failed to add vendor";
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
    <Modal open={open} onClose={handleClose} title="Add Vendor">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <div>
          <label className={labelCls}>Company Name *</label>
          <input {...register("companyName")} className={inputCls} placeholder="e.g. ABC Plumbing" />
          {errors.companyName && <p className={errorCls}>{errors.companyName.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Contact Name</label>
            <input {...register("contactName")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Specialty</label>
            <input {...register("specialty")} className={inputCls} placeholder="e.g. Plumbing" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Email</label>
            <input {...register("email")} type="email" className={inputCls} />
            {errors.email && <p className={errorCls}>{errors.email.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input {...register("phone")} className={inputCls} placeholder="(555) 123-4567" />
          </div>
        </div>

        <div>
          <label className={labelCls}>Service Area</label>
          <input {...register("serviceArea")} className={inputCls} placeholder="e.g. Los Angeles County" />
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
            {mutation.isPending ? "Adding..." : "Add Vendor"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
