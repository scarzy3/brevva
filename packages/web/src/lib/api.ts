const API_BASE = "/api/v1";

interface ApiOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown
  ) {
    super(`API error ${status}`);
    this.name = "ApiError";
  }
}

function getTokens() {
  const raw = localStorage.getItem("auth");
  if (!raw) return null;
  return JSON.parse(raw) as { accessToken: string; refreshToken: string };
}

function setTokens(accessToken: string, refreshToken: string) {
  const raw = localStorage.getItem("auth");
  const auth = raw ? JSON.parse(raw) : {};
  auth.accessToken = accessToken;
  auth.refreshToken = refreshToken;
  localStorage.setItem("auth", JSON.stringify(auth));
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) throw new Error("No refresh token");

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!res.ok) {
    localStorage.removeItem("auth");
    window.location.href = "/login";
    throw new Error("Refresh failed");
  }

  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) searchParams.set(key, String(value));
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const tokens = getTokens();
  const headers = new Headers(fetchOptions.headers);
  if (tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }
  if (
    !headers.has("Content-Type") &&
    fetchOptions.body &&
    !(fetchOptions.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  let res = await fetch(url, { ...fetchOptions, headers });

  // Token expired — try refresh once
  if (res.status === 401 && tokens?.refreshToken) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    headers.set("Authorization", `Bearer ${newToken}`);
    res = await fetch(url, { ...fetchOptions, headers });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
