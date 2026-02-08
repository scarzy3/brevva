import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/tokens.js";
import { AuthenticationError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import type { UserRole } from "@prisma/client";

export interface AuthUser {
  userId: string;
  organizationId: string;
  role: UserRole;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AuthenticationError("Missing or invalid authorization header");
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.userId,
      organizationId: payload.organizationId,
      role: payload.role as UserRole,
      email: "",
    };
    next();
  } catch {
    throw new AuthenticationError("Invalid or expired token");
  }
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.userId,
      organizationId: payload.organizationId,
      role: payload.role as UserRole,
      email: "",
    };
  } catch {
    // Token invalid — proceed without auth
  }
  next();
}
