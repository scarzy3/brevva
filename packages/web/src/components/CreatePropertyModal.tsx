import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import type { AddressResult } from "@/components/AddressAutocomplete";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  address: z.string().min(1, "Address is required").max(500),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().length(2, "Use 2-letter state code"),
  zip: z.string().min(5, "ZIP must be 5–10 characters").max(10),
  type: z.enum(["SINGLE_FAMILY", "MULTI_FAMILY", "CONDO", "TOWNHOUSE", "COMMERCIAL"]),
  purchasePrice: z.union([z.coerce.number().positive(), z.literal("")]).optional(),
  mortgageBalance: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  notes: z.string().max(5000).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreatePropertyModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: "SINGLE_FAMILY" },
  });

  const handleAddressSelect = (result: AddressResult) => {
    setValue("address", result.address, { shouldValidate: true });
    setValue("city", result.city, { shouldValidate: true });
    setValue("state", result.state, { shouldValidate: true });
    setValue("zip", result.zip, { shouldValidate: true });
  };

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const body: Record<string, unknown> = { ...data };
      if (body.purchasePrice === "" || body.purchasePrice === undefined) delete body.purchasePrice;
      if (body.mortgageBalance === "" || body.mortgageBalance === undefined) delete body.mortgageBalance;
      if (!body.notes) delete body.notes;
      return api("/properties", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast("Property created successfully");
      reset();
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.data?.message || err?.data?.error || "Failed to create property";
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
    <Modal open={open} onClose={handleClose} title="Add Property">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <div>
          <label className={labelCls}>Property Name *</label>
          <input {...register("name")} className={inputCls} placeholder="e.g. Maple Street Duplex" />
          {errors.name && <p className={errorCls}>{errors.name.message}</p>}
        </div>

        <div>
          <label className={labelCls}>Type *</label>
          <select {...register("type")} className={inputCls}>
            <option value="SINGLE_FAMILY">Single Family</option>
            <option value="MULTI_FAMILY">Multi Family</option>
            <option value="CONDO">Condo</option>
            <option value="TOWNHOUSE">Townhouse</option>
            <option value="COMMERCIAL">Commercial</option>
          </select>
          {errors.type && <p className={errorCls}>{errors.type.message}</p>}
        </div>

        <div>
          <label className={labelCls}>Search Address</label>
          <AddressAutocomplete
            onAddressSelect={handleAddressSelect}
            placeholder="Start typing to search..."
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Address *</label>
          <input {...register("address")} className={inputCls} placeholder="123 Main St" />
          {errors.address && <p className={errorCls}>{errors.address.message}</p>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>City *</label>
            <input {...register("city")} className={inputCls} />
            {errors.city && <p className={errorCls}>{errors.city.message}</p>}
          </div>
          <div>
            <label className={labelCls}>State *</label>
            <input {...register("state")} className={inputCls} placeholder="CA" maxLength={2} />
            {errors.state && <p className={errorCls}>{errors.state.message}</p>}
          </div>
          <div>
            <label className={labelCls}>ZIP *</label>
            <input {...register("zip")} className={inputCls} placeholder="90210" />
            {errors.zip && <p className={errorCls}>{errors.zip.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Purchase Price</label>
            <input {...register("purchasePrice")} type="number" step="0.01" className={inputCls} placeholder="0.00" />
            {errors.purchasePrice && <p className={errorCls}>{errors.purchasePrice.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Mortgage Balance</label>
            <input {...register("mortgageBalance")} type="number" step="0.01" className={inputCls} placeholder="0.00" />
            {errors.mortgageBalance && <p className={errorCls}>{errors.mortgageBalance.message}</p>}
          </div>
        </div>

        <div>
          <label className={labelCls}>Notes</label>
          <textarea {...register("notes")} rows={3} className={inputCls} />
          {errors.notes && <p className={errorCls}>{errors.notes.message}</p>}
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
            {mutation.isPending ? "Creating..." : "Create Property"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
