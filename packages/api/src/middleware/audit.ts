import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

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
              changes: req.body as object,
              ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
            },
          })
          .catch((err) => {
            console.error("Failed to write audit log:", err);
          });
      }
      return originalJson(body);
    } as typeof res.json;
    next();
  };
}
