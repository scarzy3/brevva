import { z } from "zod";

export const reportQuerySchema = z.object({
  propertyId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const dashboardQuerySchema = z.object({
  propertyId: z.string().uuid().optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
