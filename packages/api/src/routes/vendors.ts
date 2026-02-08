import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/async-handler.js";
import { NotFoundError } from "../lib/errors.js";
import { getPaginationMeta } from "../lib/pagination.js";
import { param } from "../lib/params.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { tenancy } from "../middleware/tenancy.js";
import { requireMinRole } from "../middleware/rbac.js";
import { auditLog } from "../middleware/audit.js";
import {
  createVendorSchema,
  updateVendorSchema,
  vendorListQuerySchema,
  vendorIdParamSchema,
} from "../schemas/vendors.js";
import type {
  CreateVendorInput,
  UpdateVendorInput,
  VendorListQuery,
} from "../schemas/vendors.js";

const router = Router();

router.use(authenticate, tenancy);

// ─── GET /vendors ───────────────────────────────────────────────────
router.get(
  "/",
  validate({ query: vendorListQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const query = req.query as unknown as VendorListQuery;
    const { page, limit, sortBy, sortOrder, specialty, search } = query;

    const where: Record<string, unknown> = {
      organizationId: orgId,
      isActive: true,
      ...(specialty ? { specialty } : {}),
      ...(search
        ? {
            OR: [
              { companyName: { contains: search, mode: "insensitive" } },
              { contactName: { contains: search, mode: "insensitive" } },
              { specialty: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const orderBy = sortBy
      ? { [sortBy]: sortOrder }
      : { companyName: "asc" as const };

    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        include: {
          _count: {
            select: { maintenanceRequests: true, transactions: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.vendor.count({ where }),
    ]);

    res.json({
      data: vendors,
      pagination: getPaginationMeta(total, page, limit),
    });
  })
);

// ─── POST /vendors ──────────────────────────────────────────────────
router.post(
  "/",
  requireMinRole("TEAM_MEMBER"),
  validate({ body: createVendorSchema }),
  auditLog("CREATE", "Vendor"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreateVendorInput;

    const vendor = await prisma.vendor.create({
      data: {
        organizationId: orgId,
        companyName: body.companyName,
        contactName: body.contactName,
        email: body.email,
        phone: body.phone,
        specialty: body.specialty,
        serviceArea: body.serviceArea,
        insuranceExpiry: body.insuranceExpiry,
        notes: body.notes,
      },
    });

    res.status(201).json(vendor);
  })
);

// ─── GET /vendors/:id ───────────────────────────────────────────────
router.get(
  "/:id",
  validate({ params: vendorIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const vendor = await prisma.vendor.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        maintenanceRequests: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            cost: true,
            createdAt: true,
            property: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { maintenanceRequests: true, transactions: true },
        },
      },
    });

    if (!vendor) {
      throw new NotFoundError("Vendor", param(req, "id"));
    }

    res.json(vendor);
  })
);

// ─── PATCH /vendors/:id ─────────────────────────────────────────────
router.patch(
  "/:id",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: vendorIdParamSchema, body: updateVendorSchema }),
  auditLog("UPDATE", "Vendor"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as UpdateVendorInput;

    const existing = await prisma.vendor.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("Vendor", param(req, "id"));
    }

    const vendor = await prisma.vendor.update({
      where: { id: param(req, "id") },
      data: body,
    });

    res.json(vendor);
  })
);

// ─── DELETE /vendors/:id (soft delete) ──────────────────────────────
router.delete(
  "/:id",
  requireMinRole("OWNER"),
  validate({ params: vendorIdParamSchema }),
  auditLog("DELETE", "Vendor"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const existing = await prisma.vendor.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("Vendor", param(req, "id"));
    }

    await prisma.vendor.update({
      where: { id: param(req, "id") },
      data: { isActive: false },
    });

    res.json({ message: "Vendor deactivated successfully" });
  })
);

export default router;
