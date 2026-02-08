import { z } from "zod";
import { paginationSchema } from "../lib/pagination.js";

// ─── Transactions ───────────────────────────────────────────────────

export const createTransactionSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().min(1).max(100),
  subcategory: z.string().max(100).optional(),
  amount: z.coerce.number().positive(),
  date: z.coerce.date(),
  description: z.string().max(2000).optional(),
  receiptUrl: z.string().url().optional(),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const transactionListQuerySchema = paginationSchema.extend({
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  category: z.string().optional(),
  propertyId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const transactionIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ─── Recurring Templates ────────────────────────────────────────────

export const createRecurringTemplateSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().min(1).max(100),
  amount: z.coerce.number().positive(),
  description: z.string().max(2000).optional(),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL"]),
  nextDate: z.coerce.date(),
});

export const recurringTemplateIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ─── Expense Categories ─────────────────────────────────────────────

export const createExpenseCategorySchema = z.object({
  name: z.string().min(1).max(100),
  scheduleELine: z.string().max(50).optional(),
});

export const expenseCategoryIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ─── Schedule E Report ──────────────────────────────────────────────

export const scheduleEQuerySchema = z.object({
  propertyId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
export type CreateRecurringTemplateInput = z.infer<typeof createRecurringTemplateSchema>;
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type ScheduleEQuery = z.infer<typeof scheduleEQuerySchema>;
