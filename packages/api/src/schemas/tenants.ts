import { z } from "zod";
import { paginationSchema } from "../lib/pagination.js";

export const createTenantSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(254),
  phone: z.string().max(20).optional(),
  dateOfBirth: z.coerce.date().optional(),
  ssn: z.string().max(11).optional(),
  currentUnitId: z.string().uuid().optional(),
  status: z
    .enum(["PROSPECT", "APPLICANT", "ACTIVE", "FORMER", "EVICTED"])
    .optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  employerName: z.string().max(200).optional(),
  monthlyIncome: z.coerce.number().min(0).optional(),
  moveInDate: z.coerce.date().optional(),
  moveOutDate: z.coerce.date().optional(),
  notes: z.string().max(5000).optional(),
});

export const updateTenantSchema = createTenantSchema.partial();

export const tenantListQuerySchema = paginationSchema.extend({
  status: z
    .enum(["PROSPECT", "APPLICANT", "ACTIVE", "FORMER", "EVICTED"])
    .optional(),
  search: z.string().optional(),
  unitId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
});

export const tenantIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const tenantDocumentIdParamSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
});

// Vehicles
export const createVehicleSchema = z.object({
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.coerce.number().int().min(1900).max(2100),
  color: z.string().min(1).max(50),
  licensePlate: z.string().min(1).max(20),
  state: z.string().min(2).max(2),
});

// Pets
export const createPetSchema = z.object({
  type: z.string().min(1).max(50),
  breed: z.string().max(100).optional(),
  name: z.string().min(1).max(100),
  weight: z.coerce.number().min(0).optional(),
  vaccinated: z.boolean().default(false),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type TenantListQuery = z.infer<typeof tenantListQuerySchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type CreatePetInput = z.infer<typeof createPetSchema>;
