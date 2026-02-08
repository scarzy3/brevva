import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
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
  createPropertySchema,
  updatePropertySchema,
  propertyListQuerySchema,
  propertyIdParamSchema,
} from "../schemas/properties.js";
import type {
  CreatePropertyInput,
  UpdatePropertyInput,
  PropertyListQuery,
} from "../schemas/properties.js";
import { env } from "../config/env.js";

const router = Router();

// Configure multer for photo uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `property-${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (!allowed.includes(file.mimetype)) {
      cb(new ValidationError("Only JPEG, PNG, WebP, and GIF images are allowed"));
      return;
    }
    cb(null, true);
  },
});

// All property routes require auth + tenancy
router.use(authenticate, tenancy);

// GET /properties
router.get(
  "/",
  validate({ query: propertyListQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const query = req.query as unknown as PropertyListQuery;
    const { page, limit, sortBy, sortOrder, status, type, search } = query;

    const where = {
      organizationId: orgId,
      ...(status ? { status } : { status: { not: "ARCHIVED" as const } }),
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { address: { contains: search, mode: "insensitive" as const } },
              { city: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const orderBy = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: sortOrder };

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        include: {
          units: {
            select: {
              id: true,
              unitNumber: true,
              status: true,
              rent: true,
            },
          },
          photos: {
            take: 1,
            orderBy: { sortOrder: "asc" },
            select: { url: true },
          },
          _count: { select: { units: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.property.count({ where }),
    ]);

    const data = properties.map((p) => ({
      ...p,
      unitCount: p._count.units,
      vacantCount: p.units.filter((u) => u.status === "VACANT").length,
      monthlyIncome: p.units.reduce(
        (sum, u) => sum + (u.status === "OCCUPIED" ? Number(u.rent) : 0),
        0
      ),
      coverPhoto: p.photos[0]?.url ?? null,
      _count: undefined,
      photos: undefined,
    }));

    res.json({
      data,
      pagination: getPaginationMeta(total, page, limit),
    });
  })
);

// POST /properties
router.post(
  "/",
  requireMinRole("TEAM_MEMBER"),
  validate({ body: createPropertySchema }),
  auditLog("CREATE", "Property"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreatePropertyInput;

    const property = await prisma.property.create({
      data: {
        organizationId: orgId,
        name: body.name,
        address: body.address,
        city: body.city,
        state: body.state,
        zip: body.zip,
        type: body.type,
        purchasePrice: body.purchasePrice,
        purchaseDate: body.purchaseDate,
        mortgageBalance: body.mortgageBalance,
        insuranceProvider: body.insuranceProvider,
        insurancePolicyNumber: body.insurancePolicyNumber,
        insuranceExpiry: body.insuranceExpiry,
        notes: body.notes,
      },
      include: {
        units: true,
        photos: true,
      },
    });

    res.status(201).json(property);
  })
);

// GET /properties/:id
router.get(
  "/:id",
  validate({ params: propertyIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const property = await prisma.property.findFirst({
      where: {
        id: param(req, "id"),
        organizationId: orgId,
      },
      include: {
        units: {
          include: {
            currentTenants: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                status: true,
              },
            },
            leases: {
              where: { status: "ACTIVE" },
              take: 1,
              select: {
                id: true,
                startDate: true,
                endDate: true,
                monthlyRent: true,
                status: true,
              },
            },
          },
          orderBy: { unitNumber: "asc" },
        },
        photos: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!property) {
      throw new NotFoundError("Property", param(req, "id"));
    }

    res.json(property);
  })
);

// PATCH /properties/:id
router.patch(
  "/:id",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: propertyIdParamSchema, body: updatePropertySchema }),
  auditLog("UPDATE", "Property"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as UpdatePropertyInput;

    const existing = await prisma.property.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("Property", param(req, "id"));
    }

    const property = await prisma.property.update({
      where: { id: param(req, "id") },
      data: body,
      include: {
        units: true,
        photos: { orderBy: { sortOrder: "asc" } },
      },
    });

    res.json(property);
  })
);

// DELETE /properties/:id (soft delete — archive)
router.delete(
  "/:id",
  requireMinRole("OWNER"),
  validate({ params: propertyIdParamSchema }),
  auditLog("ARCHIVE", "Property"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const existing = await prisma.property.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("Property", param(req, "id"));
    }

    await prisma.property.update({
      where: { id: param(req, "id") },
      data: { status: "ARCHIVED" },
    });

    res.json({ message: "Property archived successfully" });
  })
);

// POST /properties/:id/photos
router.post(
  "/:id/photos",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: propertyIdParamSchema }),
  upload.array("photos", 20),
  auditLog("UPLOAD_PHOTOS", "Property"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const existing = await prisma.property.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("Property", param(req, "id"));
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      throw new ValidationError("At least one photo is required");
    }

    // Get current max sort order
    const maxSort = await prisma.propertyPhoto.findFirst({
      where: { propertyId: param(req, "id") },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const startOrder = (maxSort?.sortOrder ?? -1) + 1;

    const captions = req.body as { captions?: string[] };
    const captionList = captions.captions ?? [];

    const photos = await prisma.propertyPhoto.createManyAndReturn({
      data: files.map((file, i) => ({
        propertyId: param(req, "id")!,
        url: `/uploads/${file.filename}`,
        caption: captionList[i] ?? null,
        sortOrder: startOrder + i,
      })),
    });

    res.status(201).json(photos);
  })
);

export default router;
