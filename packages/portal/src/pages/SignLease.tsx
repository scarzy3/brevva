import { useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle,
  AlertTriangle,
  FileText,
  Calendar,
  DollarSign,
  Building2,
  Users,
  Clock,
  Download,
  Shield,
  Loader2,
} from "lucide-react";

function currency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

interface SigningData {
  tenant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  lease: {
    id: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
    securityDeposit: number;
    lateFeeAmount: number | null;
    lateFeeType: string | null;
    gracePeriodDays: number | null;
    rentDueDay: number;
    terms: Record<string, unknown> | null;
    documentUrl: string | null;
    documentHash: string | null;
    status: string;
  };
  unit: {
    id: string;
    unitNumber: string;
    bedrooms: number;
    bathrooms: number;
    sqFt: number | null;
    property: {
      id: string;
      name: string;
      address: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  organization: {
    id: string;
    name: string;
  };
  tenants: {
    firstName: string;
    lastName: string;
    isPrimary: boolean;
    signed: boolean;
  }[];
}

interface SignResult {
  signedAt: string;
  allSigned: boolean;
  remainingSignatures: number;
  documentUrl?: string | null;
}

export default function SignLease() {
  const { token } = useParams();

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToEsign, setAgreedToEsign] = useState(false);
  const [fullName, setFullName] = useState("");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signResult, setSignResult] = useState<SignResult | null>(null);

  const {
    data,
    isLoading,
    error,
  } = useQuery<SigningData>({
    queryKey: ["sign-lease", token],
    queryFn: async () => {
      const res = await fetch("/api/v1/leases/sign/" + token);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          body?.error ?? body?.message ?? `Request failed (${res.status})`;
        throw new Error(message);
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  // Pre-fill name once data loads
  if (data && !nameInitialized) {
    setFullName(`${data.tenant.firstName} ${data.tenant.lastName}`);
    setNameInitialized(true);
  }

  const handleSign = async () => {
    if (!agreedToTerms || !agreedToEsign || !fullName.trim()) return;

    setSigning(true);
    setSignError(null);

    try {
      const res = await fetch("/api/v1/leases/sign/" + token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: data!.tenant.email,
          agreedToTerms: true,
          agreedToEsign: true,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ?? body?.message ?? `Signing failed (${res.status})`
        );
      }

      const result: SignResult = await res.json();
      setSignResult(result);
    } catch (err) {
      setSignError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSigning(false);
    }
  };

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-4 text-sm text-gray-500">Loading lease details...</p>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    const msg =
      error instanceof Error ? error.message : "Unable to load lease details";
    const isExpired =
      msg.toLowerCase().includes("expired") ||
      msg.toLowerCase().includes("not found");
    const isAlreadySigned = msg.toLowerCase().includes("already signed");

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
          {isAlreadySigned ? (
            <>
              <CheckCircle className="mx-auto h-14 w-14 text-green-500" />
              <h1 className="mt-4 text-xl font-bold text-gray-900">
                Already Signed
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                You have already signed this lease agreement. No further action
                is needed.
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="mx-auto h-14 w-14 text-amber-500" />
              <h1 className="mt-4 text-xl font-bold text-gray-900">
                {isExpired ? "Link Expired or Invalid" : "Unable to Load Lease"}
              </h1>
              <p className="mt-2 text-sm text-gray-500">{msg}</p>
              <p className="mt-4 text-xs text-gray-400">
                If you believe this is an error, please contact your property
                manager.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { tenant, lease, unit, organization, tenants } = data;
  const property = unit.property;

  // --- Success state (after signing) ---
  if (signResult) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg rounded-xl border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Thank You!</h1>
          <p className="mt-2 text-gray-600">
            Your lease agreement has been successfully signed.
          </p>
          <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            <p>
              Signed on{" "}
              <span className="font-medium">
                {fmtDate(signResult.signedAt)}
              </span>
            </p>
            {signResult.remainingSignatures > 0 ? (
              <p className="mt-1">
                {signResult.remainingSignatures} other tenant
                {signResult.remainingSignatures > 1 ? "s" : ""} still need
                {signResult.remainingSignatures === 1 ? "s" : ""} to sign.
              </p>
            ) : (
              <p className="mt-1 font-medium text-green-700">
                All tenants have signed. The lease is now active.
              </p>
            )}
          </div>
          {(signResult.documentUrl ?? lease.documentUrl) && (
            <a
              href={signResult.documentUrl ?? lease.documentUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Download Lease Document
            </a>
          )}
          <p className="mt-6 text-xs text-gray-400">
            A confirmation email has been sent to {tenant.email}. You may close
            this page.
          </p>
        </div>
      </div>
    );
  }

  // --- Main signing page ---
  const canSubmit =
    agreedToTerms && agreedToEsign && fullName.trim().length > 0 && !signing;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {organization.name}
            </p>
            <p className="text-xs text-gray-500">Secure Lease Signing</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Lease Agreement
          </h1>
          <p className="mt-1 text-gray-500">
            {property.address}, {property.city}, {property.state} {property.zip}
          </p>
        </div>

        {/* Lease Summary */}
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FileText className="h-5 w-5 text-blue-600" />
            Lease Terms
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div>
                <p className="text-xs font-medium text-gray-500">Start Date</p>
                <p className="text-sm font-semibold text-gray-900">
                  {fmtDate(lease.startDate)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div>
                <p className="text-xs font-medium text-gray-500">End Date</p>
                <p className="text-sm font-semibold text-gray-900">
                  {fmtDate(lease.endDate)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
              <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div>
                <p className="text-xs font-medium text-gray-500">
                  Monthly Rent
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {currency(Number(lease.monthlyRent))}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
              <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div>
                <p className="text-xs font-medium text-gray-500">
                  Security Deposit
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {currency(Number(lease.securityDeposit))}
                </p>
              </div>
            </div>
            {lease.lateFeeAmount != null && (
              <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-500">Late Fee</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {lease.lateFeeType === "PERCENTAGE"
                      ? `${lease.lateFeeAmount}%`
                      : currency(Number(lease.lateFeeAmount))}
                  </p>
                </div>
              </div>
            )}
            {lease.gracePeriodDays != null && (
              <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Grace Period
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {lease.gracePeriodDays} day
                    {lease.gracePeriodDays !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Unit Info */}
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Building2 className="h-5 w-5 text-blue-600" />
            Property &amp; Unit
          </h2>
          <div className="mt-3 text-sm text-gray-700">
            <p className="font-medium">{property.name}</p>
            <p className="text-gray-500">
              {property.address}, {property.city}, {property.state}{" "}
              {property.zip}
            </p>
            <p className="mt-2">
              <span className="font-medium">Unit:</span> {unit.unitNumber}
              {unit.bedrooms != null && (
                <span className="ml-3 text-gray-500">
                  {unit.bedrooms} bed / {unit.bathrooms} bath
                  {unit.sqFt ? ` / ${unit.sqFt.toLocaleString()} sqft` : ""}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Tenant List */}
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Users className="h-5 w-5 text-blue-600" />
            Tenants
          </h2>
          <div className="mt-3 space-y-2">
            {tenants.map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {t.firstName} {t.lastName}
                  </span>
                  {t.isPrimary && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Primary
                    </span>
                  )}
                </div>
                {t.signed ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Signed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                    <Clock className="h-3.5 w-3.5" />
                    Pending
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Document Viewer */}
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FileText className="h-5 w-5 text-blue-600" />
            Lease Document
          </h2>
          {lease.documentUrl ? (
            <div className="mt-4 overflow-hidden rounded-lg border">
              <iframe
                src={lease.documentUrl}
                title="Lease Document"
                className="h-[600px] w-full"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-center rounded-lg border border-dashed bg-gray-50 py-16">
              <p className="text-sm text-gray-400">
                Document preview not available
              </p>
            </div>
          )}
        </div>

        {/* Signature Form */}
        <div className="rounded-xl border-2 border-blue-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Sign This Lease
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Please review the lease terms above, then complete the fields below
            to sign electronically.
          </p>

          <div className="mt-6 space-y-4">
            {/* Agreement checkboxes */}
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                I have read and agree to the terms of this lease agreement
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={agreedToEsign}
                onChange={(e) => setAgreedToEsign(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                I agree to use electronic signatures as a legally binding method
                of signing this document
              </span>
            </label>

            {/* Full Name */}
            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-gray-700"
              >
                Full Legal Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full legal name"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Email (readonly) */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={tenant.email}
                readOnly
                className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 shadow-sm"
              />
            </div>

            {/* Error */}
            {signError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {signError}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSign}
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Sign Lease
                </>
              )}
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">
            By signing, you acknowledge that this electronic signature carries
            the same legal weight as a handwritten signature.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t pt-6 text-center text-xs text-gray-400">
          <p>
            Powered by Brevva &mdash; Secure electronic lease signing
          </p>
        </div>
      </div>
    </div>
  );
}
