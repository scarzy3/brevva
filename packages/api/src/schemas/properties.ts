import { z } from "zod";
import { paginationSchema } from "../lib/pagination.js";

export const createPropertySchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2),
  zip: z.string().min(5).max(10),
  type: z.enum([
    "SINGLE_FAMILY",
    "MULTI_FAMILY",
    "CONDO",
    "TOWNHOUSE",
    "COMMERCIAL",
  ]),
  purchasePrice: z.coerce.number().positive().optional(),
  purchaseDate: z.coerce.date().optional(),
  mortgageBalance: z.coerce.number().min(0).optional(),
  insuranceProvider: z.string().max(200).optional(),
  insurancePolicyNumber: z.string().max(100).optional(),
  insuranceExpiry: z.coerce.date().optional(),
  notes: z.string().max(5000).optional(),
});

export const updatePropertySchema = createPropertySchema.partial();

export const propertyListQuerySchema = paginationSchema.extend({
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  type: z
    .enum([
      "SINGLE_FAMILY",
      "MULTI_FAMILY",
      "CONDO",
      "TOWNHOUSE",
      "COMMERCIAL",
    ])
    .optional(),
  search: z.string().optional(),
});

export const propertyIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
export type PropertyListQuery = z.infer<typeof propertyListQuerySchema>;
