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
  rentDueDay: z.coerce.number().int().min(1).max(28).default(1),
  terms: z.record(z.unknown()).optional(),
});

export const updateLeaseSchema = z.object({
  monthlyRent: z.coerce.number().positive().optional(),
  endDate: z.coerce.date().optional(),
  lateFeeAmount: z.coerce.number().min(0).optional(),
  lateFeeType: z.enum(["FLAT", "PERCENTAGE"]).optional(),
  gracePeriodDays: z.coerce.number().int().min(0).optional(),
  rentDueDay: z.coerce.number().int().min(1).max(28).optional(),
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

// E-signature (authenticated user)
export const signLeaseSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the lease terms" }),
  }),
  signatureImage: z.string().max(100000).optional(),
});

// E-signature (token-based, no auth)
export const tokenSignLeaseSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the lease terms" }),
  }),
  agreedToEsign: z.literal(true, {
    errorMap: () => ({ message: "You must agree to use electronic signatures" }),
  }),
  signatureImage: z.string().max(100000).optional(),
});

export const signingTokenParamSchema = z.object({
  token: z.string().uuid(),
});

// Landlord countersign
export const countersignLeaseSchema = z.object({
  fullName: z.string().min(1).max(200),
  signatureImage: z.string().max(100000).optional(),
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
