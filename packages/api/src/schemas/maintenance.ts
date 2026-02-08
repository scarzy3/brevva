import { z } from "zod";
import { paginationSchema } from "../lib/pagination.js";

export const createMaintenanceRequestSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  priority: z
    .enum(["EMERGENCY", "URGENT", "ROUTINE", "COSMETIC"])
    .default("ROUTINE"),
  category: z.string().max(100).optional(),
});

export const updateMaintenanceRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  priority: z.enum(["EMERGENCY", "URGENT", "ROUTINE", "COSMETIC"]).optional(),
  status: z
    .enum([
      "SUBMITTED",
      "ACKNOWLEDGED",
      "SCHEDULED",
      "IN_PROGRESS",
      "COMPLETED",
      "CLOSED",
    ])
    .optional(),
  category: z.string().max(100).optional(),
  scheduledDate: z.coerce.date().optional(),
  completedDate: z.coerce.date().optional(),
  cost: z.coerce.number().min(0).optional(),
  vendorId: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).optional(),
});

export const maintenanceListQuerySchema = paginationSchema.extend({
  status: z
    .enum([
      "SUBMITTED",
      "ACKNOWLEDGED",
      "SCHEDULED",
      "IN_PROGRESS",
      "COMPLETED",
      "CLOSED",
    ])
    .optional(),
  priority: z.enum(["EMERGENCY", "URGENT", "ROUTINE", "COSMETIC"]).optional(),
  propertyId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
});

export const maintenanceIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateMaintenanceRequestInput = z.infer<typeof createMaintenanceRequestSchema>;
export type UpdateMaintenanceRequestInput = z.infer<typeof updateMaintenanceRequestSchema>;
export type MaintenanceListQuery = z.infer<typeof maintenanceListQuerySchema>;
