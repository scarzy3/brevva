import { z } from "zod";
import { paginationSchema } from "../lib/pagination.js";

// ─── Payments ───────────────────────────────────────────────────────

export const createPaymentSchema = z.object({
  leaseId: z.string().uuid(),
  tenantId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  method: z.enum(["ACH", "CARD", "MANUAL"]),
  paymentMethodId: z.string().uuid().optional(),
});

export const recordManualPaymentSchema = z.object({
  leaseId: z.string().uuid(),
  tenantId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paidAt: z.coerce.date().optional(),
});

export const paymentListQuerySchema = paginationSchema.extend({
  status: z
    .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED"])
    .optional(),
  leaseId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  method: z.enum(["ACH", "CARD", "MANUAL"]).optional(),
});

export const paymentIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ─── Payment Methods ────────────────────────────────────────────────

export const savePaymentMethodSchema = z.object({
  tenantId: z.string().uuid(),
  type: z.enum(["BANK_ACCOUNT", "CARD"]),
  stripePaymentMethodId: z.string().min(1),
  last4: z.string().length(4),
  bankName: z.string().max(200).optional(),
  isDefault: z.boolean().default(false),
  isAutoPay: z.boolean().default(false),
});

export const paymentMethodIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ─── Late Fees ──────────────────────────────────────────────────────

export const assessLateFeeSchema = z.object({
  leaseId: z.string().uuid(),
  amount: z.coerce.number().positive().optional(),
});

export const lateFeeIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export type SavePaymentMethodInput = z.infer<typeof savePaymentMethodSchema>;
export type AssessLateFeeInput = z.infer<typeof assessLateFeeSchema>;
