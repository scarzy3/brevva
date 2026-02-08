import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { addMonths, format, getDaysInMonth, differenceInDays } from "date-fns";
import {
  Search,
  Building2,
  BedDouble,
  Bath,
  Maximize2,
  DollarSign,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Trash2,
  Check,
  Send,
  Save,
  ArrowLeft,
  ArrowRight,
  Users,
  FileText,
  ClipboardList,
  Eye,
  User,
  Mail,
  Phone,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Unit {
  id: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  rent: number;
  status: string;
  property?: {
    id: string;
    name: string;
  };
}

interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  status?: string;
}

interface SelectedTenant extends Tenant {
  isPrimary: boolean;
}

interface Clause {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  isCustom?: boolean;
}

interface LeaseTerms {
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  lateFeeAmount: number;
  lateFeeType: "FLAT" | "PERCENTAGE";
  gracePeriodDays: number;
  rentDueDay: number;
}

interface NewTenantForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

const STEPS = [
  { label: "Select Unit", icon: Building2 },
  { label: "Tenants", icon: Users },
  { label: "Lease Terms", icon: FileText },
  { label: "Clauses", icon: ClipboardList },
  { label: "Review", icon: Eye },
] as const;

const inputCls =
  "w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";
const labelCls = "mb-1 block text-sm font-medium text-gray-700";
const errorCls = "mt-1 text-xs text-red-600";
const btnPrimary =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const btnSecondary =
  "rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50";

// ---------------------------------------------------------------------------
// Step Progress Bar
// ---------------------------------------------------------------------------

function StepProgress({
  currentStep,
  completedSteps,
}: {
  currentStep: number;
  completedSteps: Set<number>;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = idx === currentStep;
          const isCompleted = completedSteps.has(idx);

          return (
            <div key={idx} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : isCompleted
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {isCompleted && !isActive ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span
                  className={`mt-1.5 text-xs font-medium ${
                    isActive
                      ? "text-blue-600"
                      : isCompleted
                        ? "text-green-600"
                        : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-0.5 flex-1 ${
                    completedSteps.has(idx) ? "bg-green-400" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Select Unit
// ---------------------------------------------------------------------------

function StepSelectUnit({
  selectedUnit,
  onSelect,
}: {
  selectedUnit: Unit | null;
  onSelect: (unit: Unit) => void;
}) {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["units"],
    queryFn: () =>
      api<{ data: Unit[] }>("/units", {
        params: { status: "VACANT" },
      }),
  });

  // Also fetch LISTED units
  const { data: listedData } = useQuery({
    queryKey: ["units", "listed"],
    queryFn: () =>
      api<{ data: Unit[] }>("/units", {
        params: { status: "LISTED" },
      }),
  });

  const allUnits = useMemo(() => {
    const vacant = data?.data ?? [];
    const listed = listedData?.data ?? [];
    const map = new Map<string, Unit>();
    for (const u of [...vacant, ...listed]) {
      map.set(u.id, u);
    }
    return Array.from(map.values());
  }, [data, listedData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allUnits;
    const q = search.toLowerCase();
    return allUnits.filter(
      (u) =>
        u.unitNumber.toLowerCase().includes(q) ||
        u.property?.name?.toLowerCase().includes(q),
    );
  }, [allUnits, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, { propertyName: string; units: Unit[] }> = {};
    for (const u of filtered) {
      const pId = u.property?.id ?? "unknown";
      if (!groups[pId]) {
        groups[pId] = {
          propertyName: u.property?.name ?? "Unknown Property",
          units: [],
        };
      }
      groups[pId].units.push(u);
    }
    return Object.values(groups).sort((a, b) =>
      a.propertyName.localeCompare(b.propertyName),
    );
  }, [filtered]);

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Select a Unit</h2>

      {/* Selected unit detail */}
      {selectedUnit && (
        <div className="mb-6 rounded-xl border-2 border-blue-500 bg-blue-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600">
                Selected Unit
              </p>
              <h3 className="text-lg font-bold">
                {selectedUnit.property?.name} #{selectedUnit.unitNumber}
              </h3>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                selectedUnit.status === "VACANT"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {selectedUnit.status}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <BedDouble className="h-4 w-4" />
              {selectedUnit.bedrooms} bed
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <Bath className="h-4 w-4" />
              {selectedUnit.bathrooms} bath
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <Maximize2 className="h-4 w-4" />
              {selectedUnit.sqft.toLocaleString()} sqft
            </div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
              <DollarSign className="h-4 w-4" />
              {currency(selectedUnit.rent)}/mo
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by property name or unit number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {/* Unit list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : grouped.length === 0 ? (
        <p className="py-8 text-center text-gray-400">
          No vacant or listed units found
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.propertyName}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-500">
                <Building2 className="h-4 w-4" />
                {group.propertyName}
              </h3>
              <div className="space-y-2">
                {group.units.map((unit) => (
                  <button
                    key={unit.id}
                    onClick={() => onSelect(unit)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50 ${
                      selectedUnit?.id === unit.id
                        ? "border-blue-500 bg-blue-50"
                        : "bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">
                          Unit {unit.unitNumber}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            unit.status === "VACANT"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {unit.status}
                        </span>
                      </div>
                      <span className="font-semibold text-gray-800">
                        {currency(unit.rent)}/mo
                      </span>
                    </div>
                    <div className="mt-1.5 flex gap-4 text-xs text-gray-500">
                      <span>{unit.bedrooms} bed</span>
                      <span>{unit.bathrooms} bath</span>
                      <span>{unit.sqft.toLocaleString()} sqft</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Select / Add Tenants
// ---------------------------------------------------------------------------

function StepTenants({
  selectedTenants,
  setSelectedTenants,
}: {
  selectedTenants: SelectedTenant[];
  setSelectedTenants: React.Dispatch<React.SetStateAction<SelectedTenant[]>>;
}) {
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["tenants", "lease-builder", search],
    queryFn: () =>
      api<{ data: Tenant[] }>("/tenants", {
        params: { search: search || undefined, limit: 50 },
      }),
    enabled: search.length > 0,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
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
      setSelectedTenants((prev) => [
        ...prev,
        { ...newTenant, isPrimary },
      ]);
      toast("Tenant created and added");
      reset();
      setShowNewForm(false);
    },
    onError: (err: any) => {
      const msg =
        err?.data?.message || err?.data?.error || "Failed to create tenant";
      toast(msg, "error");
    },
  });

  const addTenant = useCallback(
    (tenant: Tenant) => {
      if (selectedTenants.some((t) => t.id === tenant.id)) return;
      if (!tenant.email) {
        return;
      }
      const isPrimary = selectedTenants.length === 0;
      setSelectedTenants((prev) => [...prev, { ...tenant, isPrimary }]);
    },
    [selectedTenants, setSelectedTenants],
  );

  const removeTenant = useCallback(
    (id: string) => {
      setSelectedTenants((prev) => {
        const next = prev.filter((t) => t.id !== id);
        // If we removed the primary, make the first one primary
        if (next.length > 0 && !next.some((t) => t.isPrimary)) {
          next[0]!.isPrimary = true;
        }
        return [...next];
      });
    },
    [setSelectedTenants],
  );

  const setPrimary = useCallback(
    (id: string) => {
      setSelectedTenants((prev) =>
        prev.map((t) => ({ ...t, isPrimary: t.id === id })),
      );
    },
    [setSelectedTenants],
  );

  const tenantResults = data?.data ?? [];

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Select Tenants</h2>

      {/* Selected tenants */}
      {selectedTenants.length > 0 && (
        <div className="mb-6 rounded-xl border bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-500">
            Selected Tenants ({selectedTenants.length})
          </h3>
          <div className="space-y-3">
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
      <div className="mb-4 rounded-xl border bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-500">
          Search Existing Tenants
        </h3>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {search.length > 0 && (
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : tenantResults.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                No tenants found
              </p>
            ) : (
              <div className="space-y-1">
                {tenantResults.map((t) => {
                  const isAdded = selectedTenants.some(
                    (st) => st.id === t.id,
                  );
                  return (
                    <button
                      key={t.id}
                      onClick={() => addTenant(t)}
                      disabled={isAdded || !t.email}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
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
                          {t.email || "No email"}{" "}
                          {t.phone ? ` | ${t.phone}` : ""}
                        </p>
                      </div>
                      {isAdded ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : !t.email ? (
                        <span className="text-xs text-red-400">
                          No email
                        </span>
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
      <div className="rounded-xl border bg-white p-5">
        {!showNewForm ? (
          <button
            onClick={() => setShowNewForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600"
          >
            <Plus className="h-4 w-4" />
            Create New Tenant
          </button>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-500">
                New Tenant
              </h3>
              <button
                onClick={() => {
                  setShowNewForm(false);
                  reset();
                }}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={handleSubmit((d) =>
                createTenantMutation.mutate(d),
              )}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>First Name *</label>
                  <input
                    {...register("firstName", {
                      required: "First name is required",
                    })}
                    className={inputCls}
                  />
                  {errors.firstName && (
                    <p className={errorCls}>{errors.firstName.message}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Last Name *</label>
                  <input
                    {...register("lastName", {
                      required: "Last name is required",
                    })}
                    className={inputCls}
                  />
                  {errors.lastName && (
                    <p className={errorCls}>{errors.lastName.message}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Email *</label>
                  <input
                    {...register("email", {
                      required: "Email is required",
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Invalid email address",
                      },
                    })}
                    type="email"
                    className={inputCls}
                  />
                  {errors.email && (
                    <p className={errorCls}>{errors.email.message}</p>
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
                  onClick={() => {
                    setShowNewForm(false);
                    reset();
                  }}
                  className={btnSecondary}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTenantMutation.isPending}
                  className={btnPrimary}
                >
                  {createTenantMutation.isPending
                    ? "Creating..."
                    : "Create & Add"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Lease Terms
// ---------------------------------------------------------------------------

function StepLeaseTerms({
  terms,
  setTerms,
  unitRent,
}: {
  terms: LeaseTerms;
  setTerms: React.Dispatch<React.SetStateAction<LeaseTerms>>;
  unitRent: number;
}) {
  const handleTermShortcut = (months: number | "mtm") => {
    if (!terms.startDate) return;
    if (months === "mtm") {
      // Month-to-month: set end date one month out
      const end = addMonths(new Date(terms.startDate), 1);
      setTerms((prev) => ({ ...prev, endDate: format(end, "yyyy-MM-dd") }));
    } else {
      const end = addMonths(new Date(terms.startDate), months);
      setTerms((prev) => ({ ...prev, endDate: format(end, "yyyy-MM-dd") }));
    }
  };

  // Calculate prorated rent
  const proratedAmount = useMemo(() => {
    if (!terms.startDate || !terms.monthlyRent) return null;
    const startDay = new Date(terms.startDate).getDate();
    if (startDay === 1) return null;
    const startDateObj = new Date(terms.startDate);
    const totalDays = getDaysInMonth(startDateObj);
    const remainingDays = totalDays - startDay + 1;
    return (terms.monthlyRent / totalDays) * remainingDays;
  }, [terms.startDate, terms.monthlyRent]);

  // Duration display
  const durationLabel = useMemo(() => {
    if (!terms.startDate || !terms.endDate) return null;
    const days = differenceInDays(
      new Date(terms.endDate),
      new Date(terms.startDate),
    );
    if (days <= 0) return null;
    const months = Math.round(days / 30.44);
    if (months < 1) return `${days} days`;
    return `~${months} month${months !== 1 ? "s" : ""} (${days} days)`;
  }, [terms.startDate, terms.endDate]);

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Lease Terms</h2>

      <div className="space-y-6">
        {/* Dates */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold">Lease Period</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Start Date *</label>
              <input
                type="date"
                value={terms.startDate}
                onChange={(e) =>
                  setTerms((prev) => ({
                    ...prev,
                    startDate: e.target.value,
                  }))
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>End Date *</label>
              <input
                type="date"
                value={terms.endDate}
                onChange={(e) =>
                  setTerms((prev) => ({
                    ...prev,
                    endDate: e.target.value,
                  }))
                }
                className={inputCls}
              />
              {durationLabel && (
                <p className="mt-1 text-xs text-gray-500">{durationLabel}</p>
              )}
            </div>
          </div>

          {/* Term shortcuts */}
          <div className="mt-3">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Quick term length
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  [6, "6 mo"],
                  [12, "12 mo"],
                  [18, "18 mo"],
                  [24, "24 mo"],
                  ["mtm", "Month-to-month"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() =>
                    handleTermShortcut(val as number | "mtm")
                  }
                  disabled={!terms.startDate}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Proration notice */}
          {proratedAmount !== null && (
            <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">Prorated First Month</p>
              <p className="mt-0.5 text-xs">
                Since the lease starts on day{" "}
                {new Date(terms.startDate).getDate()}, the prorated rent for
                the first month will be{" "}
                <strong>{currency(proratedAmount)}</strong> instead of{" "}
                {currency(terms.monthlyRent)}.
              </p>
            </div>
          )}
        </div>

        {/* Financial terms */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold">Financial Terms</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Monthly Rent *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={terms.monthlyRent}
                  onChange={(e) =>
                    setTerms((prev) => ({
                      ...prev,
                      monthlyRent: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              {unitRent !== terms.monthlyRent && (
                <p className="mt-1 text-xs text-gray-400">
                  Unit listed rent: {currency(unitRent)}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Security Deposit *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={terms.securityDeposit}
                  onChange={(e) =>
                    setTerms((prev) => ({
                      ...prev,
                      securityDeposit: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Late fees & rent schedule */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold">Late Fees & Schedule</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Late Fee Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={terms.lateFeeAmount}
                onChange={(e) =>
                  setTerms((prev) => ({
                    ...prev,
                    lateFeeAmount: parseFloat(e.target.value) || 0,
                  }))
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Late Fee Type</label>
              <div className="mt-1 flex gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="lateFeeType"
                    checked={terms.lateFeeType === "FLAT"}
                    onChange={() =>
                      setTerms((prev) => ({
                        ...prev,
                        lateFeeType: "FLAT",
                      }))
                    }
                    className="h-4 w-4 text-blue-600"
                  />
                  Flat ($)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="lateFeeType"
                    checked={terms.lateFeeType === "PERCENTAGE"}
                    onChange={() =>
                      setTerms((prev) => ({
                        ...prev,
                        lateFeeType: "PERCENTAGE",
                      }))
                    }
                    className="h-4 w-4 text-blue-600"
                  />
                  Percentage (%)
                </label>
              </div>
            </div>
            <div>
              <label className={labelCls}>Grace Period (days)</label>
              <input
                type="number"
                min="0"
                max="30"
                value={terms.gracePeriodDays}
                onChange={(e) =>
                  setTerms((prev) => ({
                    ...prev,
                    gracePeriodDays: parseInt(e.target.value) || 0,
                  }))
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Rent Due Day</label>
              <select
                value={terms.rentDueDay}
                onChange={(e) =>
                  setTerms((prev) => ({
                    ...prev,
                    rentDueDay: parseInt(e.target.value),
                  }))
                }
                className={inputCls}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                    {d === 1
                      ? "st"
                      : d === 2
                        ? "nd"
                        : d === 3
                          ? "rd"
                          : "th"}{" "}
                    of the month
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Clauses & Terms
// ---------------------------------------------------------------------------

function StepClauses({
  clauses,
  setClauses,
}: {
  clauses: Clause[];
  setClauses: React.Dispatch<React.SetStateAction<Clause[]>>;
}) {
  const [newClauseTitle, setNewClauseTitle] = useState("");
  const [newClauseContent, setNewClauseContent] = useState("");

  const { isLoading } = useQuery({
    queryKey: ["default-clauses"],
    queryFn: () => api<{ data: Clause[] }>("/leases/default-clauses"),
    // Only fetch if clauses haven't been loaded yet (avoid re-fetching on back/forward)
    enabled: clauses.length === 0,
    select: (result) => {
      // Initialize clauses from default
      if (clauses.length === 0 && result?.data) {
        setClauses(
          result.data.map((c, idx) => ({
            id: c.id || `default-${idx}`,
            title: c.title,
            content: c.content,
            enabled: true,
            isCustom: false,
          })),
        );
      }
      return result;
    },
  });

  const toggleClause = (id: string) => {
    setClauses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const updateContent = (id: string, content: string) => {
    setClauses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, content } : c)),
    );
  };

  const updateTitle = (id: string, title: string) => {
    setClauses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  };

  const moveClause = (index: number, direction: "up" | "down") => {
    setClauses((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index]!;
      next[index] = next[targetIndex]!;
      next[targetIndex] = temp;
      return next;
    });
  };

  const removeClause = (id: string) => {
    setClauses((prev) => prev.filter((c) => c.id !== id));
  };

  const addCustomClause = () => {
    if (!newClauseTitle.trim()) return;
    const clause: Clause = {
      id: `custom-${Date.now()}`,
      title: newClauseTitle.trim(),
      content: newClauseContent.trim(),
      enabled: true,
      isCustom: true,
    };
    setClauses((prev) => [...prev, clause]);
    setNewClauseTitle("");
    setNewClauseContent("");
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Clauses & Terms</h2>

      {isLoading && clauses.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {clauses.map((clause, idx) => (
              <div
                key={clause.id}
                className={`rounded-xl border bg-white p-5 transition-opacity ${
                  !clause.enabled ? "opacity-60" : ""
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={clause.enabled}
                      onChange={() => toggleClause(clause.id)}
                      className="mt-0.5 h-4 w-4 rounded text-blue-600"
                    />
                    {clause.isCustom ? (
                      <input
                        type="text"
                        value={clause.title}
                        onChange={(e) =>
                          updateTitle(clause.id, e.target.value)
                        }
                        className="rounded border-transparent px-1 py-0.5 text-sm font-semibold hover:border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    ) : (
                      <span className="text-sm font-semibold">
                        {clause.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveClause(idx, "up")}
                      disabled={idx === 0}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveClause(idx, "down")}
                      disabled={idx === clauses.length - 1}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    {clause.isCustom && (
                      <button
                        onClick={() => removeClause(clause.id)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title="Remove clause"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {clause.enabled && (
                  <textarea
                    value={clause.content}
                    onChange={(e) =>
                      updateContent(clause.id, e.target.value)
                    }
                    rows={4}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Add custom clause */}
          <div className="mt-6 rounded-xl border bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-500">
              Add Custom Clause
            </h3>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Title</label>
                <input
                  type="text"
                  value={newClauseTitle}
                  onChange={(e) => setNewClauseTitle(e.target.value)}
                  className={inputCls}
                  placeholder="Clause title"
                />
              </div>
              <div>
                <label className={labelCls}>Content</label>
                <textarea
                  value={newClauseContent}
                  onChange={(e) => setNewClauseContent(e.target.value)}
                  rows={4}
                  className={inputCls}
                  placeholder="Clause content..."
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={addCustomClause}
                  disabled={!newClauseTitle.trim()}
                  className={btnPrimary}
                >
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add Clause
                  </span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Review & Send
// ---------------------------------------------------------------------------

function StepReview({
  unit,
  tenants,
  terms,
  clauses,
  onSaveDraft,
  onSendForSignature,
  isSaving,
  isSending,
}: {
  unit: Unit;
  tenants: SelectedTenant[];
  terms: LeaseTerms;
  clauses: Clause[];
  onSaveDraft: () => void;
  onSendForSignature: () => void;
  isSaving: boolean;
  isSending: boolean;
}) {
  const enabledClauses = clauses.filter((c) => c.enabled);

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Review & Submit</h2>

      <div className="space-y-6">
        {/* Unit info */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-3 font-semibold text-gray-700">Unit</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold">
                {unit.property?.name} #{unit.unitNumber}
              </p>
              <div className="mt-1 flex gap-3 text-sm text-gray-500">
                <span>{unit.bedrooms} bed</span>
                <span>{unit.bathrooms} bath</span>
                <span>{unit.sqft.toLocaleString()} sqft</span>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                unit.status === "VACANT"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {unit.status}
            </span>
          </div>
        </div>

        {/* Tenants */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-3 font-semibold text-gray-700">
            Tenants ({tenants.length})
          </h3>
          <div className="space-y-2">
            {tenants.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="font-medium">
                    {t.firstName} {t.lastName}
                  </span>
                  {t.isPrimary && (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                      Primary
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{t.email}</span>
                  {t.phone && <span>{t.phone}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial summary */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-3 font-semibold text-gray-700">Lease Details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Start Date</p>
              <p className="font-semibold">
                {terms.startDate
                  ? format(new Date(terms.startDate), "MMMM d, yyyy")
                  : "\u2014"}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">End Date</p>
              <p className="font-semibold">
                {terms.endDate
                  ? format(new Date(terms.endDate), "MMMM d, yyyy")
                  : "\u2014"}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Monthly Rent</p>
              <p className="text-lg font-bold">
                {currency(terms.monthlyRent)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Security Deposit</p>
              <p className="text-lg font-bold">
                {currency(terms.securityDeposit)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Late Fee</p>
              <p className="font-semibold">
                {terms.lateFeeType === "FLAT"
                  ? currency(terms.lateFeeAmount)
                  : `${terms.lateFeeAmount}%`}{" "}
                <span className="text-xs font-normal text-gray-500">
                  ({terms.lateFeeType.toLowerCase()})
                </span>
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Grace Period</p>
              <p className="font-semibold">
                {terms.gracePeriodDays} day
                {terms.gracePeriodDays !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 sm:col-span-2">
              <p className="text-xs text-gray-500">Rent Due</p>
              <p className="font-semibold">
                {terms.rentDueDay}
                {terms.rentDueDay === 1
                  ? "st"
                  : terms.rentDueDay === 2
                    ? "nd"
                    : terms.rentDueDay === 3
                      ? "rd"
                      : "th"}{" "}
                of each month
              </p>
            </div>
          </div>
        </div>

        {/* Clauses */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-3 font-semibold text-gray-700">
            Included Clauses ({enabledClauses.length})
          </h3>
          <div className="space-y-2">
            {enabledClauses.map((c, idx) => (
              <div key={c.id} className="rounded-lg bg-gray-50 px-4 py-3">
                <p className="text-sm font-medium">
                  {idx + 1}. {c.title}
                  {c.isCustom && (
                    <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                      Custom
                    </span>
                  )}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                  {c.content}
                </p>
              </div>
            ))}
            {enabledClauses.length === 0 && (
              <p className="py-2 text-sm text-gray-400">
                No clauses selected
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onSaveDraft}
            disabled={isSaving || isSending}
            className={btnSecondary}
          >
            <span className="flex items-center gap-1.5">
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save as Draft"}
            </span>
          </button>
          <button
            onClick={onSendForSignature}
            disabled={isSaving || isSending}
            className={btnPrimary}
          >
            <span className="flex items-center gap-1.5">
              <Send className="h-4 w-4" />
              {isSending ? "Sending..." : "Send for Signature"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

export default function LeaseBuilder() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    new Set(),
  );

  // Data for each step
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedTenants, setSelectedTenants] = useState<SelectedTenant[]>(
    [],
  );
  const [terms, setTerms] = useState<LeaseTerms>({
    startDate: "",
    endDate: "",
    monthlyRent: 0,
    securityDeposit: 0,
    lateFeeAmount: 50,
    lateFeeType: "FLAT",
    gracePeriodDays: 5,
    rentDueDay: 1,
  });
  const [clauses, setClauses] = useState<Clause[]>([]);

  // When unit is selected, pre-fill rent
  const handleUnitSelect = useCallback(
    (unit: Unit) => {
      setSelectedUnit(unit);
      setTerms((prev) => ({
        ...prev,
        monthlyRent: unit.rent,
        securityDeposit: unit.rent,
      }));
    },
    [],
  );

  // Build lease payload
  const buildPayload = useCallback(
    (status: string) => ({
      unitId: selectedUnit!.id,
      tenants: selectedTenants.map((t) => ({
        tenantId: t.id,
        isPrimary: t.isPrimary,
      })),
      startDate: terms.startDate,
      endDate: terms.endDate,
      monthlyRent: terms.monthlyRent,
      securityDeposit: terms.securityDeposit,
      lateFeeAmount: terms.lateFeeAmount,
      lateFeeType: terms.lateFeeType,
      gracePeriodDays: terms.gracePeriodDays,
      rentDueDay: terms.rentDueDay,
      status,
      clauses: clauses
        .filter((c) => c.enabled)
        .map((c, idx) => ({
          title: c.title,
          content: c.content,
          order: idx,
        })),
    }),
    [selectedUnit, selectedTenants, terms, clauses],
  );

  // Save as Draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/leases", {
        method: "POST",
        body: JSON.stringify(buildPayload("DRAFT")),
      }),
    onSuccess: (data) => {
      toast("Lease saved as draft");
      navigate(`/leases/${data.id}`);
    },
    onError: (err: any) => {
      const msg =
        err?.data?.message || err?.data?.error || "Failed to save lease";
      toast(msg, "error");
    },
  });

  // Send for Signature mutation
  const sendForSignatureMutation = useMutation({
    mutationFn: async () => {
      const lease = await api<{ id: string }>("/leases", {
        method: "POST",
        body: JSON.stringify(buildPayload("PENDING_SIGNATURE")),
      });
      await api(`/leases/${lease.id}/send-for-signature`, {
        method: "POST",
      });
      return lease;
    },
    onSuccess: (data) => {
      toast("Lease sent for signature");
      navigate(`/leases/${data.id}`);
    },
    onError: (err: any) => {
      const msg =
        err?.data?.message || err?.data?.error || "Failed to send lease";
      toast(msg, "error");
    },
  });

  // Step validation
  const canProceed = useCallback(
    (step: number): boolean => {
      switch (step) {
        case 0:
          return selectedUnit !== null;
        case 1:
          return (
            selectedTenants.length > 0 &&
            selectedTenants.some((t) => t.isPrimary) &&
            selectedTenants.every((t) => !!t.email)
          );
        case 2:
          return (
            !!terms.startDate &&
            !!terms.endDate &&
            terms.monthlyRent > 0 &&
            terms.securityDeposit >= 0 &&
            new Date(terms.endDate) > new Date(terms.startDate)
          );
        case 3:
          return true; // Clauses are optional
        case 4:
          return true;
        default:
          return false;
      }
    },
    [selectedUnit, selectedTenants, terms],
  );

  const goNext = () => {
    if (!canProceed(currentStep)) {
      toast("Please complete all required fields before proceeding", "error");
      return;
    }
    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    setCurrentStep((prev) => Math.min(STEPS.length - 1, prev + 1));
  };

  const goBack = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Lease</h1>
        <button
          onClick={() => navigate("/leases")}
          className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>

      <StepProgress
        currentStep={currentStep}
        completedSteps={completedSteps}
      />

      {/* Step content */}
      <div className="mb-8">
        {currentStep === 0 && (
          <StepSelectUnit
            selectedUnit={selectedUnit}
            onSelect={handleUnitSelect}
          />
        )}
        {currentStep === 1 && (
          <StepTenants
            selectedTenants={selectedTenants}
            setSelectedTenants={setSelectedTenants}
          />
        )}
        {currentStep === 2 && (
          <StepLeaseTerms
            terms={terms}
            setTerms={setTerms}
            unitRent={selectedUnit?.rent ?? 0}
          />
        )}
        {currentStep === 3 && (
          <StepClauses clauses={clauses} setClauses={setClauses} />
        )}
        {currentStep === 4 && selectedUnit && (
          <StepReview
            unit={selectedUnit}
            tenants={selectedTenants}
            terms={terms}
            clauses={clauses}
            onSaveDraft={() => saveDraftMutation.mutate()}
            onSendForSignature={() => sendForSignatureMutation.mutate()}
            isSaving={saveDraftMutation.isPending}
            isSending={sendForSignatureMutation.isPending}
          />
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t pt-6">
        <button
          onClick={goBack}
          disabled={currentStep === 0}
          className={`${btnSecondary} flex items-center gap-1.5`}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {currentStep < STEPS.length - 1 && (
          <button
            onClick={goNext}
            disabled={!canProceed(currentStep)}
            className={`${btnPrimary} flex items-center gap-1.5`}
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
