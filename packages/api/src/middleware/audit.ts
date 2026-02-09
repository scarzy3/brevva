import type { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getClientIp } from "../lib/client-ip.js";

export function auditLog(
  action: string,
  entityType: string,
  getEntityId?: (req: Request, res: Response) => string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      // Only audit state-changing operations
      if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && req.user) {
        const entityId =
          getEntityId?.(req, res) ??
          (req.params["id"] as string | undefined) ??
          ((body as Record<string, unknown>)?.["id"] as string | undefined) ??
          "unknown";

        prisma.auditLog
          .create({
            data: {
              organizationId: req.user.organizationId,
              userId: req.user.userId,
              action,
              entityType,
              entityId: String(entityId),
              changes: {
                ...(req.body as object),
                userAgent: req.headers["user-agent"] ?? "unknown",
              },
              ipAddress: getClientIp(req),
            },
          })
          .catch((err: unknown) => {
            console.error("Failed to write audit log:", err);
          });
      }
      return originalJson(body);
    } as typeof res.json;
    next();
  };
}

/**
 * Create an audit log entry directly (for unauthenticated flows like token-based signing).
 */
export async function createAuditEntry(data: {
  organizationId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  return prisma.auditLog
    .create({
      data: {
        ...data,
        changes: data.changes as Prisma.InputJsonValue | undefined,
      },
    })
    .catch((err: unknown) => {
      console.error("Failed to write audit log:", err);
    });
}
