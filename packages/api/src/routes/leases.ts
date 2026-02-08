import { Router } from "express";
import { createHash, randomUUID } from "crypto";
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
  countersignLeaseSchema,
  tokenSignLeaseSchema,
  signingTokenParamSchema,
} from "../schemas/leases.js";
import type {
  CreateLeaseInput,
  UpdateLeaseInput,
  LeaseListQuery,
  SignLeaseInput,
  CreateAddendumInput,
} from "../schemas/leases.js";
import {
  generateLeaseHTML,
  saveLeaseDocument,
  DEFAULT_CLAUSES,
} from "../services/leaseDocument.js";
import {
  sendEmail,
  buildSignatureRequestEmail,
  buildLeaseSignedConfirmationEmail,
} from "../services/email.js";
import { env } from "../config/env.js";

const router = Router();

// ─── Public route: token-based signing (NO auth required) ──────────
// This must be defined BEFORE the auth middleware
router.get(
  "/sign/:token",
  validate({ params: signingTokenParamSchema }),
  asyncHandler(async (req, res) => {
    const token = param(req, "token");

    const leaseTenant = await prisma.leaseTenant.findFirst({
      where: { signingToken: token },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        lease: {
          include: {
            organization: { select: { id: true, name: true } },
            unit: {
              select: {
                id: true,
                unitNumber: true,
                bedrooms: true,
                bathrooms: true,
                sqFt: true,
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
                  select: { id: true, firstName: true, lastName: true, email: true },
                },
              },
            },
          },
        },
      },
    });

    if (!leaseTenant) {
      throw new NotFoundError("Signing token");
    }

    if (leaseTenant.tokenExpiresAt && leaseTenant.tokenExpiresAt < new Date()) {
      throw new ValidationError("This signing link has expired");
    }

    if (leaseTenant.signedAt) {
      throw new ValidationError("You have already signed this lease");
    }

    if (leaseTenant.lease.status !== "PENDING_SIGNATURE") {
      throw new ValidationError("This lease is no longer available for signing");
    }

    // Return lease data for the signing page
    const lease = leaseTenant.lease;
    res.json({
      tenant: leaseTenant.tenant,
      lease: {
        id: lease.id,
        startDate: lease.startDate,
        endDate: lease.endDate,
        monthlyRent: lease.monthlyRent,
        securityDeposit: lease.securityDeposit,
        lateFeeAmount: lease.lateFeeAmount,
        lateFeeType: lease.lateFeeType,
        gracePeriodDays: lease.gracePeriodDays,
        rentDueDay: lease.rentDueDay,
        terms: lease.terms,
        documentUrl: lease.documentUrl,
        documentHash: lease.documentHash,
        status: lease.status,
      },
      unit: lease.unit,
      organization: lease.organization,
      tenants: lease.tenants.map((lt) => ({
        firstName: lt.tenant.firstName,
        lastName: lt.tenant.lastName,
        isPrimary: lt.isPrimary,
        signed: !!lt.signedAt,
      })),
    });
  })
);

router.post(
  "/sign/:token",
  validate({ params: signingTokenParamSchema, body: tokenSignLeaseSchema }),
  asyncHandler(async (req, res) => {
    const token = param(req, "token");
    const body = req.body as { fullName: string; email: string; agreedToTerms: true; agreedToEsign: true };

    const leaseTenant = await prisma.leaseTenant.findFirst({
      where: { signingToken: token },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        lease: {
          include: {
            unit: {
              select: {
                id: true,
                unitNumber: true,
                property: {
                  select: { name: true, address: true, city: true, state: true, zip: true },
                },
              },
            },
            tenants: {
              include: {
                tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
            organization: { select: { name: true } },
          },
        },
      },
    });

    if (!leaseTenant) {
      throw new NotFoundError("Signing token");
    }

    if (leaseTenant.tokenExpiresAt && leaseTenant.tokenExpiresAt < new Date()) {
      throw new ValidationError("This signing link has expired");
    }

    if (leaseTenant.signedAt) {
      throw new ValidationError("You have already signed this lease");
    }

    const lease = leaseTenant.lease;
    if (lease.status !== "PENDING_SIGNATURE") {
      throw new ValidationError("This lease is no longer available for signing");
    }

    // Build signature data
    const now = new Date();
    const signatureHash = createHash("sha256")
      .update(
        JSON.stringify({
          leaseId: lease.id,
          tenantId: leaseTenant.tenantId,
          fullName: body.fullName,
          email: body.email,
          documentHash: lease.documentHash ?? "",
          timestamp: now.toISOString(),
        })
      )
      .digest("hex");

    const signatureData = {
      fullName: body.fullName,
      email: body.email,
      ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
      userAgent: req.headers["user-agent"] ?? "unknown",
      documentHash: lease.documentHash ?? "",
      hash: signatureHash,
      timestamp: now.toISOString(),
    };

    // Update the lease-tenant with signature, clear the token
    await prisma.leaseTenant.update({
      where: { id: leaseTenant.id },
      data: {
        signedAt: now,
        signatureData,
        signingToken: null,
        tokenExpiresAt: null,
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

        await tx.unit.update({
          where: { id: lease.unitId },
          data: { status: "OCCUPIED" },
        });

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

    // Send confirmation emails
    const unit = lease.unit;
    const propertyAddress = `${unit.property.address}, ${unit.property.city}, ${unit.property.state}`;
    for (const lt of lease.tenants) {
      const confirmEmail = buildLeaseSignedConfirmationEmail({
        recipientName: `${lt.tenant.firstName} ${lt.tenant.lastName}`,
        propertyAddress,
        unitNumber: unit.unitNumber,
        allSigned: unsignedCount === 0,
      });
      sendEmail({
        to: lt.tenant.email,
        ...confirmEmail,
      }).catch(() => {});
    }

    // Create audit log entry (no auth user for token-based, use tenant info)
    prisma.auditLog
      .create({
        data: {
          organizationId: lease.organizationId,
          userId: leaseTenant.tenantId, // Best effort - use tenant ID
          action: "SIGN",
          entityType: "Lease",
          entityId: lease.id,
          changes: { fullName: body.fullName, email: body.email },
          ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
        },
      })
      .catch(() => {});

    res.json({
      message:
        leaseStatus === "ACTIVE"
          ? "Lease fully signed and activated"
          : "Signature recorded successfully",
      leaseStatus,
      signedAt: signatureData.timestamp,
      allSigned: unsignedCount === 0,
      remainingSignatures: unsignedCount,
      documentUrl: lease.documentUrl,
    });
  })
);

// All remaining lease routes require auth + tenancy
router.use(authenticate, tenancy);

// ─── GET /leases/default-clauses ──────────────────────────────────
router.get(
  "/default-clauses",
  asyncHandler(async (_req, res) => {
    res.json({ data: DEFAULT_CLAUSES });
  })
);

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
          rentDueDay: body.rentDueDay ?? 1,
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
        organization: { select: { id: true, name: true } },
        unit: {
          select: {
            id: true,
            unitNumber: true,
            bedrooms: true,
            bathrooms: true,
            sqFt: true,
            rent: true,
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

    // Also fetch audit logs for timeline
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        entityType: "Lease",
        entityId: lease.id,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        changes: true,
        ipAddress: true,
        createdAt: true,
        user: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    res.json({ ...lease, auditLogs });
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
        organization: { select: { name: true } },
        unit: {
          select: {
            id: true,
            unitNumber: true,
            bedrooms: true,
            bathrooms: true,
            sqFt: true,
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
              select: { id: true, firstName: true, lastName: true, email: true, phone: true },
            },
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

    // Generate lease document
    const clauses = (lease.terms as { clauses?: any[] } | null)?.clauses ?? [];
    const html = generateLeaseHTML({
      leaseId: lease.id,
      organizationName: lease.organization.name,
      property: {
        name: lease.unit.property.name,
        address: lease.unit.property.address,
        city: lease.unit.property.city,
        state: lease.unit.property.state,
        zip: lease.unit.property.zip,
      },
      unit: {
        unitNumber: lease.unit.unitNumber,
        bedrooms: lease.unit.bedrooms,
        bathrooms: Number(lease.unit.bathrooms),
        sqFt: lease.unit.sqFt,
      },
      tenants: lease.tenants.map((lt) => ({
        id: lt.tenant.id,
        firstName: lt.tenant.firstName,
        lastName: lt.tenant.lastName,
        email: lt.tenant.email,
        phone: lt.tenant.phone,
        isPrimary: lt.isPrimary,
      })),
      startDate: lease.startDate.toISOString(),
      endDate: lease.endDate.toISOString(),
      monthlyRent: Number(lease.monthlyRent),
      securityDeposit: Number(lease.securityDeposit),
      lateFeeAmount: lease.lateFeeAmount ? Number(lease.lateFeeAmount) : null,
      lateFeeType: lease.lateFeeType,
      gracePeriodDays: lease.gracePeriodDays,
      rentDueDay: lease.rentDueDay,
      clauses,
    });

    const { url: documentUrl, hash: documentHash } = saveLeaseDocument(html, lease.id);

    // Generate signing tokens for each tenant
    const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const signingTokens: { tenantId: string; token: string; email: string; name: string }[] = [];

    for (const lt of lease.tenants) {
      const token = randomUUID();
      await prisma.leaseTenant.update({
        where: { id: lt.id },
        data: {
          signingToken: token,
          tokenExpiresAt: tokenExpiry,
        },
      });
      signingTokens.push({
        tenantId: lt.tenant.id,
        token,
        email: lt.tenant.email,
        name: `${lt.tenant.firstName} ${lt.tenant.lastName}`,
      });
    }

    // Update lease status and document
    const updated = await prisma.lease.update({
      where: { id: lease.id },
      data: {
        status: "PENDING_SIGNATURE",
        documentUrl,
        documentHash,
      },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            property: { select: { id: true, name: true, address: true } },
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

    // Send emails to each tenant
    const propertyAddress = `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state}`;
    for (const st of signingTokens) {
      const signingUrl = `${env.PORTAL_URL}/sign/${st.token}`;
      const emailContent = buildSignatureRequestEmail({
        tenantName: st.name,
        propertyAddress,
        unitNumber: lease.unit.unitNumber,
        signingUrl,
        landlordName: lease.organization.name,
      });
      sendEmail({
        to: st.email,
        ...emailContent,
      }).catch(() => {});
    }

    res.json({
      ...updated,
      message: "Lease sent for signature",
      documentUrl,
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
// E-signature endpoint — authenticated tenant signs their portion
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
          documentHash: lease.documentHash ?? "",
          timestamp: new Date().toISOString(),
        })
      )
      .digest("hex");

    const signatureData = {
      fullName: body.fullName,
      email: body.email,
      ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
      userAgent: req.headers["user-agent"] ?? "unknown",
      documentHash: lease.documentHash ?? "",
      hash: signatureHash,
      timestamp: new Date().toISOString(),
    };

    // Update the lease-tenant with signature
    await prisma.leaseTenant.update({
      where: { id: leaseTenant.id },
      data: {
        signedAt: new Date(),
        signatureData,
        signingToken: null,
        tokenExpiresAt: null,
      },
    });

    // Check if all tenants have now signed
    const unsignedCount = lease.tenants.filter(
      (lt) => lt.id !== leaseTenant.id && !lt.signedAt
    ).length;

    let leaseStatus: string = lease.status;
    if (unsignedCount === 0) {
      await prisma.$transaction(async (tx) => {
        await tx.lease.update({
          where: { id: lease.id },
          data: { status: "ACTIVE" },
        });

        await tx.unit.update({
          where: { id: lease.unitId },
          data: { status: "OCCUPIED" },
        });

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

// ─── POST /leases/:id/countersign ──────────────────────────────────
// Landlord countersigns after all tenants have signed
router.post(
  "/:id/countersign",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: leaseIdParamSchema, body: countersignLeaseSchema }),
  auditLog("COUNTERSIGN", "Lease"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as { fullName: string };

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        tenants: true,
        organization: { select: { name: true } },
        unit: {
          select: {
            unitNumber: true,
            property: {
              select: { address: true, city: true, state: true, zip: true },
            },
          },
        },
      },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    if (lease.status !== "ACTIVE") {
      throw new ValidationError("Lease must be ACTIVE to countersign");
    }

    if (lease.landlordSignedAt) {
      throw new ValidationError("Landlord has already countersigned this lease");
    }

    const now = new Date();
    const landlordSignatureData = {
      fullName: body.fullName,
      ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
      userAgent: req.headers["user-agent"] ?? "unknown",
      documentHash: lease.documentHash ?? "",
      timestamp: now.toISOString(),
    };

    await prisma.lease.update({
      where: { id: lease.id },
      data: {
        landlordSignedAt: now,
        landlordSignatureData: landlordSignatureData as unknown as Prisma.InputJsonValue,
      },
    });

    res.json({
      message: "Lease countersigned successfully",
      landlordSignedAt: now.toISOString(),
    });
  })
);

// ─── POST /leases/:id/resend ────────────────────────────────────────
// Resend signing emails for pending signature leases
router.post(
  "/:id/resend",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: leaseIdParamSchema }),
  auditLog("RESEND_SIGNATURE", "Lease"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        organization: { select: { name: true } },
        unit: {
          select: {
            unitNumber: true,
            property: {
              select: { address: true, city: true, state: true, zip: true },
            },
          },
        },
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

    if (lease.status !== "PENDING_SIGNATURE") {
      throw new ValidationError("Can only resend for PENDING_SIGNATURE leases");
    }

    const unsignedTenants = lease.tenants.filter((lt) => !lt.signedAt);
    const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const propertyAddress = `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state}`;

    for (const lt of unsignedTenants) {
      const token = randomUUID();
      await prisma.leaseTenant.update({
        where: { id: lt.id },
        data: { signingToken: token, tokenExpiresAt: tokenExpiry },
      });

      const signingUrl = `${env.PORTAL_URL}/sign/${token}`;
      const emailContent = buildSignatureRequestEmail({
        tenantName: `${lt.tenant.firstName} ${lt.tenant.lastName}`,
        propertyAddress,
        unitNumber: lease.unit.unitNumber,
        signingUrl,
        landlordName: lease.organization.name,
      });
      sendEmail({ to: lt.tenant.email, ...emailContent }).catch(() => {});
    }

    res.json({
      message: `Signing emails resent to ${unsignedTenants.length} tenant(s)`,
      resentTo: unsignedTenants.map((lt) => lt.tenant.email),
    });
  })
);

// ─── DELETE /leases/:id ─────────────────────────────────────────────
router.delete(
  "/:id",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: leaseIdParamSchema }),
  auditLog("DELETE", "Lease"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    if (lease.status !== "DRAFT") {
      throw new ValidationError("Only DRAFT leases can be deleted");
    }

    await prisma.lease.delete({ where: { id: lease.id } });

    res.json({ message: "Lease deleted successfully" });
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

      await tx.unit.update({
        where: { id: lease.unitId },
        data: { status: "VACANT" },
      });

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
