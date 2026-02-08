import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodSchema } from "zod";

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as Record<string, string>;
    }
    if (schemas.query) {
      req.query = schemas.query.parse(req.query) as Record<string, string>;
    }
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    next();
  };
}
