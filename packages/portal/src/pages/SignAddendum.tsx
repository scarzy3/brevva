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
} from "lucide-react";

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

const SIGNATURE_FONTS = [
  { label: "Script", value: "'Brush Script MT', 'Segoe Script', cursive" },
  { label: "Formal", value: "Georgia, 'Times New Roman', serif" },
  { label: "Casual", value: "'Comic Sans MS', 'Segoe Print', cursive" },
  { label: "Elegant", value: "'Palatino Linotype', 'Book Antiqua', serif" },
];

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

// Types
interface AddendumSigningData {
  tenant: { id: string; firstName: string; lastName: string; email: string };
  addendum: {
    id: string;
    title: string;
    content: string;
    documentUrl: string | null;
    documentHash: string | null;
    effectiveDate: string | null;
    status: string;
  };
  lease: {
    id: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
  };
  unit: {
    id: string;
    unitNumber: string;
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
  signatures: {
    firstName: string;
    lastName: string;
    signed: boolean;
  }[];
}

interface SignResult {
  signedAt: string;
  allSigned: boolean;
  remainingSignatures: number;
}

export default function SignAddendum() {
  const { token } = useParams();

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToEsign, setAgreedToEsign] = useState(false);
  const [fullName, setFullName] = useState("");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signResult, setSignResult] = useState<SignResult | null>(null);

  const { data, isLoading, error } = useQuery<AddendumSigningData>({
    queryKey: ["sign-addendum", token],
    queryFn: async () => {
      const res = await fetch("/api/v1/leases/addendum/sign/" + token);
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

  const handleSign = async () => {
    if (!agreedToTerms || !agreedToEsign || !fullName.trim() || !signatureImage) return;

    setSigning(true);
    setSignError(null);

    try {
      const res = await fetch("/api/v1/leases/addendum/sign/" + token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: data!.tenant.email,
          agreedToTerms: true,
          agreedToEsign: true,
          signatureImage,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? body?.error ?? body?.message ?? `Signing failed (${res.status})`;
        throw new Error(typeof msg === "string" ? msg : String(msg));
      }

      const result: SignResult = await res.json();
      setSignResult(result);
    } catch (err) {
      setSignError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSigning(false);
    }
  };

  // Loading
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-4 text-sm text-gray-500">Loading addendum details...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    const msg = error instanceof Error ? error.message : "Unable to load addendum details";
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
                You have already signed this addendum. No further action is needed.
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="mx-auto h-14 w-14 text-amber-500" />
              <h1 className="mt-4 text-xl font-bold text-gray-900">
                {isExpired ? "Link Expired or Invalid" : "Unable to Load Addendum"}
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

  const { tenant, addendum, lease, unit, organization, signatures } = data;
  const property = unit.property;

  // Success
  if (signResult) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg rounded-xl border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Thank You!</h1>
          <p className="mt-2 text-gray-600">The addendum has been successfully signed.</p>
          <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            <p>
              Signed on <span className="font-medium">{fmtDateTime(signResult.signedAt)}</span>
            </p>
            {signResult.remainingSignatures > 0 ? (
              <p className="mt-1">
                {signResult.remainingSignatures} other tenant
                {signResult.remainingSignatures > 1 ? "s" : ""} still need
                {signResult.remainingSignatures === 1 ? "s" : ""} to sign.
              </p>
            ) : (
              <p className="mt-1 font-medium text-green-700">
                All tenants have signed. The addendum is now active.
              </p>
            )}
          </div>
          {addendum.documentUrl && (
            <a
              href={addendum.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Download Document
            </a>
          )}
          <p className="mt-6 text-xs text-gray-400">
            A confirmation email has been sent to {tenant.email}. You may close this page.
          </p>
        </div>
      </div>
    );
  }

  // Main signing page
  const canSubmit =
    agreedToTerms && agreedToEsign && fullName.trim().length > 0 && signatureImage !== null && !signing;

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
            <p className="text-xs text-gray-500">Secure Document Signing</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Lease Addendum</h1>
          <p className="mt-1 text-lg font-medium text-gray-700">{addendum.title}</p>
          <p className="mt-1 text-gray-500">
            {property.address}, {property.city}, {property.state} {property.zip}
          </p>
        </div>

        {/* Addendum Details */}
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FileText className="h-5 w-5 text-blue-600" />
            Addendum Details
          </h2>
          <div className="mt-4 space-y-2 text-sm text-gray-700">
            {addendum.effectiveDate && (
              <p>
                <span className="font-medium">Effective Date:</span>{" "}
                {fmtDate(addendum.effectiveDate)}
              </p>
            )}
            {addendum.content && (
              <p>
                <span className="font-medium">Description:</span> {addendum.content}
              </p>
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
              {property.address}, {property.city}, {property.state} {property.zip}
            </p>
            <p className="mt-2">
              <span className="font-medium">Unit:</span> {unit.unitNumber}
            </p>
          </div>
        </div>

        {/* Signatures */}
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Users className="h-5 w-5 text-blue-600" />
            Signatures
          </h2>
          <div className="mt-3 space-y-2">
            {signatures.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5"
              >
                <span className="text-sm font-medium text-gray-900">
                  {s.firstName} {s.lastName}
                </span>
                {s.signed ? (
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
        {addendum.documentUrl && (
          <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <FileText className="h-5 w-5 text-blue-600" />
              Document
            </h2>
            {addendum.documentUrl.endsWith(".pdf") ? (
              <div className="mt-4 overflow-hidden rounded-lg border">
                <iframe
                  src={addendum.documentUrl}
                  title="Addendum Document"
                  className="h-[600px] w-full"
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between rounded-lg border bg-gray-50 px-4 py-6">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-blue-600" />
                  <p className="text-sm font-medium text-gray-700">Document attached</p>
                </div>
                <a
                  href={addendum.documentUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            )}
          </div>
        )}

        {/* Signature Form */}
        <div className="rounded-xl border-2 border-blue-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Sign This Addendum</h2>
          <p className="mt-1 text-sm text-gray-500">
            Please review the addendum above, then complete the fields below to sign
            electronically.
          </p>

          <div className="mt-6 space-y-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                I have read and agree to the terms of this addendum
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
                I agree to use electronic signatures as a legally binding method of signing this
                document
              </span>
            </label>

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
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

            <div>
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
              {signing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Sign Addendum
                </>
              )}
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">
            By signing, you acknowledge that this electronic signature carries the same legal
            weight as a handwritten signature under the ESIGN Act (15 U.S.C. &sect; 7001).
          </p>
        </div>

        <div className="mt-8 border-t pt-6 text-center text-xs text-gray-400">
          <p>Powered by Brevva &mdash; Secure electronic document signing</p>
        </div>
      </div>
    </div>
  );
}
