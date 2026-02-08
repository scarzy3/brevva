import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
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
import { requireRole } from "../middleware/rbac.js";
import { auditLog } from "../middleware/audit.js";
import { createPaymentSchema, paymentListQuerySchema } from "../schemas/payments.js";
import type { CreatePaymentInput, PaymentListQuery } from "../schemas/payments.js";
import {
  createMaintenanceRequestSchema,
  maintenanceIdParamSchema,
} from "../schemas/maintenance.js";
import { paginationSchema } from "../lib/pagination.js";
import { createPaymentIntent } from "../lib/stripe.js";
import { env } from "../config/env.js";

const router = Router();

// All portal routes require TENANT role
router.use(authenticate, tenancy, requireRole("TENANT"));

// ─── Helper: get the current tenant record for this user ────────────
async function getTenantForUser(userId: string, orgId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { userId, organizationId: orgId },
  });
  if (!tenant) {
    throw new AuthorizationError("No tenant profile linked to your account");
  }
  return tenant;
}

// ─── Multer for maintenance photos ──────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `portal-maint-${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.mimetype)) {
      cb(new ValidationError("Only JPEG, PNG, WebP, and GIF images are allowed"));
      return;
    }
    cb(null, true);
  },
});

// ═══════════════════════════════════════════════════════════════════
// Dashboard — overview of tenant's current situation
// ═══════════════════════════════════════════════════════════════════

// GET /portal/dashboard
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const tenant = await getTenantForUser(req.user!.userId, orgId);

    const [activeLease, recentPayments, openMaintenance, unreadMessages] =
      await Promise.all([
        prisma.leaseTenant.findFirst({
          where: { tenantId: tenant.id, lease: { status: "ACTIVE" } },
          include: {
            lease: {
              include: {
                unit: {
                  select: {
                    id: true,
                    unitNumber: true,
                    property: {
                      select: { id: true, name: true, address: true, city: true, state: true, zip: true },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.payment.findMany({
          where: { tenantId: tenant.id, organizationId: orgId },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            amount: true,
            status: true,
            method: true,
            paidAt: true,
            createdAt: true,
          },
        }),
        prisma.maintenanceRequest.count({
          where: {
            tenantId: tenant.id,
            organizationId: orgId,
            status: { notIn: ["COMPLETED", "CLOSED"] },
          },
        }),
        prisma.message.count({
          where: {
            organizationId: orgId,
            recipientId: req.user!.userId,
            readAt: null,
          },
        }),
      ]);

    // Outstanding late fees
    const outstandingLateFees = activeLease
      ? await prisma.lateFee.findMany({
          where: {
            leaseId: activeLease.leaseId,
            waived: false,
            paidDate: null,
          },
          select: { id: true, amount: true, assessedDate: true },
        })
      : [];

    res.json({
      tenant: {
        id: tenant.id,
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        email: tenant.email,
        phone: tenant.phone,
        status: tenant.status,
      },
      lease: activeLease
        ? {
            id: activeLease.lease.id,
            startDate: activeLease.lease.startDate,
            endDate: activeLease.lease.endDate,
            monthlyRent: activeLease.lease.monthlyRent,
            status: activeLease.lease.status,
            unit: activeLease.lease.unit,
          }
        : null,
      recentPayments,
      openMaintenanceRequests: openMaintenance,
      unreadMessages,
      outstandingLateFees,
    });
  })
);

// ═══════════════════════════════════════════════════════════════════
// Lease — view current lease details
// ═══════════════════════════════════════════════════════════════════

// GET /portal/lease
router.get(
  "/lease",
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const tenant = await getTenantForUser(req.user!.userId, orgId);

    const leaseTenant = await prisma.leaseTenant.findFirst({
      where: {
        tenantId: tenant.id,
        lease: { status: { in: ["ACTIVE", "PENDING_SIGNATURE"] } },
      },
      include: {
        lease: {
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
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
            addendums: {
              where: { status: "ACTIVE" },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!leaseTenant) {
      res.json({ lease: null });
      return;
    }

    res.json({
      lease: leaseTenant.lease,
      signedAt: leaseTenant.signedAt,
      isPrimary: leaseTenant.isPrimary,
    });
  })
);

// ═══════════════════════════════════════════════════════════════════
// Payments — view and make payments
// ═══════════════════════════════════════════════════════════════════

// GET /portal/payments
router.get(
  "/payments",
  validate({ query: paymentListQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const tenant = await getTenantForUser(req.user!.userId, orgId);
    const query = req.query as unknown as PaymentListQuery;
    const { page, limit, sortOrder, status } = query;

    const where: Record<string, unknown> = {
      organizationId: orgId,
      tenantId: tenant.id,
      ...(status ? { status } : {}),
    };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          lease: {
            select: {
              id: true,
              unit: {
                select: {
                  id: true,
                  unitNumber: true,
                  property: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      data: payments,
      pagination: getPaginationMeta(total, page, limit),
    });
  })
);

// POST /portal/payments — Make a payment (ACH or card)
router.post(
  "/payments",
  validate({ body: createPaymentSchema }),
  auditLog("CREATE", "Payment"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const tenant = await getTenantForUser(req.user!.userId, orgId);
    const body = req.body as CreatePaymentInput;

    // Tenant can only pay for themselves
    if (body.tenantId !== tenant.id) {
      throw new AuthorizationError("You can only make payments for yourself");
    }

    // Validate lease
    const leaseTenant = await prisma.leaseTenant.findFirst({
      where: { leaseId: body.leaseId, tenantId: tenant.id },
      include: { lease: { select: { status: true } } },
    });
    if (!leaseTenant || leaseTenant.lease.status !== "ACTIVE") {
      throw new ValidationError("No active lease found");
    }

    if (body.method === "MANUAL") {
      throw new ValidationError("Tenants cannot record manual payments");
    }

    // Get payment method
    let stripePaymentMethodId: string | undefined;
    if (body.paymentMethodId) {
      const pm = await prisma.paymentMethodRecord.findFirst({
        where: { id: body.paymentMethodId, tenantId: tenant.id },
      });
      if (!pm) {
        throw new NotFoundError("PaymentMethod", body.paymentMethodId);
      }
      stripePaymentMethodId = pm.stripePaymentMethodId ?? undefined;
    }

    if (!stripePaymentMethodId) {
      throw new ValidationError("A valid payment method is required");
    }

    const intent = await createPaymentIntent({
      amount: body.amount,
      stripePaymentMethodId,
      metadata: {
        organizationId: orgId,
        leaseId: body.leaseId,
        tenantId: tenant.id,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        leaseId: body.leaseId,
        tenantId: tenant.id,
        amount: body.amount,
        method: body.method,
        status: intent.status === "succeeded" ? "COMPLETED" : "PROCESSING",
        stripePaymentIntentId: intent.id,
        paidAt: intent.status === "succeeded" ? new Date() : null,
      },
    });

    res.status(201).json({
      ...payment,
      stripeClientSecret: intent.client_secret,
    });
  })
);

// GET /portal/payment-methods
router.get(
  "/payment-methods",
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const tenant = await getTenantForUser(req.user!.userId, orgId);

    const methods = await prisma.paymentMethodRecord.findMany({
      where: { tenantId: tenant.id },
      orderBy: { isDefault: "desc" },
    });

    res.json({ data: methods });
  })
);

// ═══════════════════════════════════════════════════════════════════
// Maintenance — view and submit requests
// ═══════════════════════════════════════════════════════════════════

// GET /portal/maintenance
router.get(
  "/maintenance",
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const tenant = await getTenantForUser(req.user!.userId, orgId);
    const query = req.query as unknown as { page: number; limit: number; sortOrder: string };

    const where = {
      organizationId: orgId,
      tenantId: tenant.id,
    };

    const [requests, total] = await Promise.all([
      prisma.maintenanceRequest.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          unit: { select: { id: true, unitNumber: true } },
          vendor: { select: { id: true, companyName: true } },
        },
        orderBy: { createdAt: query.sortOrder as "asc" | "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.maintenanceRequest.count({ where }),
    ]);

    res.json({
      data: requests,
      pagination: getPaginationMeta(total, query.page, query.limit),
    });
  })
);

// POST /portal/maintenance — Submit a maintenance request
router.post(
  "/maintenance",
  validate({ body: createMaintenanceRequestSchema }),
  auditLog("CREATE", "MaintenanceRequest"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const tenant = await getTenantForUser(req.user!.userId, orgId);
    const body = req.body as {
      propertyId: string;
      unitId: string;
      tenantId: string;
      title: string;
      description: string;
      priority?: string;
      category?: string;
    };

    // Tenant can only submit for themselves
    if (body.tenantId !== tenant.id) {
      throw new AuthorizationError("You can only submit requests for yourself");
    }

    // Validate unit belongs to tenant's current lease
    const leaseTenant = await prisma.leaseTenant.findFirst({
      where: {
        tenantId: tenant.id,
        lease: {
          status: "ACTIVE",
          unitId: body.unitId,
          unit: { propertyId: body.propertyId },
        },
      },
    });
    if (!leaseTenant) {
      throw new ValidationError(
        "You can only submit maintenance requests for your active lease unit"
      );
    }

    const request = await prisma.maintenanceRequest.create({
      data: {
        organizationId: orgId,
        propertyId: body.propertyId,
        unitId: body.unitId,
        tenantId: tenant.id,
        title: body.title,
        description: body.description,
        priority: (body.priority as "EMERGENCY" | "URGENT" | "ROUTINE" | "COSMETIC") ?? "ROUTINE",
        category: body.category,
      },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
    });

    res.status(201).json(request);
  })
);

// POST /portal/maintenance/:id/photos
router.post(
  "/maintenance/:id/photos",
  validate({ params: maintenanceIdParamSchema }),
  upload.array("photos", 10),
  auditLog("UPLOAD_PHOTOS", "MaintenanceRequest"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const tenant = await getTenantForUser(req.user!.userId, orgId);

    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: param(req, "id"), organizationId: orgId, tenantId: tenant.id },
    });
    if (!request) {
      throw new NotFoundError("MaintenanceRequest", param(req, "id"));
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      throw new ValidationError("At least one photo is required");
    }

    const newUrls = files.map((f) => `/uploads/${f.filename}`);
    const existingPhotos = (request.photos as string[] | null) ?? [];
    const allPhotos = [...existingPhotos, ...newUrls];

    const updated = await prisma.maintenanceRequest.update({
      where: { id: param(req, "id") },
      data: { photos: allPhotos as unknown as Prisma.InputJsonValue },
    });

    res.status(201).json({ photos: updated.photos });
  })
);

// ═══════════════════════════════════════════════════════════════════
// Profile — view/update own profile
// ═══════════════════════════════════════════════════════════════════

// GET /portal/profile
router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const tenant = await getTenantForUser(req.user!.userId, orgId);

    const profile = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      include: {
        currentUnit: {
          select: {
            id: true,
            unitNumber: true,
            property: {
              select: { id: true, name: true, address: true, city: true, state: true, zip: true },
            },
          },
        },
        vehicles: true,
        pets: true,
        documents: {
          orderBy: { uploadedAt: "desc" },
          select: { id: true, name: true, type: true, uploadedAt: true },
        },
      },
    });

    res.json(profile);
  })
);

export default router;
