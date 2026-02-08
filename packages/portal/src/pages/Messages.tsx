import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Send } from "lucide-react";
import { clsx } from "clsx";

export default function Messages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const { data: threadsData } = useQuery({
    queryKey: ["threads"],
    queryFn: () => api<{ data: any[] }>("/messages/threads", { params: { limit: 50 } }),
  });

  const { data: thread } = useQuery({
    queryKey: ["thread", selectedThreadId],
    queryFn: () => api<any>(`/messages/threads/${selectedThreadId}`),
    enabled: !!selectedThreadId,
  });

  const replyMutation = useMutation({
    mutationFn: (body: string) =>
      api(`/messages/threads/${selectedThreadId}/reply`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["thread", selectedThreadId] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const threads = threadsData?.data ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Messages</h1>

      <div className="flex h-[calc(100vh-220px)] overflow-hidden rounded-xl border bg-white">
        <div className="w-72 shrink-0 border-r overflow-y-auto">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No conversations</p>
          ) : (
            threads.map((t: any) => (
              <button
                key={t.id}
                onClick={() => setSelectedThreadId(t.id)}
                className={clsx(
                  "w-full border-b p-4 text-left hover:bg-gray-50",
                  selectedThreadId === t.id && "bg-teal-50"
                )}
              >
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium">{t.subject}</p>
                  {t.unreadCount > 0 && (
                    <span className="rounded-full bg-teal-600 px-1.5 py-0.5 text-xs text-white">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-400 line-clamp-1">
                  {t.messages?.[0]?.body ?? ""}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="flex flex-1 flex-col">
          {!selectedThreadId ? (
            <div className="flex flex-1 items-center justify-center text-gray-400">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="border-b px-4 py-3">
                <h3 className="font-semibold">{thread?.subject ?? ""}</h3>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {(thread?.messages ?? []).map((m: any) => {
                  const isMe = m.senderId === user?.userId;
                  return (
                    <div key={m.id} className={clsx("flex", isMe && "justify-end")}>
                      <div className={clsx(
                        "max-w-[70%] rounded-lg px-4 py-2.5",
                        isMe ? "bg-teal-600 text-white" : "bg-gray-100"
                      )}>
                        <p className="text-sm">{m.body}</p>
                        <p className={clsx("mt-1 text-xs", isMe ? "text-teal-200" : "text-gray-400")}>
                          {m.sender?.firstName} {m.sender?.lastName} · {new Date(m.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); if (replyBody.trim()) replyMutation.mutate(replyBody); }}
                className="flex items-center gap-2 border-t p-3"
              >
                <input
                  type="text"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
                />
                <button
                  type="submit"
                  disabled={!replyBody.trim() || replyMutation.isPending}
                  className="rounded-lg bg-teal-600 p-2 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
