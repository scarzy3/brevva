import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/async-handler.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getPaginationMeta } from "../lib/pagination.js";
import { param } from "../lib/params.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { tenancy } from "../middleware/tenancy.js";
import { requireMinRole } from "../middleware/rbac.js";
import { auditLog } from "../middleware/audit.js";
import {
  createUnitSchema,
  updateUnitSchema,
  unitListQuerySchema,
  unitParamsSchema,
  unitIdParamSchema,
} from "../schemas/units.js";
import type {
  CreateUnitInput,
  UpdateUnitInput,
  UnitListQuery,
} from "../schemas/units.js";

// Nested routes: /properties/:propertyId/units
const nestedRouter = Router({ mergeParams: true });
nestedRouter.use(authenticate, tenancy);

// GET /properties/:propertyId/units
nestedRouter.get(
  "/",
  validate({ params: unitParamsSchema, query: unitListQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const propertyId = param(req, "propertyId");
    const query = req.query as unknown as UnitListQuery;
    const { page, limit, sortBy, sortOrder, status } = query;

    // Verify property belongs to organization
    const property = await prisma.property.findFirst({
      where: { id: propertyId, organizationId: orgId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundError("Property", propertyId);
    }

    const where = {
      propertyId,
      organizationId: orgId,
      ...(status ? { status } : {}),
    };

    const orderBy = sortBy
      ? { [sortBy]: sortOrder }
      : { unitNumber: "asc" as const };

    const [units, total] = await Promise.all([
      prisma.unit.findMany({
        where,
        include: {
          currentTenants: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              status: true,
            },
          },
          leases: {
            where: { status: "ACTIVE" },
            take: 1,
            select: {
              id: true,
              monthlyRent: true,
              startDate: true,
              endDate: true,
              status: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.unit.count({ where }),
    ]);

    res.json({
      data: units,
      pagination: getPaginationMeta(total, page, limit),
    });
  })
);

// POST /properties/:propertyId/units
nestedRouter.post(
  "/",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: unitParamsSchema, body: createUnitSchema }),
  auditLog("CREATE", "Unit"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const propertyId = param(req, "propertyId");
    const body = req.body as CreateUnitInput;

    const property = await prisma.property.findFirst({
      where: { id: propertyId, organizationId: orgId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundError("Property", propertyId);
    }

    const unit = await prisma.unit.create({
      data: {
        propertyId,
        organizationId: orgId,
        unitNumber: body.unitNumber,
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        sqFt: body.sqFt,
        floor: body.floor,
        rent: body.rent,
        deposit: body.deposit,
        status: body.status ?? "VACANT",
        description: body.description,
        amenities: body.amenities ?? [],
      },
    });

    res.status(201).json(unit);
  })
);

// Standalone routes: /units/:id
const standaloneRouter = Router();
standaloneRouter.use(authenticate, tenancy);

// GET /units/:id
standaloneRouter.get(
  "/:id",
  validate({ params: unitIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const unit = await prisma.unit.findFirst({
      where: {
        id: param(req, "id"),
        organizationId: orgId,
      },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            zip: true,
          },
        },
        currentTenants: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            moveInDate: true,
          },
        },
        leases: {
          orderBy: { startDate: "desc" },
          include: {
            tenants: {
              include: {
                tenant: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        photos: {
          orderBy: { sortOrder: "asc" },
        },
        maintenanceRequests: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
          },
        },
      },
    });

    if (!unit) {
      throw new NotFoundError("Unit", param(req, "id"));
    }

    res.json(unit);
  })
);

// PATCH /units/:id
standaloneRouter.patch(
  "/:id",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: unitIdParamSchema, body: updateUnitSchema }),
  auditLog("UPDATE", "Unit"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as UpdateUnitInput;

    const existing = await prisma.unit.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("Unit", param(req, "id"));
    }

    const unit = await prisma.unit.update({
      where: { id: param(req, "id") },
      data: body,
      include: {
        property: {
          select: { id: true, name: true },
        },
      },
    });

    res.json(unit);
  })
);

// DELETE /units/:id (soft delete — set to maintenance/archived)
standaloneRouter.delete(
  "/:id",
  requireMinRole("OWNER"),
  validate({ params: unitIdParamSchema }),
  auditLog("DELETE", "Unit"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const existing = await prisma.unit.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        leases: { where: { status: "ACTIVE" }, take: 1 },
      },
    });
    if (!existing) {
      throw new NotFoundError("Unit", param(req, "id"));
    }

    if (existing.leases.length > 0) {
      throw new ValidationError(
        "Cannot delete a unit with an active lease. Terminate the lease first."
      );
    }

    await prisma.unit.delete({
      where: { id: param(req, "id") },
    });

    res.json({ message: "Unit deleted successfully" });
  })
);

export { nestedRouter as unitNestedRouter, standaloneRouter as unitStandaloneRouter };
