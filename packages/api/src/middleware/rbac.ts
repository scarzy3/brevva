import type { Request, Response, NextFunction, RequestHandler } from "express";
import { AuthorizationError } from "../lib/errors.js";
import type { UserRole } from "@prisma/client";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  OWNER: 3,
  TEAM_MEMBER: 2,
  TENANT: 1,
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AuthorizationError("Authentication required");
    }
    if (!roles.includes(req.user.role)) {
      throw new AuthorizationError(
        `This action requires one of: ${roles.join(", ")}`
      );
    }
    next();
  };
}

export function requireMinRole(minRole: UserRole): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AuthorizationError("Authentication required");
    }
    const userLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
    if (userLevel < requiredLevel) {
      throw new AuthorizationError(
        `This action requires at least ${minRole} role`
      );
    }
    next();
  };
}
