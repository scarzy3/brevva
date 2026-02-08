import type { Request, Response, NextFunction } from "express";
import { AuthenticationError } from "../lib/errors.js";

declare global {
  namespace Express {
    interface Request {
      organizationId?: string;
    }
  }
}

export function tenancy(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    throw new AuthenticationError("Authentication required for tenancy");
  }
  req.organizationId = req.user.organizationId;
  next();
}
