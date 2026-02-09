import { useState, useEffect, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";

const labelCls = "mb-1 block text-sm font-medium text-gray-700";
const inputCls =
  "w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";
const errorCls = "mt-1 text-xs text-red-600";

export default function EditAddendum() {
  const { id, addendumId } = useParams<{ id: string; addendumId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const { data: addendum, isLoading } = useQuery({
    queryKey: ["addendum", id, addendumId],
    queryFn: () => api<any>(`/leases/${id}/addendums/${addendumId}`),
    enabled: !!id && !!addendumId,
  });

  useEffect(() => {
    if (addendum?.data && !loaded) {
      const a = addendum.data;
      setTitle(a.title ?? "");
      setContent(a.content ?? "");
      if (a.effectiveDate) {
        setEffectiveDate(new Date(a.effectiveDate).toISOString().slice(0, 10));
      }
      setLoaded(true);
    }
  }, [addendum, loaded]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Title is required";
    else if (title.length > 200) e.title = "Title must be 200 characters or less";
    if (!content.trim()) e.content = "Content is required";
    else if (content.length > 50000)
      e.content = "Content must be 50,000 characters or less";
    return e;
  };

  const mutation = useMutation({
    mutationFn: () =>
      api(`/leases/${id}/addendums/${addendumId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          ...(effectiveDate ? { effectiveDate: new Date(effectiveDate).toISOString() } : { effectiveDate: null }),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lease", id] });
      queryClient.invalidateQueries({ queryKey: ["addendum", id, addendumId] });
      toast("Addendum updated successfully");
      navigate(`/leases/${id}`);
    },
    onError: (err: any) => {
      const msg = err?.data?.message || err?.data?.error || "Failed to update addendum";
      toast(msg, "error");
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    mutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (addendum?.data?.status !== "DRAFT") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-xl border bg-white p-8 text-center">
          <p className="font-medium text-gray-900">Only draft addendums can be edited</p>
          <Link
            to={`/leases/${id}`}
            className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Lease
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to={`/leases/${id}`}
          className="rounded-lg border bg-white p-2 text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <FileText className="h-5 w-5 text-blue-600" />
            Edit Addendum
          </h1>
          <p className="text-sm text-gray-500">
            Edit this draft addendum
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className={labelCls}>
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((p) => ({ ...p, title: "" }));
              }}
              placeholder="e.g. Pet Policy Amendment"
              className={inputCls}
            />
            {errors.title && <p className={errorCls}>{errors.title}</p>}
          </div>

          <div>
            <label htmlFor="effectiveDate" className={labelCls}>
              Effective Date (optional)
            </label>
            <input
              id="effectiveDate"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="content" className={labelCls}>
              Content
            </label>
            <textarea
              id="content"
              rows={10}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (errors.content) setErrors((p) => ({ ...p, content: "" }));
              }}
              placeholder="Enter the full text of the addendum..."
              className={inputCls + " resize-y"}
            />
            {errors.content && <p className={errorCls}>{errors.content}</p>}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Link
            to={`/leases/${id}`}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
