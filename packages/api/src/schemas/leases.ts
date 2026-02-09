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

// Browser-side metadata collected during signing
// Fields use .nullable() because the frontend initializes timestamps as
// string | null and JSON.stringify preserves null (Zod .optional() only
// accepts undefined, not null).
const signingMetadataSchema = z.object({
  screenResolution: z.string().max(50).nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  browserLanguage: z.string().max(50).nullable().optional(),
  platform: z.string().max(100).nullable().optional(),
  pageOpenedAt: z.string().max(50).nullable().optional(),
  documentViewedAt: z.string().max(50).nullable().optional(),
  scrolledToBottomAt: z.string().max(50).nullable().optional(),
  consent1CheckedAt: z.string().max(50).nullable().optional(),
  consent2CheckedAt: z.string().max(50).nullable().optional(),
  consent3CheckedAt: z.string().max(50).nullable().optional(),
  nameTypedAt: z.string().max(50).nullable().optional(),
  signedAt: z.string().max(50).nullable().optional(),
  totalViewTimeSeconds: z.number().min(0).nullable().optional(),
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
  agreedToIdentity: z.literal(true, {
    errorMap: () => ({ message: "You must confirm your identity" }),
  }),
  signatureImage: z.string().max(100000).optional(),
  signingMetadata: signingMetadataSchema.optional(),
});

export const signingTokenParamSchema = z.object({
  token: z.string().uuid(),
});

// Landlord countersign
export const countersignLeaseSchema = z.object({
  fullName: z.string().min(1).max(200),
  signatureImage: z.string().max(100000).optional(),
  agreedToTerms: z.literal(true).optional(),
  agreedToEsign: z.literal(true).optional(),
  agreedToIdentity: z.literal(true).optional(),
  signingMetadata: signingMetadataSchema.optional(),
});

// E-signature for addendums (token-based, no auth — no identity confirmation)
export const tokenSignAddendumSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the addendum terms" }),
  }),
  agreedToEsign: z.literal(true, {
    errorMap: () => ({ message: "You must agree to use electronic signatures" }),
  }),
  signatureImage: z.string().max(100000).optional(),
  signingMetadata: signingMetadataSchema.optional(),
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

// Upload lease
export const uploadLeaseSchema = z.object({
  unitId: z.string().uuid(),
  tenantIds: z.string().transform((s) => JSON.parse(s) as string[]),
  primaryTenantId: z.string().uuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  monthlyRent: z.coerce.number().positive(),
  securityDeposit: z.coerce.number().min(0),
  lateFeeAmount: z.coerce.number().min(0).optional(),
  lateFeeType: z.enum(["FLAT", "PERCENTAGE"]).default("FLAT"),
  gracePeriodDays: z.coerce.number().int().min(0).default(5),
  rentDueDay: z.coerce.number().int().min(1).max(28).default(1),
  monthToMonth: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

// Upload addendum
export const uploadAddendumSchema = z.object({
  title: z.string().min(1).max(200),
  effectiveDate: z.coerce.date(),
  description: z.string().max(50000).optional(),
});

// Addendum signing token param
export const addendumSigningTokenParamSchema = z.object({
  token: z.string().uuid(),
});

// Addendum send for signature
export const addendumSendParamSchema = z.object({
  id: z.string().uuid(),
  addendumId: z.string().uuid(),
});

export type UploadLeaseInput = z.infer<typeof uploadLeaseSchema>;
export type UploadAddendumInput = z.infer<typeof uploadAddendumSchema>;

// Update addendum (edit draft)
export const updateAddendumSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(50000).optional(),
  effectiveDate: z.coerce.date().optional().nullable(),
});

// Countersign addendum
export const countersignAddendumSchema = z.object({
  fullName: z.string().min(1).max(200),
  signatureImage: z.string().max(100000).optional(),
  agreedToTerms: z.literal(true).optional(),
  agreedToEsign: z.literal(true).optional(),
  signingMetadata: z.object({
    screenResolution: z.string().max(50).nullable().optional(),
    timezone: z.string().max(100).nullable().optional(),
    browserLanguage: z.string().max(50).nullable().optional(),
    platform: z.string().max(100).nullable().optional(),
    pageOpenedAt: z.string().max(50).nullable().optional(),
    consent1CheckedAt: z.string().max(50).nullable().optional(),
    consent2CheckedAt: z.string().max(50).nullable().optional(),
    nameTypedAt: z.string().max(50).nullable().optional(),
    signedAt: z.string().max(50).nullable().optional(),
    totalViewTimeSeconds: z.number().min(0).nullable().optional(),
  }).optional(),
});

export type CreateLeaseInput = z.infer<typeof createLeaseSchema>;
export type UpdateLeaseInput = z.infer<typeof updateLeaseSchema>;
export type LeaseListQuery = z.infer<typeof leaseListQuerySchema>;
export type SignLeaseInput = z.infer<typeof signLeaseSchema>;
export type CreateAddendumInput = z.infer<typeof createAddendumSchema>;
export type UpdateAddendumInput = z.infer<typeof updateAddendumSchema>;
