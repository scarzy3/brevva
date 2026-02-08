import type { Request } from "express";

/**
 * Safely extract a validated route parameter.
 * Use after Zod validation middleware has run on req.params.
 */
export function param(req: Request, name: string): string {
  return req.params[name] as string;
}
