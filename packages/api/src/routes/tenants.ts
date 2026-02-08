import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/async-handler.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../lib/errors.js";
import { getPaginationMeta } from "../lib/pagination.js";
import { param } from "../lib/params.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { tenancy } from "../middleware/tenancy.js";
import { requireMinRole } from "../middleware/rbac.js";
import { auditLog } from "../middleware/audit.js";
import {
  createTenantSchema,
  updateTenantSchema,
  tenantListQuerySchema,
  tenantIdParamSchema,
  tenantDocumentIdParamSchema,
  createVehicleSchema,
  createPetSchema,
} from "../schemas/tenants.js";
import type {
  CreateTenantInput,
  UpdateTenantInput,
  TenantListQuery,
  CreateVehicleInput,
  CreatePetInput,
} from "../schemas/tenants.js";
import { env } from "../config/env.js";

const router = Router();

// ─── Multer for tenant document uploads ─────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `tenant-doc-${randomUUID()}${ext}`);
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
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.mimetype)) {
      cb(
        new ValidationError(
          "Only JPEG, PNG, WebP, PDF, and Word documents are allowed"
        )
      );
      return;
    }
    cb(null, true);
  },
});

// All tenant routes require auth + tenancy
router.use(authenticate, tenancy);

// ─── GET /tenants ───────────────────────────────────────────────────
router.get(
  "/",
  validate({ query: tenantListQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const query = req.query as unknown as TenantListQuery;
    const { page, limit, sortBy, sortOrder, status, search, unitId, propertyId } =
      query;

    const where: Record<string, unknown> = {
      organizationId: orgId,
      ...(status ? { status } : {}),
      ...(unitId ? { currentUnitId: unitId } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    if (propertyId) {
      where["currentUnit"] = { propertyId };
    }

    const orderBy = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: sortOrder };

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        include: {
          currentUnit: {
            select: {
              id: true,
              unitNumber: true,
              property: {
                select: { id: true, name: true, address: true },
              },
            },
          },
          _count: {
            select: {
              documents: true,
              leaseTenants: true,
              vehicles: true,
              pets: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tenant.count({ where }),
    ]);

    res.json({
      data: tenants,
      pagination: getPaginationMeta(total, page, limit),
    });
  })
);

// ─── POST /tenants ──────────────────────────────────────────────────
router.post(
  "/",
  requireMinRole("TEAM_MEMBER"),
  validate({ body: createTenantSchema }),
  auditLog("CREATE", "Tenant"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreateTenantInput;

    // Check for duplicate email within organization
    const existing = await prisma.tenant.findFirst({
      where: { organizationId: orgId, email: body.email },
    });
    if (existing) {
      throw new ConflictError(
        `A tenant with email '${body.email}' already exists`
      );
    }

    // Validate unit belongs to org if provided
    if (body.currentUnitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: body.currentUnitId, organizationId: orgId },
      });
      if (!unit) {
        throw new NotFoundError("Unit", body.currentUnitId);
      }
    }

    const tenant = await prisma.tenant.create({
      data: {
        organizationId: orgId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        dateOfBirth: body.dateOfBirth,
        ssn: body.ssn,
        currentUnitId: body.currentUnitId,
        status: body.status ?? "PROSPECT",
        emergencyContactName: body.emergencyContactName,
        emergencyContactPhone: body.emergencyContactPhone,
        employerName: body.employerName,
        monthlyIncome: body.monthlyIncome,
        moveInDate: body.moveInDate,
        moveOutDate: body.moveOutDate,
        notes: body.notes,
      },
      include: {
        currentUnit: {
          select: {
            id: true,
            unitNumber: true,
            property: { select: { id: true, name: true } },
          },
        },
      },
    });

    res.status(201).json(tenant);
  })
);

// ─── GET /tenants/:id ───────────────────────────────────────────────
router.get(
  "/:id",
  validate({ params: tenantIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const tenant = await prisma.tenant.findFirst({
      where: {
        id: param(req, "id"),
        organizationId: orgId,
      },
      include: {
        currentUnit: {
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
        documents: {
          orderBy: { uploadedAt: "desc" },
        },
        vehicles: true,
        pets: true,
        leaseTenants: {
          include: {
            lease: {
              select: {
                id: true,
                startDate: true,
                endDate: true,
                monthlyRent: true,
                status: true,
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
          orderBy: { lease: { startDate: "desc" } },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundError("Tenant", param(req, "id"));
    }

    res.json(tenant);
  })
);

// ─── PATCH /tenants/:id ─────────────────────────────────────────────
router.patch(
  "/:id",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: tenantIdParamSchema, body: updateTenantSchema }),
  auditLog("UPDATE", "Tenant"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as UpdateTenantInput;

    const existing = await prisma.tenant.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("Tenant", param(req, "id"));
    }

    // Check email uniqueness if changing
    if (body.email && body.email !== existing.email) {
      const emailTaken = await prisma.tenant.findFirst({
        where: {
          organizationId: orgId,
          email: body.email,
          id: { not: param(req, "id") },
        },
      });
      if (emailTaken) {
        throw new ConflictError(
          `A tenant with email '${body.email}' already exists`
        );
      }
    }

    // Validate unit if changing
    if (body.currentUnitId && body.currentUnitId !== existing.currentUnitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: body.currentUnitId, organizationId: orgId },
      });
      if (!unit) {
        throw new NotFoundError("Unit", body.currentUnitId);
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id: param(req, "id") },
      data: body,
      include: {
        currentUnit: {
          select: {
            id: true,
            unitNumber: true,
            property: { select: { id: true, name: true } },
          },
        },
      },
    });

    res.json(tenant);
  })
);

// ─── DELETE /tenants/:id ────────────────────────────────────────────
router.delete(
  "/:id",
  requireMinRole("OWNER"),
  validate({ params: tenantIdParamSchema }),
  auditLog("DELETE", "Tenant"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const existing = await prisma.tenant.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        leaseTenants: {
          include: { lease: { select: { status: true } } },
        },
      },
    });
    if (!existing) {
      throw new NotFoundError("Tenant", param(req, "id"));
    }

    const activeLeases = existing.leaseTenants.filter(
      (lt) => lt.lease.status === "ACTIVE" || lt.lease.status === "PENDING_SIGNATURE"
    );
    if (activeLeases.length > 0) {
      throw new ValidationError(
        "Cannot delete a tenant with active or pending leases. Terminate leases first."
      );
    }

    // Soft-delete: set status to FORMER
    await prisma.tenant.update({
      where: { id: param(req, "id") },
      data: { status: "FORMER", currentUnitId: null },
    });

    res.json({ message: "Tenant archived successfully" });
  })
);

// ─── Document Uploads ───────────────────────────────────────────────

// POST /tenants/:id/documents
router.post(
  "/:id/documents",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: tenantIdParamSchema }),
  upload.array("documents", 10),
  auditLog("UPLOAD_DOCUMENTS", "Tenant"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const tenant = await prisma.tenant.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!tenant) {
      throw new NotFoundError("Tenant", param(req, "id"));
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      throw new ValidationError("At least one document is required");
    }

    const body = req.body as {
      names?: string[];
      types?: string[];
    };
    const names = body.names ?? [];
    const types = body.types ?? [];

    const validTypes = ["ID", "PAY_STUB", "REFERENCE", "OTHER"];

    const documents = await prisma.tenantDocument.createManyAndReturn({
      data: files.map((file, i) => ({
        tenantId: param(req, "id")!,
        organizationId: orgId,
        name: names[i] ?? file.originalname,
        type: (types[i] && validTypes.includes(types[i]) ? types[i] : "OTHER") as
          | "ID"
          | "PAY_STUB"
          | "REFERENCE"
          | "OTHER",
        url: `/uploads/${file.filename}`,
      })),
    });

    res.status(201).json(documents);
  })
);

// GET /tenants/:id/documents
router.get(
  "/:id/documents",
  validate({ params: tenantIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const tenant = await prisma.tenant.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundError("Tenant", param(req, "id"));
    }

    const documents = await prisma.tenantDocument.findMany({
      where: { tenantId: param(req, "id"), organizationId: orgId },
      orderBy: { uploadedAt: "desc" },
    });

    res.json({ data: documents });
  })
);

// DELETE /tenants/:id/documents/:documentId
router.delete(
  "/:id/documents/:documentId",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: tenantDocumentIdParamSchema }),
  auditLog("DELETE_DOCUMENT", "TenantDocument"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const document = await prisma.tenantDocument.findFirst({
      where: {
        id: param(req, "documentId"),
        tenantId: param(req, "id"),
        organizationId: orgId,
      },
    });
    if (!document) {
      throw new NotFoundError("Document", param(req, "documentId"));
    }

    await prisma.tenantDocument.delete({
      where: { id: param(req, "documentId") },
    });

    res.json({ message: "Document deleted successfully" });
  })
);

// ─── Vehicles ───────────────────────────────────────────────────────

// POST /tenants/:id/vehicles
router.post(
  "/:id/vehicles",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: tenantIdParamSchema, body: createVehicleSchema }),
  auditLog("CREATE", "TenantVehicle"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreateVehicleInput;

    const tenant = await prisma.tenant.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!tenant) {
      throw new NotFoundError("Tenant", param(req, "id"));
    }

    const vehicle = await prisma.tenantVehicle.create({
      data: {
        tenantId: param(req, "id")!,
        make: body.make,
        model: body.model,
        year: body.year,
        color: body.color,
        licensePlate: body.licensePlate,
        state: body.state,
      },
    });

    res.status(201).json(vehicle);
  })
);

// DELETE /tenants/:id/vehicles/:vehicleId
router.delete(
  "/:id/vehicles/:vehicleId",
  requireMinRole("TEAM_MEMBER"),
  auditLog("DELETE", "TenantVehicle"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const tenant = await prisma.tenant.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!tenant) {
      throw new NotFoundError("Tenant", param(req, "id"));
    }

    const vehicleId = param(req, "vehicleId");
    const vehicle = await prisma.tenantVehicle.findFirst({
      where: {
        id: vehicleId,
        tenantId: param(req, "id"),
      },
    });
    if (!vehicle) {
      throw new NotFoundError("Vehicle", vehicleId);
    }

    await prisma.tenantVehicle.delete({
      where: { id: vehicleId },
    });

    res.json({ message: "Vehicle removed successfully" });
  })
);

// ─── Pets ───────────────────────────────────────────────────────────

// POST /tenants/:id/pets
router.post(
  "/:id/pets",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: tenantIdParamSchema, body: createPetSchema }),
  auditLog("CREATE", "TenantPet"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreatePetInput;

    const tenant = await prisma.tenant.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!tenant) {
      throw new NotFoundError("Tenant", param(req, "id"));
    }

    const pet = await prisma.tenantPet.create({
      data: {
        tenantId: param(req, "id")!,
        type: body.type,
        breed: body.breed,
        name: body.name,
        weight: body.weight,
        vaccinated: body.vaccinated,
      },
    });

    res.status(201).json(pet);
  })
);

// DELETE /tenants/:id/pets/:petId
router.delete(
  "/:id/pets/:petId",
  requireMinRole("TEAM_MEMBER"),
  auditLog("DELETE", "TenantPet"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const tenant = await prisma.tenant.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!tenant) {
      throw new NotFoundError("Tenant", param(req, "id"));
    }

    const petId = param(req, "petId");
    const pet = await prisma.tenantPet.findFirst({
      where: {
        id: petId,
        tenantId: param(req, "id"),
      },
    });
    if (!pet) {
      throw new NotFoundError("Pet", petId);
    }

    await prisma.tenantPet.delete({
      where: { id: petId },
    });

    res.json({ message: "Pet removed successfully" });
  })
);

export default router;
