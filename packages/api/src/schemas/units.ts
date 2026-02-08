import { z } from "zod";
import { paginationSchema } from "../lib/pagination.js";

export const createUnitSchema = z.object({
  unitNumber: z.string().min(1).max(20),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().min(0).max(20),
  sqFt: z.coerce.number().int().positive().optional(),
  floor: z.coerce.number().int().min(0).optional(),
  rent: z.coerce.number().positive(),
  deposit: z.coerce.number().min(0).optional(),
  status: z.enum(["VACANT", "OCCUPIED", "MAINTENANCE", "LISTED"]).optional(),
  description: z.string().max(5000).optional(),
  amenities: z.array(z.string()).optional(),
});

export const updateUnitSchema = createUnitSchema.partial();

export const unitListQuerySchema = paginationSchema.extend({
  status: z.enum(["VACANT", "OCCUPIED", "MAINTENANCE", "LISTED"]).optional(),
});

export const unitParamsSchema = z.object({
  propertyId: z.string().uuid(),
});

export const unitIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type UnitListQuery = z.infer<typeof unitListQuerySchema>;
