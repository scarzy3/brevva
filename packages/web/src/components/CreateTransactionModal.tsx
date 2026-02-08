import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";

const schema = z.object({
  propertyId: z.string().min(1, "Property is required"),
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().min(1, "Category is required").max(100),
  subcategory: z.string().max(100).optional(),
  amount: z.coerce.number().positive("Amount must be positive"),
  date: z.string().min(1, "Date is required"),
  description: z.string().max(2000).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateTransactionModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: propertiesData } = useQuery({
    queryKey: ["properties-list"],
    queryFn: () => api<{ data: any[] }>("/properties", { params: { limit: 100 } }),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: "INCOME", date: new Date().toISOString().slice(0, 10) },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const body: Record<string, unknown> = { ...data };
      if (!body.subcategory) delete body.subcategory;
      if (!body.description) delete body.description;
      return api("/transactions", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast("Transaction recorded successfully");
      reset();
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.data?.message || err?.data?.error || "Failed to record transaction";
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

  return (
    <Modal open={open} onClose={handleClose} title="Record Transaction">
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
            <label className={labelCls}>Type *</label>
            <select {...register("type")} className={inputCls}>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
            </select>
            {errors.type && <p className={errorCls}>{errors.type.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Date *</label>
            <input {...register("date")} type="date" className={inputCls} />
            {errors.date && <p className={errorCls}>{errors.date.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Category *</label>
            <input {...register("category")} className={inputCls} placeholder="e.g. Rent Income" />
            {errors.category && <p className={errorCls}>{errors.category.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Subcategory</label>
            <input {...register("subcategory")} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Amount *</label>
          <input {...register("amount")} type="number" step="0.01" className={inputCls} placeholder="0.00" />
          {errors.amount && <p className={errorCls}>{errors.amount.message}</p>}
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea {...register("description")} rows={3} className={inputCls} />
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
            {mutation.isPending ? "Saving..." : "Record Transaction"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
