import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
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
  createMaintenanceRequestSchema,
  updateMaintenanceRequestSchema,
  maintenanceListQuerySchema,
  maintenanceIdParamSchema,
} from "../schemas/maintenance.js";
import type {
  CreateMaintenanceRequestInput,
  UpdateMaintenanceRequestInput,
  MaintenanceListQuery,
} from "../schemas/maintenance.js";
import { env } from "../config/env.js";

const router = Router();

// ─── Multer for maintenance photos ──────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `maint-${randomUUID()}${ext}`);
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

router.use(authenticate, tenancy);

// ─── GET /maintenance ───────────────────────────────────────────────
router.get(
  "/",
  validate({ query: maintenanceListQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const query = req.query as unknown as MaintenanceListQuery;
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      status,
      priority,
      propertyId,
      unitId,
      tenantId,
    } = query;

    const where: Record<string, unknown> = {
      organizationId: orgId,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(propertyId ? { propertyId } : {}),
      ...(unitId ? { unitId } : {}),
      ...(tenantId ? { tenantId } : {}),
    };

    const orderBy = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: sortOrder };

    const [requests, total] = await Promise.all([
      prisma.maintenanceRequest.findMany({
        where,
        include: {
          property: { select: { id: true, name: true, address: true } },
          unit: { select: { id: true, unitNumber: true } },
          tenant: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          vendor: {
            select: { id: true, companyName: true, phone: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.maintenanceRequest.count({ where }),
    ]);

    res.json({
      data: requests,
      pagination: getPaginationMeta(total, page, limit),
    });
  })
);

// ─── POST /maintenance ──────────────────────────────────────────────
router.post(
  "/",
  validate({ body: createMaintenanceRequestSchema }),
  auditLog("CREATE", "MaintenanceRequest"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreateMaintenanceRequestInput;

    // Validate property
    const property = await prisma.property.findFirst({
      where: { id: body.propertyId, organizationId: orgId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundError("Property", body.propertyId);
    }

    // Validate unit belongs to property
    const unit = await prisma.unit.findFirst({
      where: { id: body.unitId, propertyId: body.propertyId, organizationId: orgId },
      select: { id: true },
    });
    if (!unit) {
      throw new NotFoundError("Unit", body.unitId);
    }

    // Validate tenant
    const tenant = await prisma.tenant.findFirst({
      where: { id: body.tenantId, organizationId: orgId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundError("Tenant", body.tenantId);
    }

    const request = await prisma.maintenanceRequest.create({
      data: {
        organizationId: orgId,
        propertyId: body.propertyId,
        unitId: body.unitId,
        tenantId: body.tenantId,
        title: body.title,
        description: body.description,
        priority: body.priority,
        category: body.category,
      },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
        tenant: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json(request);
  })
);

// ─── GET /maintenance/:id ───────────────────────────────────────────
router.get(
  "/:id",
  validate({ params: maintenanceIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        property: {
          select: { id: true, name: true, address: true, city: true, state: true, zip: true },
        },
        unit: { select: { id: true, unitNumber: true } },
        tenant: {
          select: {
            id: true, firstName: true, lastName: true, email: true, phone: true,
          },
        },
        vendor: {
          select: {
            id: true, companyName: true, contactName: true, email: true, phone: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundError("MaintenanceRequest", param(req, "id"));
    }

    res.json(request);
  })
);

// ─── PATCH /maintenance/:id ─────────────────────────────────────────
router.patch(
  "/:id",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: maintenanceIdParamSchema, body: updateMaintenanceRequestSchema }),
  auditLog("UPDATE", "MaintenanceRequest"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as UpdateMaintenanceRequestInput;

    const existing = await prisma.maintenanceRequest.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("MaintenanceRequest", param(req, "id"));
    }

    // Validate vendor if being assigned
    if (body.vendorId) {
      const vendor = await prisma.vendor.findFirst({
        where: { id: body.vendorId, organizationId: orgId, isActive: true },
        select: { id: true },
      });
      if (!vendor) {
        throw new NotFoundError("Vendor", body.vendorId);
      }
    }

    const request = await prisma.maintenanceRequest.update({
      where: { id: param(req, "id") },
      data: body,
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
        tenant: { select: { id: true, firstName: true, lastName: true } },
        vendor: { select: { id: true, companyName: true } },
      },
    });

    res.json(request);
  })
);

// ─── DELETE /maintenance/:id ────────────────────────────────────────
router.delete(
  "/:id",
  requireMinRole("OWNER"),
  validate({ params: maintenanceIdParamSchema }),
  auditLog("DELETE", "MaintenanceRequest"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const existing = await prisma.maintenanceRequest.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("MaintenanceRequest", param(req, "id"));
    }

    await prisma.maintenanceRequest.delete({
      where: { id: param(req, "id") },
    });

    res.json({ message: "Maintenance request deleted successfully" });
  })
);

// ─── POST /maintenance/:id/photos ───────────────────────────────────
router.post(
  "/:id/photos",
  requireMinRole("TENANT"),
  validate({ params: maintenanceIdParamSchema }),
  upload.array("photos", 10),
  auditLog("UPLOAD_PHOTOS", "MaintenanceRequest"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
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

export default router;
