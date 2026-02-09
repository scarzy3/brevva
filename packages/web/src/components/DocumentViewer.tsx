import { useState } from "react";
import { FileText, Download, Loader2, AlertTriangle } from "lucide-react";

interface DocumentViewerProps {
  documentUrl: string | null | undefined;
  className?: string;
}

export default function DocumentViewer({ documentUrl, className }: DocumentViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!documentUrl) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed bg-gray-50 py-16">
        <p className="text-sm text-gray-400">No document available</p>
      </div>
    );
  }

  const ext = documentUrl.split(".").pop()?.toLowerCase();
  const isPdf = ext === "pdf";
  const isHtml = ext === "html";
  const isDocx = ext === "docx";

  if (isDocx) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-gray-50 px-4 py-6">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-blue-600" />
          <div>
            <p className="text-sm font-medium text-gray-900">Word Document</p>
            <p className="text-xs text-gray-500">DOCX files cannot be previewed in the browser</p>
          </div>
        </div>
        <a
          href={documentUrl}
          download
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      </div>
    );
  }

  if (isPdf || isHtml) {
    return (
      <div className={className ?? "overflow-hidden rounded-lg border"}>
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="mt-2 text-sm text-gray-500">Failed to load document</p>
            <a
              href={documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Open in new tab
            </a>
          </div>
        )}
        <iframe
          src={documentUrl}
          title="Document Viewer"
          className={`w-full ${loading || error ? "hidden" : ""}`}
          style={{ height: 600 }}
          sandbox="allow-same-origin"
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
        />
      </div>
    );
  }

  // Unknown type — show download link
  return (
    <div className="flex items-center justify-between rounded-lg border bg-gray-50 px-4 py-6">
      <div className="flex items-center gap-3">
        <FileText className="h-8 w-8 text-gray-400" />
        <p className="text-sm font-medium text-gray-700">Document</p>
      </div>
      <a
        href={documentUrl}
        download
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Download className="h-4 w-4" />
        Download
      </a>
    </div>
  );
}
