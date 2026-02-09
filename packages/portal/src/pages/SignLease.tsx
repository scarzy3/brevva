import { useState, useRef, useEffect, useCallback } from "react";
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
  Eraser,
  PenLine,
  Type,
  X,
  MapPin,
  Hash,
  Mail,
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

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// ---------------------------------------------------------------------------
// Signature pad fonts
// ---------------------------------------------------------------------------
const SIGNATURE_FONTS = [
  { label: "Script", value: "'Brush Script MT', 'Segoe Script', cursive" },
  { label: "Formal", value: "Georgia, 'Times New Roman', serif" },
  { label: "Casual", value: "'Comic Sans MS', 'Segoe Print', cursive" },
  { label: "Elegant", value: "'Palatino Linotype', 'Book Antiqua', serif" },
];

// ---------------------------------------------------------------------------
// Canvas draw pad
// ---------------------------------------------------------------------------
function DrawPad({
  canvasRef,
  onDrawn,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onDrawn: () => void;
}) {
  const isDrawing = useRef(false);

  const getPos = (
    e: React.MouseEvent | React.TouchEvent,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      if (!touch) return { x: 0, y: 0 };
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    isDrawing.current = true;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a365d";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDraw = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      onDrawn();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={500}
      height={120}
      className="w-full cursor-crosshair rounded-lg border-2 border-dashed border-gray-300 bg-white touch-none"
      style={{ height: 120 }}
      onMouseDown={startDraw}
      onMouseMove={draw}
      onMouseUp={stopDraw}
      onMouseLeave={stopDraw}
      onTouchStart={startDraw}
      onTouchMove={draw}
      onTouchEnd={stopDraw}
    />
  );
}

// ---------------------------------------------------------------------------
// Signature pad (draw / type)
// ---------------------------------------------------------------------------
function SignaturePad({
  fullName,
  onSignatureReady,
}: {
  fullName: string;
  onSignatureReady: (dataUrl: string | null) => void;
}) {
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [fontIdx, setFontIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onSignatureReady(null);
  }, [onSignatureReady]);

  const exportSignature = useCallback((): string | null => {
    if (mode === "draw") {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return null;
      return canvas.toDataURL("image/png");
    }
    if (!fullName.trim()) return null;
    const tmp = document.createElement("canvas");
    tmp.width = 500;
    tmp.height = 120;
    const ctx = tmp.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#1a365d";
    ctx.font = `italic 36px ${SIGNATURE_FONTS[fontIdx]?.value ?? "cursive"}`;
    ctx.textBaseline = "middle";
    ctx.fillText(fullName, 16, 60);
    return tmp.toDataURL("image/png");
  }, [mode, hasDrawn, fullName, fontIdx]);

  useEffect(() => {
    if (mode === "draw") {
      onSignatureReady(hasDrawn ? exportSignature() : null);
    } else {
      onSignatureReady(fullName.trim() ? exportSignature() : null);
    }
  }, [mode, hasDrawn, fullName, fontIdx, exportSignature, onSignatureReady]);

  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => { setMode("draw"); clearCanvas(); }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "draw"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <PenLine className="h-4 w-4" />
          Draw
        </button>
        <button
          type="button"
          onClick={() => setMode("type")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "type"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Type className="h-4 w-4" />
          Type
        </button>
      </div>

      {mode === "draw" ? (
        <div>
          <DrawPad canvasRef={canvasRef} onDrawn={() => setHasDrawn(true)} />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Draw your signature using your mouse or finger
            </p>
            <button
              type="button"
              onClick={clearCanvas}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <Eraser className="h-3 w-3" />
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex gap-2">
            {SIGNATURE_FONTS.map((f, i) => (
              <button
                key={f.label}
                type="button"
                onClick={() => setFontIdx(i)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  fontIdx === i
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex h-[120px] items-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-4">
            {fullName.trim() ? (
              <span
                className="text-[36px] italic"
                style={{
                  fontFamily: SIGNATURE_FONTS[fontIdx]?.value ?? "cursive",
                  color: "#1a365d",
                }}
              >
                {fullName}
              </span>
            ) : (
              <span className="text-sm text-gray-300">
                Your name will appear here as a signature
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Select a style and your typed name will be used as your signature
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation Modal
// ---------------------------------------------------------------------------
function ConfirmSignModal({
  open,
  onClose,
  onConfirm,
  signing,
  propertyAddress,
  monthlyRent,
  startDate,
  endDate,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  signing: boolean;
  propertyAddress: string;
  monthlyRent: number;
  startDate: string;
  endDate: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Confirm Your Signature</h3>
          <button
            onClick={onClose}
            disabled={signing}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-700 font-medium mb-3">
            You are about to electronically sign this document.
          </p>
          <div className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Property:</span>
              <span className="font-medium text-gray-900 text-right ml-4">{propertyAddress}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Monthly Rent:</span>
              <span className="font-medium text-gray-900">{currency(monthlyRent)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Lease Term:</span>
              <span className="font-medium text-gray-900">{fmtDate(startDate)} to {fmtDate(endDate)}</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-red-600 font-medium mb-5">
          This signature is legally binding and cannot be undone.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={signing}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={signing}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {signing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing...
              </>
            ) : (
              "Confirm & Sign"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SigningData {
  tenant: { id: string; firstName: string; lastName: string; email: string };
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
  organization: { id: string; name: string };
  tenants: {
    firstName: string;
    lastName: string;
    isPrimary: boolean;
    signed: boolean;
  }[];
  signingToken?: {
    token: string;
    createdAt: string | null;
    expiresAt: string | null;
  };
}

interface SignatureReceipt {
  documentId: string;
  signedBy: string;
  email: string;
  signedAt: string;
  ipAddress: string;
  location: string | null;
  signatureId: string;
}

interface SignResult {
  signedAt: string;
  allSigned: boolean;
  remainingSignatures: number;
  documentUrl?: string | null;
  signatureReceipt?: SignatureReceipt;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function SignLease() {
  const { token } = useParams();

  // Timestamps for interaction tracking
  const [pageOpenedAt] = useState(() => new Date().toISOString());
  const [documentViewedAt, setDocumentViewedAt] = useState<string | null>(null);
  const [scrolledToBottomAt, setScrolledToBottomAt] = useState<string | null>(null);
  const [consent1CheckedAt, setConsent1CheckedAt] = useState<string | null>(null);
  const [consent2CheckedAt, setConsent2CheckedAt] = useState<string | null>(null);
  const [consent3CheckedAt, setConsent3CheckedAt] = useState<string | null>(null);
  const [nameTypedAt, setNameTypedAt] = useState<string | null>(null);

  // Document scroll tracking
  const [scrollProgress, setScrollProgress] = useState(0);
  const [documentFullyViewed, setDocumentFullyViewed] = useState(false);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  // Consent checkboxes
  const [consent1, setConsent1] = useState(false);
  const [consent2, setConsent2] = useState(false);
  const [consent3, setConsent3] = useState(false);
  const allConsented = consent1 && consent2 && consent3;

  // Name and signature
  const [fullName, setFullName] = useState("");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  // UI state
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signResult, setSignResult] = useState<SignResult | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const { data, isLoading, error } = useQuery<SigningData>({
    queryKey: ["sign-lease", token],
    queryFn: async () => {
      const res = await fetch("/api/v1/leases/sign/" + token);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          body?.error?.message ?? body?.error ?? body?.message ?? `Request failed (${res.status})`;
        throw new Error(typeof message === "string" ? message : String(message));
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (data && !nameInitialized) {
    setFullName(`${data.tenant.firstName} ${data.tenant.lastName}`);
    setNameInitialized(true);
  }

  // Expected name from lease data
  const expectedName = data
    ? `${data.tenant.firstName} ${data.tenant.lastName}`
    : "";
  const nameMatches = fullName.trim().toLowerCase() === expectedName.toLowerCase();

  // Document scroll tracking via an overlay div
  const handleDocumentScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight - el.clientHeight;
      if (scrollHeight <= 0) return;
      const progress = Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
      setScrollProgress(progress);

      if (!documentViewedAt && progress > 10) {
        setDocumentViewedAt(new Date().toISOString());
      }

      if (!documentFullyViewed && progress >= 95) {
        setDocumentFullyViewed(true);
        setScrolledToBottomAt(new Date().toISOString());
      }
    },
    [documentViewedAt, documentFullyViewed]
  );

  const handleSign = async () => {
    if (!allConsented || !fullName.trim() || !signatureImage || !nameMatches) return;
    setShowConfirmModal(true);
  };

  const confirmSign = async () => {
    setSigning(true);
    setSignError(null);

    const now = new Date().toISOString();
    const metadata = {
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      browserLanguage: navigator.language,
      platform: navigator.platform,
      pageOpenedAt,
      documentViewedAt,
      scrolledToBottomAt,
      consent1CheckedAt,
      consent2CheckedAt,
      consent3CheckedAt,
      nameTypedAt,
      signedAt: now,
      totalViewTimeSeconds: Math.round(
        (new Date(now).getTime() - new Date(pageOpenedAt).getTime()) / 1000
      ),
    };

    try {
      const res = await fetch("/api/v1/leases/sign/" + token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: data!.tenant.email,
          agreedToTerms: true,
          agreedToEsign: true,
          agreedToIdentity: true,
          signatureImage,
          signingMetadata: metadata,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? body?.error ?? body?.message ?? `Signing failed (${res.status})`;
        throw new Error(typeof msg === "string" ? msg : String(msg));
      }

      const result: SignResult = await res.json();
      setSignResult(result);
      setShowConfirmModal(false);
    } catch (err) {
      setSignError(err instanceof Error ? err.message : "An error occurred");
      setShowConfirmModal(false);
    } finally {
      setSigning(false);
    }
  };

  // --- Loading ---
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

  // --- Error ---
  if (error) {
    const msg = error instanceof Error ? error.message : "Unable to load lease details";
    const isExpired = msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("not found");
    const isAlreadySigned = msg.toLowerCase().includes("already signed");

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
          {isAlreadySigned ? (
            <>
              <CheckCircle className="mx-auto h-14 w-14 text-green-500" />
              <h1 className="mt-4 text-xl font-bold text-gray-900">Already Signed</h1>
              <p className="mt-2 text-sm text-gray-500">
                You have already signed this lease agreement. No further action is needed.
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
                If you believe this is an error, please contact your property manager.
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
  const propertyAddress = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;

  // --- Post-Signature Success ---
  if (signResult) {
    const receipt = signResult.signatureReceipt;
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg rounded-xl border bg-white p-8 shadow-sm">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Your signature has been recorded</h1>
          </div>

          {/* Signature Receipt */}
          {receipt && (
            <div className="mt-6 rounded-xl border bg-gray-50 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Signature Receipt</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Document</p>
                    <p className="font-medium text-gray-900">Lease - {propertyAddress}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Signed by</p>
                    <p className="font-medium text-gray-900">{receipt.signedBy}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="font-medium text-gray-900">{receipt.email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Date & Time</p>
                    <p className="font-medium text-gray-900">{fmtDateTime(receipt.signedAt)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">IP Address</p>
                    <p className="font-medium text-gray-900">{receipt.ipAddress}</p>
                  </div>
                </div>
                {receipt.location && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Location</p>
                      <p className="font-medium text-gray-900">{receipt.location}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Hash className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Signature ID</p>
                    <p className="font-mono text-xs font-medium text-gray-900">{receipt.signatureId}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            {signResult.remainingSignatures > 0 ? (
              <p>
                {signResult.remainingSignatures} other tenant
                {signResult.remainingSignatures > 1 ? "s" : ""} still need
                {signResult.remainingSignatures === 1 ? "s" : ""} to sign.
              </p>
            ) : (
              <p className="font-medium text-green-700">
                All tenants have signed. The lease is now active.
              </p>
            )}
          </div>

          {/* Download button */}
          {signResult.allSigned && (signResult.documentUrl ?? lease.documentUrl) && (
            <div className="mt-4 text-center">
              <a
                href={signResult.documentUrl ?? lease.documentUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                Download Signed Document
              </a>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-gray-400">
            A confirmation will be sent to {tenant.email} when all parties have signed.
          </p>
        </div>
      </div>
    );
  }

  // --- Main signing page ---
  const canSubmit =
    documentFullyViewed &&
    allConsented &&
    fullName.trim().length > 0 &&
    nameMatches &&
    signatureImage !== null &&
    !signing;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{organization.name}</p>
            <p className="text-xs text-gray-500">Secure Lease Signing</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Lease Agreement</h1>
          <p className="mt-1 text-gray-500">{propertyAddress}</p>
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
                <p className="text-sm font-semibold text-gray-900">{fmtDate(lease.startDate)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div>
                <p className="text-xs font-medium text-gray-500">End Date</p>
                <p className="text-sm font-semibold text-gray-900">{fmtDate(lease.endDate)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
              <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div>
                <p className="text-xs font-medium text-gray-500">Monthly Rent</p>
                <p className="text-sm font-semibold text-gray-900">
                  {currency(Number(lease.monthlyRent))}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
              <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div>
                <p className="text-xs font-medium text-gray-500">Security Deposit</p>
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
                  <p className="text-xs font-medium text-gray-500">Grace Period</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {lease.gracePeriodDays} day{lease.gracePeriodDays !== 1 ? "s" : ""}
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
            <p className="text-gray-500">{propertyAddress}</p>
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

        {/* Document Viewer with Scroll Tracking */}
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FileText className="h-5 w-5 text-blue-600" />
            Lease Document
          </h2>

          {/* Scroll Progress */}
          <div className="mt-4 mb-3">
            {documentFullyViewed ? (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">Document reviewed</span>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 font-medium">
                    Scroll to review the full document
                  </span>
                  <span className="text-xs text-gray-400">{scrollProgress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-blue-500 transition-all duration-200"
                    style={{ width: `${scrollProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {lease.documentUrl ? (
            <div
              ref={iframeContainerRef}
              className="overflow-auto rounded-lg border"
              style={{ height: 600 }}
              onScroll={handleDocumentScroll}
            >
              <iframe
                src={lease.documentUrl}
                title="Lease Document"
                className="w-full"
                style={{ height: 1800, minHeight: 1800 }}
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed bg-gray-50 py-16">
              <p className="text-sm text-gray-400">Document preview not available</p>
            </div>
          )}
        </div>

        {/* Signature Form */}
        <div className={`rounded-xl border-2 ${documentFullyViewed ? "border-blue-200" : "border-gray-200"} bg-white p-6 shadow-sm`}>
          <h2 className="text-lg font-semibold text-gray-900">Sign This Lease</h2>
          <p className="mt-1 text-sm text-gray-500">
            {documentFullyViewed
              ? "Review and complete the fields below to sign electronically."
              : "You must scroll through and review the entire document before signing."}
          </p>

          <div className="mt-6 space-y-5">
            {/* Three Consent Checkboxes */}
            <div className="space-y-3">
              <label className={`flex cursor-pointer items-start gap-3 ${!documentFullyViewed ? "opacity-50 pointer-events-none" : ""}`}>
                <input
                  type="checkbox"
                  checked={consent1}
                  disabled={!documentFullyViewed}
                  onChange={(e) => {
                    setConsent1(e.target.checked);
                    if (e.target.checked && !consent1CheckedAt) {
                      setConsent1CheckedAt(new Date().toISOString());
                    }
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  I have read and understand this lease agreement in its entirety
                </span>
              </label>

              <label className={`flex cursor-pointer items-start gap-3 ${!documentFullyViewed ? "opacity-50 pointer-events-none" : ""}`}>
                <input
                  type="checkbox"
                  checked={consent2}
                  disabled={!documentFullyViewed}
                  onChange={(e) => {
                    setConsent2(e.target.checked);
                    if (e.target.checked && !consent2CheckedAt) {
                      setConsent2CheckedAt(new Date().toISOString());
                    }
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  I agree to use electronic signatures and acknowledge that my electronic signature
                  has the same legal effect as a handwritten signature, pursuant to the ESIGN Act
                  (15 U.S.C. &sect; 7001) and UETA
                </span>
              </label>

              <label className={`flex cursor-pointer items-start gap-3 ${!documentFullyViewed ? "opacity-50 pointer-events-none" : ""}`}>
                <input
                  type="checkbox"
                  checked={consent3}
                  disabled={!documentFullyViewed}
                  onChange={(e) => {
                    setConsent3(e.target.checked);
                    if (e.target.checked && !consent3CheckedAt) {
                      setConsent3CheckedAt(new Date().toISOString());
                    }
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  I confirm that I am the person identified above and I am signing this document voluntarily
                </span>
              </label>
            </div>

            {/* Name Input */}
            <div className={!allConsented ? "opacity-50 pointer-events-none" : ""}>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                Type your full legal name exactly as it appears above
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                disabled={!allConsented}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (e.target.value.trim() && !nameTypedAt) {
                    setNameTypedAt(new Date().toISOString());
                  }
                }}
                onBlur={() => {
                  if (fullName.trim()) {
                    setNameTypedAt(new Date().toISOString());
                  }
                }}
                placeholder="Enter your full legal name"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              />

              {/* Name verification */}
              {fullName.trim() && allConsented && (
                <div className="mt-2">
                  {nameMatches ? (
                    <p className="text-sm text-green-700 flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      You are signing as <span className="font-medium">{fullName.trim()}</span> at email{" "}
                      <span className="font-medium">{tenant.email}</span>. Is this correct?
                    </p>
                  ) : (
                    <p className="text-sm text-amber-600 flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        The name you typed doesn&apos;t match the name on this lease. Please type your
                        name exactly as: <span className="font-semibold">{expectedName}</span>
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Signature Pad */}
            <div className={!allConsented ? "opacity-50 pointer-events-none" : ""}>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Your Signature
              </label>
              <SignaturePad fullName={fullName} onSignatureReady={setSignatureImage} />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
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

            {/* Signing timestamp */}
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <span className="font-medium">Signing date:</span>{" "}
              {new Date().toLocaleString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </div>

            {signError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{signError}</div>
            )}

            <button
              onClick={handleSign}
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              Sign Lease
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">
            By signing, you acknowledge that this electronic signature carries the same legal
            weight as a handwritten signature under the ESIGN Act (15 U.S.C. &sect; 7001).
          </p>
        </div>

        <div className="mt-8 border-t pt-6 text-center text-xs text-gray-400">
          <p>Powered by Brevva &mdash; Secure electronic lease signing</p>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmSignModal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmSign}
        signing={signing}
        propertyAddress={propertyAddress}
        monthlyRent={Number(lease.monthlyRent)}
        startDate={lease.startDate}
        endDate={lease.endDate}
      />
    </div>
  );
}
