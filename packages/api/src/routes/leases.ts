import { Router } from "express";
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/async-handler.js";
import {
  NotFoundError,
  ValidationError,
  AuthorizationError,
} from "../lib/errors.js";
import { getPaginationMeta } from "../lib/pagination.js";
import { param } from "../lib/params.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { tenancy } from "../middleware/tenancy.js";
import { requireMinRole } from "../middleware/rbac.js";
import { auditLog } from "../middleware/audit.js";
import {
  createLeaseSchema,
  updateLeaseSchema,
  leaseListQuerySchema,
  leaseIdParamSchema,
  signLeaseSchema,
  createAddendumSchema,
  addendumIdParamSchema,
} from "../schemas/leases.js";
import type {
  CreateLeaseInput,
  UpdateLeaseInput,
  LeaseListQuery,
  SignLeaseInput,
  CreateAddendumInput,
} from "../schemas/leases.js";

const router = Router();

// All lease routes require auth + tenancy
router.use(authenticate, tenancy);

// ─── GET /leases ────────────────────────────────────────────────────
router.get(
  "/",
  validate({ query: leaseListQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const query = req.query as unknown as LeaseListQuery;
    const { page, limit, sortBy, sortOrder, status, unitId, tenantId, propertyId } =
      query;

    const where: Record<string, unknown> = {
      organizationId: orgId,
      ...(status ? { status } : {}),
      ...(unitId ? { unitId } : {}),
    };

    if (tenantId) {
      where["tenants"] = { some: { tenantId } };
    }

    if (propertyId) {
      where["unit"] = { propertyId };
    }

    const orderBy = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: sortOrder };

    const [leases, total] = await Promise.all([
      prisma.lease.findMany({
        where,
        include: {
          unit: {
            select: {
              id: true,
              unitNumber: true,
              property: {
                select: { id: true, name: true, address: true },
              },
            },
          },
          tenants: {
            include: {
              tenant: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
          _count: {
            select: { payments: true, addendums: true, lateFees: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.lease.count({ where }),
    ]);

    res.json({
      data: leases,
      pagination: getPaginationMeta(total, page, limit),
    });
  })
);

// ─── POST /leases ───────────────────────────────────────────────────
router.post(
  "/",
  requireMinRole("TEAM_MEMBER"),
  validate({ body: createLeaseSchema }),
  auditLog("CREATE", "Lease"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreateLeaseInput;

    // Validate unit belongs to org
    const unit = await prisma.unit.findFirst({
      where: { id: body.unitId, organizationId: orgId },
    });
    if (!unit) {
      throw new NotFoundError("Unit", body.unitId);
    }

    // Check no active lease on this unit
    const activeLease = await prisma.lease.findFirst({
      where: {
        unitId: body.unitId,
        status: { in: ["ACTIVE", "PENDING_SIGNATURE"] },
      },
    });
    if (activeLease) {
      throw new ValidationError(
        "This unit already has an active or pending lease"
      );
    }

    // Validate all tenants belong to org
    if (!body.tenantIds.includes(body.primaryTenantId)) {
      throw new ValidationError(
        "primaryTenantId must be included in tenantIds"
      );
    }

    const tenants = await prisma.tenant.findMany({
      where: { id: { in: body.tenantIds }, organizationId: orgId },
    });
    if (tenants.length !== body.tenantIds.length) {
      throw new ValidationError(
        "One or more tenant IDs are invalid or do not belong to this organization"
      );
    }

    // Validate dates
    if (body.endDate <= body.startDate) {
      throw new ValidationError("End date must be after start date");
    }

    const lease = await prisma.$transaction(async (tx) => {
      const created = await tx.lease.create({
        data: {
          organizationId: orgId,
          unitId: body.unitId,
          startDate: body.startDate,
          endDate: body.endDate,
          monthlyRent: body.monthlyRent,
          securityDeposit: body.securityDeposit,
          lateFeeAmount: body.lateFeeAmount,
          lateFeeType: body.lateFeeType,
          gracePeriodDays: body.gracePeriodDays,
          terms: (body.terms ?? {}) as Prisma.InputJsonValue,
          status: "DRAFT",
        },
      });

      // Create lease-tenant associations
      await tx.leaseTenant.createMany({
        data: body.tenantIds.map((tenantId) => ({
          leaseId: created.id,
          tenantId,
          isPrimary: tenantId === body.primaryTenantId,
        })),
      });

      return tx.lease.findUnique({
        where: { id: created.id },
        include: {
          unit: {
            select: {
              id: true,
              unitNumber: true,
              property: { select: { id: true, name: true } },
            },
          },
          tenants: {
            include: {
              tenant: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });
    });

    res.status(201).json(lease);
  })
);

// ─── GET /leases/:id ───────────────────────────────────────────────
router.get(
  "/:id",
  validate({ params: leaseIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const lease = await prisma.lease.findFirst({
      where: {
        id: param(req, "id"),
        organizationId: orgId,
      },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
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
          },
        },
        tenants: {
          include: {
            tenant: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                status: true,
              },
            },
          },
        },
        addendums: {
          orderBy: { createdAt: "desc" },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            amount: true,
            status: true,
            method: true,
            paidAt: true,
            createdAt: true,
          },
        },
        lateFees: {
          orderBy: { assessedDate: "desc" },
        },
      },
    });

    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    res.json(lease);
  })
);

// ─── PATCH /leases/:id ─────────────────────────────────────────────
router.patch(
  "/:id",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: leaseIdParamSchema, body: updateLeaseSchema }),
  auditLog("UPDATE", "Lease"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as UpdateLeaseInput;

    const existing = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    if (existing.status === "TERMINATED" || existing.status === "EXPIRED") {
      throw new ValidationError(
        "Cannot modify a terminated or expired lease"
      );
    }

    const { terms, ...rest } = body;
    const data: Prisma.LeaseUpdateInput = {
      ...rest,
      ...(terms !== undefined ? { terms: terms as Prisma.InputJsonValue } : {}),
    };

    const lease = await prisma.lease.update({
      where: { id: param(req, "id") },
      data,
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            property: { select: { id: true, name: true } },
          },
        },
        tenants: {
          include: {
            tenant: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.json(lease);
  })
);

// ─── POST /leases/:id/send-for-signature ───────────────────────────
// Transitions a DRAFT lease to PENDING_SIGNATURE
router.post(
  "/:id/send-for-signature",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: leaseIdParamSchema }),
  auditLog("SEND_FOR_SIGNATURE", "Lease"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        tenants: {
          include: {
            tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    if (lease.status !== "DRAFT") {
      throw new ValidationError(
        `Lease must be in DRAFT status to send for signature (currently ${lease.status})`
      );
    }

    if (lease.tenants.length === 0) {
      throw new ValidationError("Lease must have at least one tenant");
    }

    const updated = await prisma.lease.update({
      where: { id: param(req, "id") },
      data: { status: "PENDING_SIGNATURE" },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            property: { select: { id: true, name: true } },
          },
        },
        tenants: {
          include: {
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    // TODO: Send email notifications to tenants with signature link

    res.json({
      ...updated,
      message: "Lease sent for signature",
      pendingSignatures: updated.tenants
        .filter((lt) => !lt.signedAt)
        .map((lt) => ({
          tenantId: lt.tenant.id,
          name: `${lt.tenant.firstName} ${lt.tenant.lastName}`,
          email: lt.tenant.email,
        })),
    });
  })
);

// ─── POST /leases/:id/sign ─────────────────────────────────────────
// E-signature endpoint — tenant signs their portion of the lease
router.post(
  "/:id/sign",
  validate({ params: leaseIdParamSchema, body: signLeaseSchema }),
  auditLog("SIGN", "Lease"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const userId = req.user!.userId;
    const body = req.body as SignLeaseInput;

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        tenants: {
          include: {
            tenant: { select: { id: true, userId: true, email: true } },
          },
        },
      },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    if (lease.status !== "PENDING_SIGNATURE") {
      throw new ValidationError(
        "Lease must be in PENDING_SIGNATURE status to sign"
      );
    }

    // Find the lease-tenant record for the current user
    const leaseTenant = lease.tenants.find(
      (lt) => lt.tenant.userId === userId
    );
    if (!leaseTenant) {
      throw new AuthorizationError(
        "You are not listed as a tenant on this lease"
      );
    }

    if (leaseTenant.signedAt) {
      throw new ValidationError("You have already signed this lease");
    }

    // Build signature data
    const signatureHash = createHash("sha256")
      .update(
        JSON.stringify({
          leaseId: lease.id,
          tenantId: leaseTenant.tenantId,
          fullName: body.fullName,
          email: body.email,
          timestamp: new Date().toISOString(),
        })
      )
      .digest("hex");

    const signatureData = {
      fullName: body.fullName,
      email: body.email,
      ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
      userAgent: req.headers["user-agent"] ?? "unknown",
      hash: signatureHash,
      timestamp: new Date().toISOString(),
    };

    // Update the lease-tenant with signature
    await prisma.leaseTenant.update({
      where: { id: leaseTenant.id },
      data: {
        signedAt: new Date(),
        signatureData,
      },
    });

    // Check if all tenants have now signed
    const unsignedCount = lease.tenants.filter(
      (lt) => lt.id !== leaseTenant.id && !lt.signedAt
    ).length;

    let leaseStatus: string = lease.status;
    if (unsignedCount === 0) {
      // All tenants signed — activate the lease
      await prisma.$transaction(async (tx) => {
        await tx.lease.update({
          where: { id: lease.id },
          data: { status: "ACTIVE" },
        });

        // Update unit status to OCCUPIED
        await tx.unit.update({
          where: { id: lease.unitId },
          data: { status: "OCCUPIED" },
        });

        // Update all tenants on this lease to ACTIVE with current unit
        const tenantIds = lease.tenants.map((lt) => lt.tenantId);
        await tx.tenant.updateMany({
          where: { id: { in: tenantIds } },
          data: {
            status: "ACTIVE",
            currentUnitId: lease.unitId,
            moveInDate: lease.startDate,
          },
        });
      });
      leaseStatus = "ACTIVE";
    }

    res.json({
      message:
        leaseStatus === "ACTIVE"
          ? "Lease fully signed and activated"
          : "Signature recorded successfully",
      leaseStatus,
      signedAt: signatureData.timestamp,
      allSigned: unsignedCount === 0,
      remainingSignatures: unsignedCount,
    });
  })
);

// ─── POST /leases/:id/terminate ─────────────────────────────────────
router.post(
  "/:id/terminate",
  requireMinRole("OWNER"),
  validate({ params: leaseIdParamSchema }),
  auditLog("TERMINATE", "Lease"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        tenants: true,
      },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    if (lease.status !== "ACTIVE" && lease.status !== "PENDING_SIGNATURE") {
      throw new ValidationError(
        `Only ACTIVE or PENDING_SIGNATURE leases can be terminated (currently ${lease.status})`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.lease.update({
        where: { id: lease.id },
        data: { status: "TERMINATED" },
      });

      // Set unit back to VACANT
      await tx.unit.update({
        where: { id: lease.unitId },
        data: { status: "VACANT" },
      });

      // Update tenants — mark as FORMER, clear unit, set move-out date
      const tenantIds = lease.tenants.map((lt) => lt.tenantId);
      await tx.tenant.updateMany({
        where: { id: { in: tenantIds }, currentUnitId: lease.unitId },
        data: {
          status: "FORMER",
          currentUnitId: null,
          moveOutDate: new Date(),
        },
      });
    });

    res.json({ message: "Lease terminated successfully" });
  })
);

// ─── Addendums ──────────────────────────────────────────────────────

// GET /leases/:id/addendums
router.get(
  "/:id/addendums",
  validate({ params: leaseIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      select: { id: true },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    const addendums = await prisma.leaseAddendum.findMany({
      where: { leaseId: param(req, "id") },
      orderBy: { createdAt: "desc" },
    });

    res.json({ data: addendums });
  })
);

// POST /leases/:id/addendums
router.post(
  "/:id/addendums",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: leaseIdParamSchema, body: createAddendumSchema }),
  auditLog("CREATE", "LeaseAddendum"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreateAddendumInput;

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    if (lease.status === "TERMINATED" || lease.status === "EXPIRED") {
      throw new ValidationError(
        "Cannot add addendums to a terminated or expired lease"
      );
    }

    const addendum = await prisma.leaseAddendum.create({
      data: {
        leaseId: param(req, "id")!,
        title: body.title,
        content: body.content,
        status: "DRAFT",
      },
    });

    res.status(201).json(addendum);
  })
);

// DELETE /leases/:id/addendums/:addendumId
router.delete(
  "/:id/addendums/:addendumId",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: addendumIdParamSchema }),
  auditLog("DELETE", "LeaseAddendum"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      select: { id: true },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    const addendum = await prisma.leaseAddendum.findFirst({
      where: {
        id: param(req, "addendumId"),
        leaseId: param(req, "id"),
      },
    });
    if (!addendum) {
      throw new NotFoundError("Addendum", param(req, "addendumId"));
    }

    if (addendum.status === "ACTIVE") {
      throw new ValidationError("Cannot delete an active addendum");
    }

    await prisma.leaseAddendum.delete({
      where: { id: param(req, "addendumId") },
    });

    res.json({ message: "Addendum deleted successfully" });
  })
);

export default router;
