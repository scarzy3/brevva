import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  Check,
  Clock,
  X,
  FileText,
  Send,
  Trash2,
  RefreshCw,
  Download,
  PenLine,
  AlertTriangle,
  ExternalLink,
  DollarSign,
  Calendar,
  Building2,
  Users,
  ClipboardList,
  History,
  CreditCard,
  Plus,
  Ban,
  Shield,
  Eraser,
  Type,
  Loader2,
} from "lucide-react";

function currency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  PENDING_SIGNATURE: "bg-yellow-100 text-yellow-700",
  ACTIVE: "bg-green-100 text-green-700",
  EXPIRED: "bg-red-100 text-red-700",
  TERMINATED: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_SIGNATURE: "Pending Signature",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  TERMINATED: "Terminated",
};

// ---------------------------------------------------------------------------
// Signature pad (for countersign modal)
// ---------------------------------------------------------------------------
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

const paymentStatusColors: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-700",
  PENDING: "bg-yellow-100 text-yellow-700",
  FAILED: "bg-red-100 text-red-700",
  REFUNDED: "bg-gray-100 text-gray-600",
};

export default function LeaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCountersignModal, setShowCountersignModal] = useState(false);
  const [csFullName, setCsFullName] = useState("");
  const [csSignatureImage, setCsSignatureImage] = useState<string | null>(null);

  const {
    data: lease,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["lease", id],
    queryFn: () => api<any>(`/leases/${id}`),
    enabled: !!id,
  });

  // --- Mutations ---

  const sendForSignature = useMutation({
    mutationFn: () =>
      api(`/leases/${id}/send-for-signature`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lease", id] });
      setActionError(null);
    },
    onError: (err: any) =>
      setActionError(err?.data?.error ?? err?.message ?? "Failed to send"),
  });

  const resendEmails = useMutation({
    mutationFn: () => api(`/leases/${id}/resend`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lease", id] });
      setActionError(null);
    },
    onError: (err: any) =>
      setActionError(err?.data?.error ?? err?.message ?? "Failed to resend"),
  });

  const countersign = useMutation({
    mutationFn: (data: { fullName: string; signatureImage?: string | null }) =>
      api(`/leases/${id}/countersign`, {
        method: "POST",
        body: JSON.stringify({
          fullName: data.fullName,
          ...(data.signatureImage ? { signatureImage: data.signatureImage } : {}),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lease", id] });
      setActionError(null);
      setShowCountersignModal(false);
      setCsFullName("");
      setCsSignatureImage(null);
    },
    onError: (err: any) =>
      setActionError(
        err?.data?.error?.message ?? err?.data?.error ?? err?.message ?? "Failed to countersign"
      ),
  });

  const terminateLease = useMutation({
    mutationFn: () => api(`/leases/${id}/terminate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lease", id] });
      setActionError(null);
    },
    onError: (err: any) =>
      setActionError(
        err?.data?.error ?? err?.message ?? "Failed to terminate"
      ),
  });

  const deleteLease = useMutation({
    mutationFn: () => api(`/leases/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leases"] });
      navigate("/leases");
    },
    onError: (err: any) =>
      setActionError(err?.data?.error ?? err?.message ?? "Failed to delete"),
  });

  // --- Action handlers ---

  const handleSendForSignature = () => {
    if (
      !window.confirm(
        "Send this lease to all tenants for electronic signature?"
      )
    )
      return;
    sendForSignature.mutate();
  };

  const handleResend = () => {
    if (!window.confirm("Resend signing emails to all unsigned tenants?"))
      return;
    resendEmails.mutate();
  };

  const handleCountersign = () => {
    setShowCountersignModal(true);
  };

  const handleCountersignSubmit = () => {
    if (!csFullName.trim() || !csSignatureImage) return;
    countersign.mutate({
      fullName: csFullName.trim(),
      signatureImage: csSignatureImage,
    });
  };

  const handleTerminate = () => {
    if (
      !window.confirm(
        "Are you sure you want to terminate this lease? This action cannot be undone."
      )
    )
      return;
    terminateLease.mutate();
  };

  const handleDelete = () => {
    if (
      !window.confirm(
        "Are you sure you want to permanently delete this draft lease?"
      )
    )
      return;
    deleteLease.mutate();
  };

  // --- Loading ---
  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !lease) {
    return (
      <div>
        <Link
          to="/leases"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Leases
        </Link>
        <div className="rounded-xl border bg-white p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-3 font-medium text-gray-900">Lease not found</p>
          <p className="mt-1 text-sm text-gray-500">
            The lease may have been deleted or you may not have access.
          </p>
        </div>
      </div>
    );
  }

  const status: string = lease.status;
  const property = lease.unit?.property;
  const tenants: any[] = lease.tenants ?? [];
  const addendums: any[] = lease.addendums ?? [];
  const payments: any[] = lease.payments ?? [];
  const auditLogs: any[] = lease.auditLogs ?? [];
  const isMutating =
    sendForSignature.isPending ||
    resendEmails.isPending ||
    countersign.isPending ||
    terminateLease.isPending ||
    deleteLease.isPending;

  return (
    <div>
      {/* Back link */}
      <Link
        to="/leases"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Leases
      </Link>

      {/* Action error banner */}
      {actionError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="mb-6 rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {property?.name} #{lease.unit?.unitNumber}
            </h1>
            <p className="mt-1 text-gray-500">
              {property?.address}, {property?.city}, {property?.state}{" "}
              {property?.zip}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${statusColors[status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {statusLabels[status] ?? status}
          </span>
        </div>

        {/* Lease Summary Grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              Start Date
            </div>
            <p className="mt-1 text-sm font-bold">{fmtDate(lease.startDate)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              End Date
            </div>
            <p className="mt-1 text-sm font-bold">{fmtDate(lease.endDate)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <DollarSign className="h-3.5 w-3.5" />
              Monthly Rent
            </div>
            <p className="mt-1 text-sm font-bold">
              {currency(Number(lease.monthlyRent ?? 0))}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <DollarSign className="h-3.5 w-3.5" />
              Security Deposit
            </div>
            <p className="mt-1 text-sm font-bold">
              {currency(Number(lease.securityDeposit ?? 0))}
            </p>
          </div>
          {lease.lateFeeAmount != null && (
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <DollarSign className="h-3.5 w-3.5" />
                Late Fee
              </div>
              <p className="mt-1 text-sm font-bold">
                {lease.lateFeeType === "PERCENTAGE"
                  ? `${lease.lateFeeAmount}%`
                  : currency(Number(lease.lateFeeAmount))}
              </p>
            </div>
          )}
          {lease.gracePeriodDays != null && (
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Clock className="h-3.5 w-3.5" />
                Grace Period
              </div>
              <p className="mt-1 text-sm font-bold">
                {lease.gracePeriodDays} day
                {lease.gracePeriodDays !== 1 ? "s" : ""}
              </p>
            </div>
          )}
          {lease.rentDueDay != null && (
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Calendar className="h-3.5 w-3.5" />
                Rent Due Day
              </div>
              <p className="mt-1 text-sm font-bold">
                {lease.rentDueDay === 1
                  ? "1st"
                  : lease.rentDueDay === 2
                    ? "2nd"
                    : lease.rentDueDay === 3
                      ? "3rd"
                      : `${lease.rentDueDay}th`}{" "}
                of each month
              </p>
            </div>
          )}
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <FileText className="h-3.5 w-3.5" />
              Lease Type
            </div>
            <p className="mt-1 text-sm font-bold">
              {lease.leaseType ?? "Standard"}
            </p>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {/* DRAFT actions */}
        {status === "DRAFT" && (
          <>
            <Link
              to={`/leases/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <PenLine className="h-4 w-4" />
              Edit
            </Link>
            <button
              onClick={handleSendForSignature}
              disabled={isMutating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Send for Signature
            </button>
            <button
              onClick={handleDelete}
              disabled={isMutating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </>
        )}

        {/* PENDING_SIGNATURE actions */}
        {status === "PENDING_SIGNATURE" && (
          <>
            <button
              onClick={handleResend}
              disabled={isMutating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Resend Email
            </button>
            {lease.documentUrl && (
              <a
                href={lease.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4" />
                View Document
              </a>
            )}
            <button
              onClick={handleTerminate}
              disabled={isMutating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Ban className="h-4 w-4" />
              Void / Cancel
            </button>
          </>
        )}

        {/* ACTIVE actions */}
        {status === "ACTIVE" && (
          <>
            {lease.documentUrl && (
              <>
                <a
                  href={lease.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Document
                </a>
                <a
                  href={lease.documentUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </>
            )}
            {!lease.landlordSignedAt && (
              <button
                onClick={handleCountersign}
                disabled={isMutating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <PenLine className="h-4 w-4" />
                Countersign
              </button>
            )}
            <Link
              to={`/leases/${id}/addendum`}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Create Addendum
            </Link>
            <button
              onClick={handleTerminate}
              disabled={isMutating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Ban className="h-4 w-4" />
              Terminate
            </button>
          </>
        )}

        {/* EXPIRED actions */}
        {status === "EXPIRED" && (
          <>
            {lease.documentUrl && (
              <a
                href={lease.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4" />
                View Document
              </a>
            )}
            <Link
              to={`/leases/new?renewFrom=${id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              Renew Lease
            </Link>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Signature Status */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <Users className="h-4 w-4 text-blue-600" />
            Signature Status
          </h2>

          {/* Tenant signatures */}
          <div className="space-y-2">
            {tenants.map((lt: any) => (
              <div
                key={lt.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <Link
                    to={`/tenants/${lt.tenant?.id}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {lt.tenant?.firstName} {lt.tenant?.lastName}
                  </Link>
                  {lt.isPrimary && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Primary
                    </span>
                  )}
                </div>
                <div>
                  {lt.signedAt ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                      <Check className="h-3.5 w-3.5" />
                      Signed {fmtDate(lt.signedAt)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                      <Clock className="h-3.5 w-3.5" />
                      Pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Landlord countersignature */}
          <div className="mt-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  Landlord Countersignature
                </span>
              </div>
              {lease.landlordSignedAt ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                  <Check className="h-3.5 w-3.5" />
                  Signed {fmtDate(lease.landlordSignedAt)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                  <Clock className="h-3.5 w-3.5" />
                  Not yet signed
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Addendums */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <ClipboardList className="h-4 w-4 text-blue-600" />
            Addendums
          </h2>
          {addendums.length === 0 ? (
            <p className="text-sm text-gray-400">No addendums</p>
          ) : (
            <div className="space-y-2">
              {addendums.map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {a.title}
                    </p>
                    <p className="text-xs text-gray-400">
                      Added {fmtDate(a.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.status === "ACTIVE"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Document Viewer */}
      {lease.documentUrl && (
        <div className="mt-6 rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4 text-blue-600" />
            Lease Document
          </h2>
          <div className="overflow-hidden rounded-lg border">
            <iframe
              src={lease.documentUrl}
              title="Lease Document"
              className="h-[500px] w-full"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      )}

      {/* Audit Log / Timeline */}
      <div className="mt-6 rounded-xl border bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <History className="h-4 w-4 text-blue-600" />
          Activity Timeline
        </h2>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-gray-400">No activity recorded</p>
        ) : (
          <div className="relative space-y-0">
            {auditLogs.map((log: any, idx: number) => (
              <div key={log.id} className="flex gap-3">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <div className="h-2 w-2 rounded-full bg-blue-600" />
                  </div>
                  {idx < auditLogs.length - 1 && (
                    <div className="w-px grow bg-gray-200" />
                  )}
                </div>
                <div className="pb-5">
                  <p className="text-sm font-medium text-gray-900">
                    {formatAuditAction(log.action)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {log.user
                      ? `${log.user.firstName} ${log.user.lastName}`
                      : "System"}{" "}
                    &mdash; {fmtDateTime(log.createdAt)}
                  </p>
                  {log.changes &&
                    typeof log.changes === "object" &&
                    Object.keys(log.changes).length > 0 && (
                      <div className="mt-1 rounded bg-gray-50 px-2 py-1 text-xs text-gray-500">
                        {Object.entries(log.changes)
                          .slice(0, 5)
                          .map(([key, val]) => (
                            <span key={key} className="mr-3">
                              <span className="font-medium">{key}:</span>{" "}
                              {String(val)}
                            </span>
                          ))}
                      </div>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Payments */}
      <div className="mt-6 rounded-xl border bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <CreditCard className="h-4 w-4 text-blue-600" />
          Recent Payments
        </h2>
        {payments.length === 0 ? (
          <p className="text-sm text-gray-400">No payments recorded</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2 pr-4">Method</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-4 text-gray-500">
                      {fmtDate(p.paidAt ?? p.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4 font-medium">
                      {currency(Number(p.amount ?? 0))}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">
                      {p.method ?? "--"}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          paymentStatusColors[p.status] ??
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Countersign Modal */}
      {showCountersignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Countersign Lease
              </h2>
              <button
                onClick={() => {
                  setShowCountersignModal(false);
                  setCsFullName("");
                  setCsSignatureImage(null);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-sm text-gray-500">
              As the landlord, sign below to finalize this lease agreement.
              Your electronic signature carries the same legal weight as a
              handwritten signature under the ESIGN Act.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="csFullName"
                  className="block text-sm font-medium text-gray-700"
                >
                  Full Legal Name
                </label>
                <input
                  id="csFullName"
                  type="text"
                  value={csFullName}
                  onChange={(e) => setCsFullName(e.target.value)}
                  placeholder="Enter your full legal name"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Your Signature
                </label>
                <SignaturePad
                  fullName={csFullName}
                  onSignatureReady={setCsSignatureImage}
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

              {actionError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {actionError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCountersignModal(false);
                    setCsFullName("");
                    setCsSignatureImage(null);
                    setActionError(null);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCountersignSubmit}
                  disabled={
                    !csFullName.trim() ||
                    !csSignatureImage ||
                    countersign.isPending
                  }
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {countersign.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    <>
                      <PenLine className="h-4 w-4" />
                      Sign &amp; Finalize
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-gray-400">
              By signing, you acknowledge that this electronic signature
              carries the same legal weight as a handwritten signature under
              the ESIGN Act (15 U.S.C. &sect; 7001).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    CREATE: "Lease created",
    UPDATE: "Lease updated",
    SEND_FOR_SIGNATURE: "Sent for signature",
    SIGN: "Tenant signed",
    COUNTERSIGN: "Landlord countersigned",
    TERMINATE: "Lease terminated",
    DELETE: "Lease deleted",
    ADD_ADDENDUM: "Addendum added",
    RESEND: "Signing emails resent",
    ACTIVATE: "Lease activated",
  };
  return map[action] ?? action.replace(/_/g, " ").toLowerCase();
}
