import { useState, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";

const labelCls = "mb-1 block text-sm font-medium text-gray-700";
const inputCls =
  "w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";
const errorCls = "mt-1 text-xs text-red-600";

export default function CreateAddendum() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      api(`/leases/${id}/addendums`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lease", id] });
      toast("Addendum created successfully");
      navigate(`/leases/${id}`);
    },
    onError: (err: any) => {
      const msg = err?.data?.message || "Failed to create addendum";
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
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
            Create Addendum
          </h1>
          <p className="text-sm text-gray-500">
            Add a new addendum to this lease
          </p>
        </div>
      </div>

      {/* Form */}
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
            {mutation.isPending ? "Creating..." : "Create Addendum"}
          </button>
        </div>
      </form>
    </div>
  );
}
