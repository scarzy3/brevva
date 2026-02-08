import { z } from "zod";
import { paginationSchema } from "../lib/pagination.js";

export const createVendorSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(20).optional(),
  specialty: z.string().max(100).optional(),
  serviceArea: z.string().max(200).optional(),
  insuranceExpiry: z.coerce.date().optional(),
  notes: z.string().max(5000).optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

export const vendorListQuerySchema = paginationSchema.extend({
  specialty: z.string().optional(),
  search: z.string().optional(),
});

export const vendorIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type VendorListQuery = z.infer<typeof vendorListQuerySchema>;
