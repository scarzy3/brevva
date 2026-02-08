import { z } from "zod";
import { paginationSchema } from "../lib/pagination.js";

export const createLeaseSchema = z.object({
  unitId: z.string().uuid(),
  tenantIds: z.array(z.string().uuid()).min(1),
  primaryTenantId: z.string().uuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  monthlyRent: z.coerce.number().positive(),
  securityDeposit: z.coerce.number().min(0),
  lateFeeAmount: z.coerce.number().min(0).optional(),
  lateFeeType: z.enum(["FLAT", "PERCENTAGE"]).default("FLAT"),
  gracePeriodDays: z.coerce.number().int().min(0).default(5),
  terms: z.record(z.unknown()).optional(),
});

export const updateLeaseSchema = z.object({
  monthlyRent: z.coerce.number().positive().optional(),
  endDate: z.coerce.date().optional(),
  lateFeeAmount: z.coerce.number().min(0).optional(),
  lateFeeType: z.enum(["FLAT", "PERCENTAGE"]).optional(),
  gracePeriodDays: z.coerce.number().int().min(0).optional(),
  terms: z.record(z.unknown()).optional(),
});

export const leaseListQuerySchema = paginationSchema.extend({
  status: z
    .enum(["DRAFT", "PENDING_SIGNATURE", "ACTIVE", "EXPIRED", "TERMINATED"])
    .optional(),
  unitId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
});

export const leaseIdParamSchema = z.object({
  id: z.string().uuid(),
});

// E-signature
export const signLeaseSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the lease terms" }),
  }),
});

// Addendums
export const createAddendumSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
});

export const addendumIdParamSchema = z.object({
  id: z.string().uuid(),
  addendumId: z.string().uuid(),
});

export type CreateLeaseInput = z.infer<typeof createLeaseSchema>;
export type UpdateLeaseInput = z.infer<typeof updateLeaseSchema>;
export type LeaseListQuery = z.infer<typeof leaseListQuerySchema>;
export type SignLeaseInput = z.infer<typeof signLeaseSchema>;
export type CreateAddendumInput = z.infer<typeof createAddendumSchema>;
