import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import {
  ArrowLeft,
  Upload,
  FileText,
  X,
  Search,
  Plus,
  Check,
  Save,
  Send,
  Loader2,
  Mail,
  Phone,
  Trash2,
} from "lucide-react";

// Types
interface Property {
  id: string;
  name: string;
  address: string;
}

interface Unit {
  id: string;
  unitNumber: string;
  status: string;
  rent: number;
}

interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

interface SelectedTenant extends Tenant {
  isPrimary: boolean;
}

interface NewTenantForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const labelCls = "mb-1 block text-sm font-medium text-gray-700";
const inputCls =
  "w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";
const errorCls = "mt-1 text-xs text-red-600";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadLease() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- File state ---
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // --- Property & Unit ---
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");

  // --- Tenants ---
  const [selectedTenants, setSelectedTenants] = useState<SelectedTenant[]>([]);
  const [tenantSearch, setTenantSearch] = useState("");
  const [showNewTenantForm, setShowNewTenantForm] = useState(false);

  // --- Lease terms ---
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [monthToMonth, setMonthToMonth] = useState(false);
  const [monthlyRent, setMonthlyRent] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [rentDueDay, setRentDueDay] = useState(1);
  const [lateFeeAmount, setLateFeeAmount] = useState("");
  const [gracePeriodDays, setGracePeriodDays] = useState(5);

  // --- Form errors ---
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Submitting state ---
  const [submitting, setSubmitting] = useState(false);

  // --- Data fetching ---
  const { data: propertiesData } = useQuery({
    queryKey: ["properties", "upload-lease"],
    queryFn: () =>
      api<{ data: Property[] }>("/properties", { params: { limit: 100 } }),
  });

  const { data: unitsData } = useQuery({
    queryKey: ["units", "upload-lease", propertyId],
    queryFn: () =>
      api<{ data: Unit[] }>(`/properties/${propertyId}/units`, {
        params: { limit: 100 },
      }),
    enabled: !!propertyId,
  });

  const { data: tenantSearchData, isLoading: tenantSearchLoading } = useQuery({
    queryKey: ["tenants", "upload-lease", tenantSearch],
    queryFn: () =>
      api<{ data: Tenant[] }>("/tenants", {
        params: { search: tenantSearch || undefined, limit: 50 },
      }),
    enabled: tenantSearch.length > 0,
  });

  // New tenant form
  const {
    register,
    handleSubmit: handleNewTenantSubmit,
    reset: resetNewTenant,
    formState: { errors: newTenantErrors },
  } = useForm<NewTenantForm>({
    defaultValues: { firstName: "", lastName: "", email: "", phone: "" },
  });

  const createTenantMutation = useMutation({
    mutationFn: (data: NewTenantForm) =>
      api<Tenant>("/tenants", {
        method: "POST",
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone || undefined,
        }),
      }),
    onSuccess: (newTenant) => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      const isPrimary = selectedTenants.length === 0;
      setSelectedTenants((prev) => [...prev, { ...newTenant, isPrimary }]);
      toast("Tenant created and added");
      resetNewTenant();
      setShowNewTenantForm(false);
    },
    onError: (err: any) => {
      toast(err?.data?.error?.message || err?.data?.message || "Failed to create tenant", "error");
    },
  });

  // --- File handling ---
  const validateFile = (f: File): string | null => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(f.type)) {
      return "Only PDF and DOCX files are allowed";
    }
    if (f.size > 10 * 1024 * 1024) {
      return "File size must be under 10MB";
    }
    return null;
  };

  const handleFileSelect = (f: File) => {
    const err = validateFile(f);
    if (err) {
      setFileError(err);
      return;
    }
    setFile(f);
    setFileError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
    e.target.value = "";
  };

  // --- Tenant helpers ---
  const addTenant = useCallback(
    (tenant: Tenant) => {
      if (selectedTenants.some((t) => t.id === tenant.id)) return;
      if (!tenant.email) return;
      const isPrimary = selectedTenants.length === 0;
      setSelectedTenants((prev) => [...prev, { ...tenant, isPrimary }]);
    },
    [selectedTenants]
  );

  const removeTenant = useCallback((id: string) => {
    setSelectedTenants((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length > 0 && !next.some((t) => t.isPrimary)) {
        next[0]!.isPrimary = true;
      }
      return [...next];
    });
  }, []);

  const setPrimary = useCallback((id: string) => {
    setSelectedTenants((prev) =>
      prev.map((t) => ({ ...t, isPrimary: t.id === id }))
    );
  }, []);

  // --- Validation ---
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!file) e.file = "A document file is required";
    if (!unitId) e.unitId = "Please select a property and unit";
    if (selectedTenants.length === 0) e.tenants = "At least one tenant is required";
    if (!startDate) e.startDate = "Start date is required";
    if (!monthToMonth && !endDate) e.endDate = "End date is required";
    if (!monthlyRent || Number(monthlyRent) <= 0) e.monthlyRent = "Monthly rent is required";
    if (endDate && startDate && new Date(endDate) <= new Date(startDate)) {
      e.endDate = "End date must be after start date";
    }
    return e;
  };

  // --- Submit ---
  const handleSubmit = async (sendForSignature: boolean) => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file!);
      formData.append("unitId", unitId);
      formData.append("tenantIds", JSON.stringify(selectedTenants.map((t) => t.id)));
      formData.append("primaryTenantId", selectedTenants.find((t) => t.isPrimary)?.id ?? selectedTenants[0]!.id);
      formData.append("startDate", new Date(startDate).toISOString());
      formData.append(
        "endDate",
        monthToMonth
          ? new Date(new Date(startDate).getFullYear() + 100, 0, 1).toISOString()
          : new Date(endDate).toISOString()
      );
      formData.append("monthlyRent", monthlyRent);
      formData.append("securityDeposit", securityDeposit || "0");
      formData.append("rentDueDay", String(rentDueDay));
      if (lateFeeAmount) formData.append("lateFeeAmount", lateFeeAmount);
      formData.append("gracePeriodDays", String(gracePeriodDays));

      const lease = await api<any>("/leases/upload", {
        method: "POST",
        body: formData,
      });

      if (sendForSignature) {
        await api(`/leases/${lease.id}/send-for-signature`, { method: "POST" });
        toast("Lease uploaded and sent for signature");
      } else {
        toast("Lease uploaded as draft");
      }

      queryClient.invalidateQueries({ queryKey: ["leases"] });
      navigate(`/leases/${lease.id}`);
    } catch (err: any) {
      const msg = err?.data?.error?.message || err?.data?.error || err?.data?.message || err?.message || "Failed to upload lease";
      toast(typeof msg === "string" ? msg : String(msg), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const properties = propertiesData?.data ?? [];
  const units = unitsData?.data ?? [];
  const tenantResults = tenantSearchData?.data ?? [];
  const isPdf = file?.type === "application/pdf";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/leases")}
          className="rounded-lg border bg-white p-2 text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Upload className="h-5 w-5 text-blue-600" />
            Upload Lease Document
          </h1>
          <p className="text-sm text-gray-500">
            Upload your own lease document instead of using the builder
          </p>
        </div>
      </div>

      {/* 1. Upload Document */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Upload Document</h2>

        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-colors ${
              dragOver
                ? "border-blue-400 bg-blue-50"
                : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"
            }`}
          >
            <Upload className="h-10 w-10 text-gray-400" />
            <p className="mt-3 text-sm font-medium text-gray-700">
              Drag and drop your lease document here
            </p>
            <p className="mt-1 text-xs text-gray-500">or click to browse</p>
            <p className="mt-2 text-xs text-gray-400">PDF or DOCX, max 10MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between rounded-lg border bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <button
                onClick={() => { setFile(null); setFileError(null); }}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {isPdf && (
              <div className="mt-4 overflow-hidden rounded-lg border">
                <iframe
                  src={URL.createObjectURL(file)}
                  title="PDF Preview"
                  className="h-[400px] w-full"
                />
              </div>
            )}
          </div>
        )}

        {fileError && <p className={errorCls + " mt-2"}>{fileError}</p>}
        {errors.file && <p className={errorCls + " mt-2"}>{errors.file}</p>}
      </div>

      {/* 2. Select Property & Unit */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Property &amp; Unit</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Property *</label>
            <select
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setUnitId("");
              }}
              className={inputCls}
            >
              <option value="">Select property...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Unit *</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className={inputCls}
              disabled={!propertyId}
            >
              <option value="">Select unit...</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  #{u.unitNumber} ({u.status})
                </option>
              ))}
            </select>
          </div>
        </div>
        {errors.unitId && <p className={errorCls + " mt-2"}>{errors.unitId}</p>}
      </div>

      {/* 3. Select/Add Tenants */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Tenants</h2>

        {/* Selected tenants */}
        {selectedTenants.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-500">
              Selected Tenants ({selectedTenants.length})
            </h3>
            <div className="space-y-2">
              {selectedTenants.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border bg-gray-50 px-4 py-3"
                >
                  <div className="flex items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="primaryTenant"
                        checked={t.isPrimary}
                        onChange={() => setPrimary(t.id)}
                        className="h-4 w-4 text-blue-600"
                      />
                      <span className="text-xs text-gray-500">Primary</span>
                    </label>
                    <div>
                      <p className="text-sm font-medium">
                        {t.firstName} {t.lastName}
                        {t.isPrimary && (
                          <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                            Primary
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {t.email}
                        </span>
                        {t.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {t.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeTenant(t.id)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search existing tenants */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-500">
            Search Existing Tenants
          </h3>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={tenantSearch}
              onChange={(e) => setTenantSearch(e.target.value)}
              className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {tenantSearch.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border">
              {tenantSearchLoading ? (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : tenantResults.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">
                  No tenants found
                </p>
              ) : (
                <div className="divide-y">
                  {tenantResults.map((t) => {
                    const isAdded = selectedTenants.some((st) => st.id === t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => addTenant(t)}
                        disabled={isAdded || !t.email}
                        className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors ${
                          isAdded
                            ? "cursor-not-allowed bg-green-50 text-green-700"
                            : !t.email
                              ? "cursor-not-allowed bg-gray-50 text-gray-400"
                              : "hover:bg-blue-50"
                        }`}
                      >
                        <div>
                          <p className="font-medium">
                            {t.firstName} {t.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t.email || "No email"}
                            {t.phone ? ` | ${t.phone}` : ""}
                          </p>
                        </div>
                        {isAdded ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : !t.email ? (
                          <span className="text-xs text-red-400">No email</span>
                        ) : (
                          <Plus className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Create new tenant */}
        {!showNewTenantForm ? (
          <button
            onClick={() => setShowNewTenantForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600"
          >
            <Plus className="h-4 w-4" />
            Create New Tenant
          </button>
        ) : (
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-500">New Tenant</h3>
              <button
                onClick={() => { setShowNewTenantForm(false); resetNewTenant(); }}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={handleNewTenantSubmit((d) => createTenantMutation.mutate(d))}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>First Name *</label>
                  <input
                    {...register("firstName", { required: "Required" })}
                    className={inputCls}
                  />
                  {newTenantErrors.firstName && (
                    <p className={errorCls}>{newTenantErrors.firstName.message}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Last Name *</label>
                  <input
                    {...register("lastName", { required: "Required" })}
                    className={inputCls}
                  />
                  {newTenantErrors.lastName && (
                    <p className={errorCls}>{newTenantErrors.lastName.message}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Email *</label>
                  <input
                    {...register("email", {
                      required: "Required",
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Invalid email",
                      },
                    })}
                    type="email"
                    className={inputCls}
                  />
                  {newTenantErrors.email && (
                    <p className={errorCls}>{newTenantErrors.email.message}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input
                    {...register("phone")}
                    className={inputCls}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowNewTenantForm(false); resetNewTenant(); }}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTenantMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createTenantMutation.isPending && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  Add Tenant
                </button>
              </div>
            </form>
          </div>
        )}

        {errors.tenants && <p className={errorCls + " mt-2"}>{errors.tenants}</p>}
      </div>

      {/* 4. Basic Lease Terms */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Lease Terms</h2>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
              {errors.startDate && <p className={errorCls}>{errors.startDate}</p>}
            </div>
            <div>
              <label className={labelCls}>End Date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
                disabled={monthToMonth}
              />
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={monthToMonth}
                  onChange={(e) => setMonthToMonth(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-xs text-gray-500">Month-to-month</span>
              </label>
              {errors.endDate && <p className={errorCls}>{errors.endDate}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Monthly Rent *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  className={inputCls + " pl-7"}
                  placeholder="0.00"
                />
              </div>
              {errors.monthlyRent && <p className={errorCls}>{errors.monthlyRent}</p>}
            </div>
            <div>
              <label className={labelCls}>Security Deposit</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={securityDeposit}
                  onChange={(e) => setSecurityDeposit(e.target.value)}
                  className={inputCls + " pl-7"}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Rent Due Day</label>
              <select
                value={rentDueDay}
                onChange={(e) => setRentDueDay(Number(e.target.value))}
                className={inputCls}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d === 1 ? "1st" : d === 2 ? "2nd" : d === 3 ? "3rd" : `${d}th`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Late Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={lateFeeAmount}
                  onChange={(e) => setLateFeeAmount(e.target.value)}
                  className={inputCls + " pl-7"}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Grace Period (days)</label>
              <input
                type="number"
                min="0"
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                className={inputCls}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 5. Actions */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <button
          onClick={() => navigate("/leases")}
          className="rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => handleSubmit(false)}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save as Draft
        </button>
        <button
          onClick={() => handleSubmit(true)}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send for Signature
        </button>
      </div>
    </div>
  );
}
