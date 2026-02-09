import type { Request } from "express";

/**
 * Extract the real client IP address from the request, accounting for
 * Cloudflare, nginx reverse proxy, and Docker network layers.
 *
 * Priority:
 * 1. CF-Connecting-IP (Cloudflare's verified client IP)
 * 2. X-Real-IP (set by nginx from $remote_addr)
 * 3. X-Forwarded-For first entry (standard proxy header)
 * 4. req.ip (Express trust proxy fallback)
 */
export function getClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp) return Array.isArray(cfIp) ? cfIp[0] ?? "unknown" : cfIp;

  const realIp = req.headers["x-real-ip"];
  if (realIp) return Array.isArray(realIp) ? realIp[0] ?? "unknown" : realIp;

  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
    if (first) return first;
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Extract the client's country from Cloudflare's CF-IPCountry header.
 * Returns null if not behind Cloudflare or header is not present.
 */
export function getClientCountry(req: Request): string | null {
  const country = req.headers["cf-ipcountry"]?.toString();
  if (!country || country === "XX") return null;
  return country;
}
