import { Router } from "express";
import { createHash, randomUUID, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
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
import { auditLog, createAuditEntry } from "../middleware/audit.js";
import { getClientIp, getClientCountry } from "../lib/client-ip.js";
import {
  createLeaseSchema,
  updateLeaseSchema,
  leaseListQuerySchema,
  leaseIdParamSchema,
  signLeaseSchema,
  createAddendumSchema,
  updateAddendumSchema,
  addendumIdParamSchema,
  countersignLeaseSchema,
  countersignAddendumSchema,
  tokenSignLeaseSchema,
  signingTokenParamSchema,
  uploadLeaseSchema,
  uploadAddendumSchema,
  addendumSigningTokenParamSchema,
  addendumSendParamSchema,
} from "../schemas/leases.js";
import type {
  CreateLeaseInput,
  UpdateLeaseInput,
  UpdateAddendumInput,
  LeaseListQuery,
  SignLeaseInput,
  CreateAddendumInput,
  UploadLeaseInput,
  UploadAddendumInput,
} from "../schemas/leases.js";
import {
  generateLeaseHTML,
  generateCertificateHTML,
  generateAddendumHTML,
  generateAddendumCertificateHTML,
  saveLeaseDocument,
  saveAddendumDocument,
  DEFAULT_CLAUSES,
} from "../services/leaseDocument.js";
import type { CertificateSignerInfo } from "../services/leaseDocument.js";
import {
  sendEmail,
  buildSignatureRequestEmail,
  buildAddendumSignatureRequestEmail,
  buildLeaseSignedConfirmationEmail,
  buildWelcomeTenantEmail,
} from "../services/email.js";
import { env } from "../config/env.js";

const router = Router();

// ─── File upload config for lease documents ─────────────────────────
const leaseUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    // Sanitize filename: remove path traversal characters
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = path.extname(sanitized);
    cb(null, `lease-upload-${randomUUID()}${ext}`);
  },
});

const leaseUpload = multer({
  storage: leaseUploadStorage,
  limits: { fileSize: env.MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.mimetype)) {
      cb(new ValidationError("Only PDF and DOCX files are allowed") as any);
      return;
    }
    // Check for path traversal in filename
    if (file.originalname.includes("..") || file.originalname.includes("/") || file.originalname.includes("\\")) {
      cb(new ValidationError("Invalid filename") as any);
      return;
    }
    cb(null, true);
  },
});

/**
 * Regenerate the lease HTML document with current signature data
 * and update the stored file. Called after each signature event.
 * When all parties have signed (tenants + landlord), appends a Certificate of Completion.
 */
async function regenerateLeaseDocument(leaseId: string) {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      organization: { select: { name: true } },
      unit: {
        select: {
          unitNumber: true,
          bedrooms: true,
          bathrooms: true,
          sqFt: true,
          property: {
            select: { name: true, address: true, city: true, state: true, zip: true },
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
  if (!lease) return;

  const clauses = (lease.terms as { clauses?: any[] } | null)?.clauses ?? [];
  const landlordSigData = lease.landlordSignatureData as Record<string, unknown> | null;

  let html = generateLeaseHTML({
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
      signedAt: lt.signedAt?.toISOString() ?? null,
      signatureData: lt.signatureData as any ?? null,
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
    landlordSignature: landlordSigData
      ? {
          fullName: landlordSigData["fullName"] as string,
          timestamp: landlordSigData["timestamp"] as string,
          ip: landlordSigData["ip"] as string | undefined,
          signatureImage: landlordSigData["signatureImage"] as string | undefined,
        }
      : null,
  });

  // If all tenants AND landlord have signed, append Certificate of Completion
  const allTenantsSigned = lease.tenants.every((lt) => lt.signedAt);
  if (allTenantsSigned && lease.landlordSignedAt && landlordSigData) {
    const propertyAddress = `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state} ${lease.unit.property.zip}, Unit ${lease.unit.unitNumber}`;

    const signers: CertificateSignerInfo[] = lease.tenants.map((lt) => {
      const sd = lt.signatureData as Record<string, unknown> | null;
      return {
        role: lt.isPrimary ? "Tenant (Primary)" : "Tenant",
        name: `${lt.tenant.firstName} ${lt.tenant.lastName}`,
        email: lt.tenant.email,
        signedAt: sd?.["timestamp"] as string ?? lt.signedAt!.toISOString(),
        ipAddress: sd?.["ipAddress"] as string ?? sd?.["ip"] as string ?? "unknown",
        location: sd?.["ipCountry"] as string ?? null,
        viewTimeSeconds: sd?.["totalViewTimeSeconds"] as number ?? null,
      };
    });

    // Add landlord
    signers.push({
      role: "Landlord",
      name: landlordSigData["fullName"] as string,
      email: landlordSigData["email"] as string ?? "",
      signedAt: landlordSigData["timestamp"] as string ?? lease.landlordSignedAt.toISOString(),
      ipAddress: landlordSigData["ipAddress"] as string ?? landlordSigData["ip"] as string ?? "unknown",
      location: landlordSigData["ipCountry"] as string ?? null,
      viewTimeSeconds: landlordSigData["totalViewTimeSeconds"] as number ?? null,
    });

    const certHtml = generateCertificateHTML({
      leaseId: lease.id,
      propertyAddress,
      createdAt: lease.createdAt.toISOString(),
      completedAt: new Date().toISOString(),
      documentHash: lease.documentHash ?? "",
      signers,
    });

    // Insert certificate before closing </body> tag
    html = html.replace("</body>", `${certHtml}\n</body>`);
  }

  const { url, hash } = saveLeaseDocument(html, lease.id);
  await prisma.lease.update({
    where: { id: lease.id },
    data: { documentUrl: url, documentHash: hash },
  });
}

/**
 * Regenerate the addendum HTML document with current signature data
 * and update the stored file. Called after each signature event.
 * When all parties have signed (tenants + landlord), appends a Certificate of Completion.
 */
async function regenerateAddendumDocument(addendumId: string) {
  const addendum = await prisma.leaseAddendum.findUnique({
    where: { id: addendumId },
    include: {
      lease: {
        include: {
          organization: { select: { name: true } },
          unit: {
            select: {
              unitNumber: true,
              property: {
                select: { name: true, address: true, city: true, state: true, zip: true },
              },
            },
          },
        },
      },
      signatures: {
        include: {
          tenant: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
        },
      },
    },
  });
  if (!addendum) return;

  const lease = addendum.lease;
  const landlordSigData = addendum.landlordSignatureData as Record<string, unknown> | null;

  // Determine isPrimary from lease tenants
  const leaseTenants = await prisma.leaseTenant.findMany({
    where: { leaseId: lease.id },
    select: { tenantId: true, isPrimary: true },
  });
  const primaryMap = new Map(leaseTenants.map((lt) => [lt.tenantId, lt.isPrimary]));

  let html = generateAddendumHTML({
    addendumId: addendum.id,
    organizationName: lease.organization.name,
    property: {
      address: lease.unit.property.address,
      city: lease.unit.property.city,
      state: lease.unit.property.state,
      zip: lease.unit.property.zip,
    },
    unitNumber: lease.unit.unitNumber,
    leaseStartDate: lease.startDate.toISOString(),
    addendumTitle: addendum.title,
    addendumContent: addendum.content,
    effectiveDate: addendum.effectiveDate?.toISOString() ?? null,
    tenants: addendum.signatures.map((sig) => ({
      id: sig.tenant.id,
      firstName: sig.tenant.firstName,
      lastName: sig.tenant.lastName,
      email: sig.tenant.email,
      phone: sig.tenant.phone,
      isPrimary: primaryMap.get(sig.tenantId) ?? false,
      signedAt: sig.signedAt?.toISOString() ?? null,
      signatureData: sig.signatureData as any ?? null,
    })),
    landlordSignature: landlordSigData
      ? {
          fullName: landlordSigData["fullName"] as string,
          timestamp: landlordSigData["timestamp"] as string,
          ip: landlordSigData["ip"] as string | undefined,
          signatureImage: landlordSigData["signatureImage"] as string | undefined,
        }
      : null,
  });

  // If all tenants AND landlord have signed, append Certificate of Completion
  const allTenantsSigned = addendum.signatures.every((s) => s.signedAt);
  if (allTenantsSigned && addendum.landlordSignedAt && landlordSigData) {
    const propertyAddress = `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state} ${lease.unit.property.zip}, Unit ${lease.unit.unitNumber}`;

    const signers: CertificateSignerInfo[] = addendum.signatures.map((sig) => {
      const sd = sig.signatureData as Record<string, unknown> | null;
      return {
        role: primaryMap.get(sig.tenantId) ? "Tenant (Primary)" : "Tenant",
        name: `${sig.tenant.firstName} ${sig.tenant.lastName}`,
        email: sig.tenant.email,
        signedAt: sd?.["timestamp"] as string ?? sig.signedAt!.toISOString(),
        ipAddress: sd?.["ipAddress"] as string ?? sd?.["ip"] as string ?? "unknown",
        location: sd?.["ipCountry"] as string ?? null,
        viewTimeSeconds: sd?.["totalViewTimeSeconds"] as number ?? null,
      };
    });

    signers.push({
      role: "Landlord",
      name: landlordSigData["fullName"] as string,
      email: landlordSigData["email"] as string ?? "",
      signedAt: landlordSigData["timestamp"] as string ?? addendum.landlordSignedAt.toISOString(),
      ipAddress: landlordSigData["ipAddress"] as string ?? landlordSigData["ip"] as string ?? "unknown",
      location: landlordSigData["ipCountry"] as string ?? null,
      viewTimeSeconds: landlordSigData["totalViewTimeSeconds"] as number ?? null,
    });

    const certHtml = generateAddendumCertificateHTML({
      addendumId: addendum.id,
      addendumTitle: addendum.title,
      propertyAddress,
      createdAt: addendum.createdAt.toISOString(),
      completedAt: new Date().toISOString(),
      documentHash: addendum.documentHash ?? "",
      signers,
    });

    html = html.replace("</body>", `${certHtml}\n</body>`);
  }

  const { url, hash } = saveAddendumDocument(html, addendum.id);
  await prisma.leaseAddendum.update({
    where: { id: addendum.id },
    data: { documentUrl: url, documentHash: hash },
  });
}

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

    // Log SIGNING_LINK_OPENED audit entry
    const clientIp = getClientIp(req);
    createAuditEntry({
      organizationId: leaseTenant.lease.organizationId,
      userId: leaseTenant.tenantId,
      action: "SIGNING_LINK_OPENED",
      entityType: "Lease",
      entityId: leaseTenant.lease.id,
      changes: {
        tenantName: `${leaseTenant.tenant.firstName} ${leaseTenant.tenant.lastName}`,
        userAgent: req.headers["user-agent"] ?? "unknown",
      },
      ipAddress: clientIp,
    });

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
      // Token metadata for signature data
      signingToken: {
        token: token,
        createdAt: leaseTenant.tokenExpiresAt
          ? new Date(leaseTenant.tokenExpiresAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
          : null,
        expiresAt: leaseTenant.tokenExpiresAt?.toISOString() ?? null,
      },
    });
  })
);

router.post(
  "/sign/:token",
  validate({ params: signingTokenParamSchema, body: tokenSignLeaseSchema }),
  asyncHandler(async (req, res) => {
    const token = param(req, "token");
    const body = req.body as {
      fullName: string;
      email: string;
      agreedToTerms: true;
      agreedToEsign: true;
      agreedToIdentity: true;
      signatureImage?: string;
      signingMetadata?: {
        screenResolution?: string;
        timezone?: string;
        browserLanguage?: string;
        platform?: string;
        pageOpenedAt?: string;
        documentViewedAt?: string;
        scrolledToBottomAt?: string;
        consent1CheckedAt?: string;
        consent2CheckedAt?: string;
        consent3CheckedAt?: string;
        nameTypedAt?: string;
        signedAt?: string;
        totalViewTimeSeconds?: number;
      };
    };

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

    // Build expanded signature data
    const now = new Date();
    const clientIp = getClientIp(req);
    const ipCountry = getClientCountry(req);
    const metadata = body.signingMetadata ?? {};

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

    // Token metadata
    const tokenCreatedAt = leaseTenant.tokenExpiresAt
      ? new Date(leaseTenant.tokenExpiresAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const tokenExpiresAt = leaseTenant.tokenExpiresAt?.toISOString() ?? null;

    const signatureData = {
      // Identity
      fullName: body.fullName,
      email: body.email,
      // Device & Network
      ipAddress: clientIp,
      ipCountry: ipCountry ?? undefined,
      userAgent: req.headers["user-agent"] ?? "unknown",
      screenResolution: metadata.screenResolution ?? undefined,
      timezone: metadata.timezone ?? undefined,
      browserLanguage: metadata.browserLanguage ?? undefined,
      platform: metadata.platform ?? undefined,
      // Timing & Interaction Proof
      pageOpenedAt: metadata.pageOpenedAt ?? undefined,
      documentViewedAt: metadata.documentViewedAt ?? undefined,
      scrolledToBottomAt: metadata.scrolledToBottomAt ?? undefined,
      consent1CheckedAt: metadata.consent1CheckedAt ?? undefined,
      consent2CheckedAt: metadata.consent2CheckedAt ?? undefined,
      consent3CheckedAt: metadata.consent3CheckedAt ?? undefined,
      nameTypedAt: metadata.nameTypedAt ?? undefined,
      signedAt: now.toISOString(),
      totalViewTimeSeconds: metadata.totalViewTimeSeconds ?? undefined,
      // Document Integrity
      documentHash: lease.documentHash ?? "",
      hash: signatureHash,
      // Authentication
      signingToken: token,
      tokenCreatedAt,
      tokenExpiresAt,
      // Legacy compat
      ip: clientIp,
      timestamp: now.toISOString(),
      ...(body.signatureImage ? { signatureImage: body.signatureImage } : {}),
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

    // Audit: SIGNATURE_SUBMITTED
    createAuditEntry({
      organizationId: lease.organizationId,
      userId: leaseTenant.tenantId,
      action: "SIGNATURE_SUBMITTED",
      entityType: "Lease",
      entityId: lease.id,
      changes: {
        fullName: body.fullName,
        email: body.email,
        userAgent: req.headers["user-agent"] ?? "unknown",
      },
      ipAddress: clientIp,
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

      // Audit: ALL_PARTIES_SIGNED (tenants done, landlord still pending)
      createAuditEntry({
        organizationId: lease.organizationId,
        userId: leaseTenant.tenantId,
        action: "ALL_PARTIES_SIGNED",
        entityType: "Lease",
        entityId: lease.id,
        changes: { note: "All tenant signatures collected" },
        ipAddress: clientIp,
      });
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
        portalUrl: env.PORTAL_URL,
        documentUrl: lease.documentUrl,
      });
      sendEmail({
        to: lt.tenant.email,
        ...confirmEmail,
      }).catch(() => {});
    }

    // Regenerate lease document with the new signature
    await regenerateLeaseDocument(lease.id);

    // Audit: SIGNATURE_CONFIRMED
    createAuditEntry({
      organizationId: lease.organizationId,
      userId: leaseTenant.tenantId,
      action: "SIGNATURE_CONFIRMED",
      entityType: "Lease",
      entityId: lease.id,
      changes: {
        fullName: body.fullName,
        email: body.email,
        signatureId: signatureHash.substring(0, 16),
        ipAddress: clientIp,
        ipCountry: ipCountry,
      },
      ipAddress: clientIp,
    });

    // Fetch updated document URL after regeneration
    const updatedLease = await prisma.lease.findUnique({
      where: { id: lease.id },
      select: { documentUrl: true },
    });

    res.json({
      message:
        leaseStatus === "ACTIVE"
          ? "Lease fully signed and activated"
          : "Signature recorded successfully",
      leaseStatus,
      signedAt: signatureData.timestamp,
      allSigned: unsignedCount === 0,
      remainingSignatures: unsignedCount,
      documentUrl: updatedLease?.documentUrl ?? lease.documentUrl,
      signatureReceipt: {
        documentId: lease.id,
        signedBy: body.fullName,
        email: body.email,
        signedAt: now.toISOString(),
        ipAddress: clientIp,
        location: ipCountry,
        signatureId: signatureHash.substring(0, 16),
      },
    });
  })
);

// ─── Public route: addendum token-based signing ──────────────────────
router.get(
  "/addendum/sign/:token",
  validate({ params: addendumSigningTokenParamSchema }),
  asyncHandler(async (req, res) => {
    const token = param(req, "token");

    const signature = await prisma.leaseAddendumSignature.findFirst({
      where: { signingToken: token },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        addendum: {
          include: {
            lease: {
              include: {
                organization: { select: { id: true, name: true } },
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
              },
            },
            signatures: {
              select: {
                tenantId: true,
                signedAt: true,
                tenant: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });

    if (!signature) {
      throw new NotFoundError("Signing token");
    }

    if (signature.tokenExpiresAt && signature.tokenExpiresAt < new Date()) {
      throw new ValidationError("This signing link has expired");
    }

    if (signature.signedAt) {
      throw new ValidationError("You have already signed this addendum");
    }

    if (signature.addendum.status !== "PENDING_SIGNATURE") {
      throw new ValidationError("This addendum is no longer available for signing");
    }

    const addendum = signature.addendum;
    const lease = addendum.lease;

    res.json({
      tenant: signature.tenant,
      addendum: {
        id: addendum.id,
        title: addendum.title,
        content: addendum.content,
        documentUrl: addendum.documentUrl,
        documentHash: addendum.documentHash,
        effectiveDate: addendum.effectiveDate,
        status: addendum.status,
      },
      lease: {
        id: lease.id,
        startDate: lease.startDate,
        endDate: lease.endDate,
        monthlyRent: lease.monthlyRent,
      },
      unit: lease.unit,
      organization: lease.organization,
      signatures: addendum.signatures.map((s) => ({
        firstName: s.tenant.firstName,
        lastName: s.tenant.lastName,
        signed: !!s.signedAt,
      })),
    });
  })
);

router.post(
  "/addendum/sign/:token",
  validate({ params: addendumSigningTokenParamSchema, body: tokenSignLeaseSchema }),
  asyncHandler(async (req, res) => {
    const token = param(req, "token");
    const body = req.body as { fullName: string; email: string; agreedToTerms: true; agreedToEsign: true; signatureImage?: string };

    const signature = await prisma.leaseAddendumSignature.findFirst({
      where: { signingToken: token },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        addendum: {
          include: {
            signatures: true,
          },
        },
      },
    });

    if (!signature) {
      throw new NotFoundError("Signing token");
    }

    if (signature.tokenExpiresAt && signature.tokenExpiresAt < new Date()) {
      throw new ValidationError("This signing link has expired");
    }

    if (signature.signedAt) {
      throw new ValidationError("You have already signed this addendum");
    }

    const addendum = signature.addendum;
    if (addendum.status !== "PENDING_SIGNATURE") {
      throw new ValidationError("This addendum is no longer available for signing");
    }

    const now = new Date();
    const addendumClientIp = getClientIp(req);
    const addendumIpCountry = getClientCountry(req);

    const signatureHash = createHash("sha256")
      .update(
        JSON.stringify({
          addendumId: addendum.id,
          tenantId: signature.tenantId,
          fullName: body.fullName,
          email: body.email,
          documentHash: addendum.documentHash ?? "",
          timestamp: now.toISOString(),
        })
      )
      .digest("hex");

    const signatureData = {
      fullName: body.fullName,
      email: body.email,
      ipAddress: addendumClientIp,
      ipCountry: addendumIpCountry ?? undefined,
      ip: addendumClientIp,
      userAgent: req.headers["user-agent"] ?? "unknown",
      documentHash: addendum.documentHash ?? "",
      hash: signatureHash,
      timestamp: now.toISOString(),
      ...(body.signatureImage ? { signatureImage: body.signatureImage } : {}),
    };

    await prisma.leaseAddendumSignature.update({
      where: { id: signature.id },
      data: {
        signedAt: now,
        signatureData,
        signingToken: null,
        tokenExpiresAt: null,
      },
    });

    // Check if all signatures are done
    const unsignedCount = addendum.signatures.filter(
      (s) => s.id !== signature.id && !s.signedAt
    ).length;

    let addendumStatus: string = addendum.status;
    if (unsignedCount === 0) {
      await prisma.leaseAddendum.update({
        where: { id: addendum.id },
        data: { status: "SIGNED" },
      });
      addendumStatus = "SIGNED";
    }

    // Regenerate addendum document with updated signature data
    await regenerateAddendumDocument(addendum.id);

    res.json({
      message:
        addendumStatus === "SIGNED"
          ? "Addendum fully signed"
          : "Signature recorded successfully",
      addendumStatus,
      signedAt: signatureData.timestamp,
      allSigned: unsignedCount === 0,
      remainingSignatures: unsignedCount,
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

// ─── POST /leases/upload ──────────────────────────────────────────────
router.post(
  "/upload",
  requireMinRole("TEAM_MEMBER"),
  leaseUpload.single("file"),
  auditLog("CREATE", "Lease"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    if (!req.file) {
      throw new ValidationError("A document file is required");
    }

    // Parse and validate body fields
    const body = uploadLeaseSchema.parse(req.body);
    const tenantIds: string[] = Array.isArray(body.tenantIds) ? body.tenantIds : [];

    if (tenantIds.length === 0) {
      throw new ValidationError("At least one tenant is required");
    }

    if (!tenantIds.includes(body.primaryTenantId)) {
      throw new ValidationError("primaryTenantId must be included in tenantIds");
    }

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
      throw new ValidationError("This unit already has an active or pending lease");
    }

    // Validate tenants
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds }, organizationId: orgId },
    });
    if (tenants.length !== tenantIds.length) {
      throw new ValidationError(
        "One or more tenant IDs are invalid or do not belong to this organization"
      );
    }

    // Validate dates
    if (body.endDate <= body.startDate) {
      throw new ValidationError("End date must be after start date");
    }

    // Move uploaded file to lease-specific directory
    const leaseId = randomUUID();
    const leaseDir = path.join(path.resolve(env.UPLOAD_DIR), "leases", leaseId);
    fs.mkdirSync(leaseDir, { recursive: true });

    const sanitizedOriginal = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const destPath = path.join(leaseDir, sanitizedOriginal);
    fs.renameSync(req.file.path, destPath);

    // Generate document hash
    const fileBuffer = fs.readFileSync(destPath);
    const documentHash = createHash("sha256").update(fileBuffer).digest("hex");

    const documentUrl = `/uploads/leases/${leaseId}/${sanitizedOriginal}`;

    const lease = await prisma.$transaction(async (tx) => {
      const created = await tx.lease.create({
        data: {
          id: leaseId,
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
          documentUrl,
          documentHash,
          terms: { source: "uploaded", originalFilename: req.file!.originalname } as unknown as Prisma.InputJsonValue,
          status: "DRAFT",
        },
      });

      await tx.leaseTenant.createMany({
        data: tenantIds.map((tenantId) => ({
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
                select: { id: true, firstName: true, lastName: true, email: true },
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
          include: {
            signatures: {
              include: {
                tenant: {
                  select: { id: true, firstName: true, lastName: true, email: true },
                },
              },
            },
          },
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

// ─── GET /leases/:id/document ─────────────────────────────────────────
router.get(
  "/:id/document",
  validate({ params: leaseIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      select: { documentUrl: true },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }
    if (!lease.documentUrl) {
      throw new NotFoundError("Document");
    }

    const filePath = path.join(path.resolve(env.UPLOAD_DIR), lease.documentUrl.replace(/^\/uploads\//, ""));
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError("Document file");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".html": "text/html",
    };
    res.setHeader("Content-Type", contentTypes[ext] ?? "application/octet-stream");

    // Audit: SIGNED_DOCUMENT_DOWNLOADED
    if (lease.documentUrl) {
      createAuditEntry({
        organizationId: orgId,
        userId: req.user!.userId,
        action: "SIGNED_DOCUMENT_DOWNLOADED",
        entityType: "Lease",
        entityId: param(req, "id"),
        changes: {
          userAgent: req.headers["user-agent"] ?? "unknown",
        },
        ipAddress: getClientIp(req),
      });
    }

    res.sendFile(filePath);
  })
);

// ─── GET /leases/:id/verify-signatures ──────────────────────────────
router.get(
  "/:id/verify-signatures",
  validate({ params: leaseIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        tenants: {
          include: {
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        unit: {
          select: {
            property: {
              select: { state: true },
            },
          },
        },
      },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    // Verify document hash
    let hashVerified = false;
    if (lease.documentUrl && lease.documentHash) {
      try {
        const filePath = path.join(
          path.resolve(env.UPLOAD_DIR),
          lease.documentUrl.replace(/^\/uploads\//, "")
        );
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          const currentHash = createHash("sha256").update(content).digest("hex");
          hashVerified = currentHash === lease.documentHash;
        }
      } catch {
        // hash verification failed
      }
    }

    // Determine status
    const allTenantsSigned = lease.tenants.every((lt) => lt.signedAt);
    const landlordSigned = !!lease.landlordSignedAt;
    let status: "complete" | "pending" | "expired" = "pending";
    if (allTenantsSigned && landlordSigned) {
      status = "complete";
    } else if (lease.status === "EXPIRED" || lease.status === "TERMINATED") {
      status = "expired";
    }

    // Build signers array
    const signers = lease.tenants.map((lt) => {
      const sd = lt.signatureData as Record<string, unknown> | null;
      return {
        name: `${lt.tenant.firstName} ${lt.tenant.lastName}`,
        email: lt.tenant.email,
        role: lt.isPrimary ? "Tenant (Primary)" : "Tenant",
        signed: !!lt.signedAt,
        signedAt: sd?.["signedAt"] as string ?? sd?.["timestamp"] as string ?? lt.signedAt?.toISOString() ?? null,
        ipAddress: sd?.["ipAddress"] as string ?? sd?.["ip"] as string ?? null,
        location: sd?.["ipCountry"] as string ?? null,
        viewTimeSeconds: sd?.["totalViewTimeSeconds"] as number ?? null,
        signatureId: sd?.["hash"] as string ?? "",
      };
    });

    // Add landlord
    const landlordSigData = lease.landlordSignatureData as Record<string, unknown> | null;
    if (landlordSigData) {
      signers.push({
        name: landlordSigData["fullName"] as string ?? "",
        email: landlordSigData["email"] as string ?? "",
        role: "Landlord",
        signed: !!lease.landlordSignedAt,
        signedAt: landlordSigData["signedAt"] as string ?? landlordSigData["timestamp"] as string ?? lease.landlordSignedAt?.toISOString() ?? null,
        ipAddress: landlordSigData["ipAddress"] as string ?? landlordSigData["ip"] as string ?? null,
        location: landlordSigData["ipCountry"] as string ?? null,
        viewTimeSeconds: landlordSigData["totalViewTimeSeconds"] as number ?? null,
        signatureId: "",
      });
    }

    // Fetch audit trail
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        entityType: "Lease",
        entityId: lease.id,
      },
      orderBy: { createdAt: "asc" },
      select: {
        action: true,
        createdAt: true,
        ipAddress: true,
        changes: true,
      },
    });

    const auditTrail = auditLogs.map((log) => ({
      action: log.action,
      timestamp: log.createdAt.toISOString(),
      ip: log.ipAddress ?? "",
      details: log.changes,
    }));

    // Detect anomalies
    const anomalies: string[] = [];
    for (const signer of signers) {
      if (signer.signed && signer.viewTimeSeconds != null && signer.viewTimeSeconds < 30) {
        anomalies.push(
          `${signer.name} viewed the document for less than 30 seconds (${signer.viewTimeSeconds}s)`
        );
      }
    }

    // Check for multiple signing attempts
    const signAttempts = auditLogs.filter(
      (l) => l.action === "SIGNATURE_SUBMITTED" || l.action === "SIGN"
    );
    const attemptsByUser = new Map<string, number>();
    for (const attempt of signAttempts) {
      const changes = attempt.changes as Record<string, unknown> | null;
      const email = changes?.["email"] as string ?? "unknown";
      attemptsByUser.set(email, (attemptsByUser.get(email) ?? 0) + 1);
    }
    for (const [email, count] of attemptsByUser) {
      if (count > 1) {
        anomalies.push(`Multiple signing attempts detected for ${email} (${count} attempts)`);
      }
    }

    res.json({
      documentId: lease.id,
      documentHash: lease.documentHash ?? "",
      hashVerified,
      status,
      signers,
      auditTrail,
      anomalies,
    });
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
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, userId: true },
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

    // Auto-create portal accounts for tenants who don't have one
    const propertyAddr = `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state}`;
    for (const lt of lease.tenants) {
      if (lt.tenant.userId) continue; // already has a User account

      // Check if a user with this email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: lt.tenant.email },
      });
      if (existingUser) {
        // Link the existing user to this tenant
        await prisma.tenant.update({
          where: { id: lt.tenant.id },
          data: { userId: existingUser.id },
        });
        continue;
      }

      // Create a new User account with a placeholder password
      const tempPasswordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
      const setupToken = randomBytes(32).toString("hex");
      const setupExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      const newUser = await prisma.user.create({
        data: {
          organizationId: orgId,
          email: lt.tenant.email,
          passwordHash: tempPasswordHash,
          firstName: lt.tenant.firstName,
          lastName: lt.tenant.lastName,
          role: "TENANT",
          phone: lt.tenant.phone,
          passwordResetToken: setupToken,
          passwordResetExpires: setupExpiry,
        },
      });

      // Link the tenant to the new user
      await prisma.tenant.update({
        where: { id: lt.tenant.id },
        data: { userId: newUser.id },
      });

      // Send welcome email with setup link
      const setupUrl = `${env.PORTAL_URL}/reset-password?token=${setupToken}`;
      const welcomeEmail = buildWelcomeTenantEmail({
        tenantName: `${lt.tenant.firstName} ${lt.tenant.lastName}`,
        propertyAddress: propertyAddr,
        unitNumber: lease.unit.unitNumber,
        setupUrl,
        landlordName: lease.organization.name,
        portalUrl: env.PORTAL_URL,
      });
      sendEmail({ to: lt.tenant.email, ...welcomeEmail }).catch(() => {});
    }

    // Generate or reuse lease document
    const termsData = lease.terms as Record<string, unknown> | null;
    let documentUrl: string;
    let documentHash: string;

    if (termsData?.["source"] === "uploaded" && lease.documentUrl && lease.documentHash) {
      // Uploaded document — use existing file
      documentUrl = lease.documentUrl;
      documentHash = lease.documentHash;
    } else {
      // Builder-created lease — generate HTML document
      const clauses = (termsData as { clauses?: any[] } | null)?.clauses ?? [];
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
      const saved = saveLeaseDocument(html, lease.id);
      documentUrl = saved.url;
      documentHash = saved.hash;
    }

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

    // Build signature data with real IP
    const authClientIp = getClientIp(req);
    const authIpCountry = getClientCountry(req);
    const authNow = new Date();

    const signatureHash = createHash("sha256")
      .update(
        JSON.stringify({
          leaseId: lease.id,
          tenantId: leaseTenant.tenantId,
          fullName: body.fullName,
          email: body.email,
          documentHash: lease.documentHash ?? "",
          timestamp: authNow.toISOString(),
        })
      )
      .digest("hex");

    const signatureData = {
      fullName: body.fullName,
      email: body.email,
      ipAddress: authClientIp,
      ipCountry: authIpCountry ?? undefined,
      ip: authClientIp,
      userAgent: req.headers["user-agent"] ?? "unknown",
      documentHash: lease.documentHash ?? "",
      hash: signatureHash,
      timestamp: authNow.toISOString(),
      signedAt: authNow.toISOString(),
      ...(body.signatureImage ? { signatureImage: body.signatureImage } : {}),
    };

    // Update the lease-tenant with signature
    await prisma.leaseTenant.update({
      where: { id: leaseTenant.id },
      data: {
        signedAt: authNow,
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

    // Regenerate lease document with the new signature
    await regenerateLeaseDocument(lease.id);

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
    const body = req.body as {
      fullName: string;
      signatureImage?: string;
      agreedToTerms?: true;
      agreedToEsign?: true;
      agreedToIdentity?: true;
      signingMetadata?: {
        screenResolution?: string;
        timezone?: string;
        browserLanguage?: string;
        platform?: string;
        pageOpenedAt?: string;
        consent1CheckedAt?: string;
        consent2CheckedAt?: string;
        consent3CheckedAt?: string;
        nameTypedAt?: string;
        signedAt?: string;
        totalViewTimeSeconds?: number;
      };
    };

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
    const csClientIp = getClientIp(req);
    const csIpCountry = getClientCountry(req);
    const csMetadata = body.signingMetadata ?? {};

    const landlordSignatureData = {
      fullName: body.fullName,
      email: req.user?.email ?? "",
      ipAddress: csClientIp,
      ipCountry: csIpCountry ?? undefined,
      ip: csClientIp,
      userAgent: req.headers["user-agent"] ?? "unknown",
      screenResolution: csMetadata.screenResolution ?? undefined,
      timezone: csMetadata.timezone ?? undefined,
      browserLanguage: csMetadata.browserLanguage ?? undefined,
      platform: csMetadata.platform ?? undefined,
      pageOpenedAt: csMetadata.pageOpenedAt ?? undefined,
      consent1CheckedAt: csMetadata.consent1CheckedAt ?? undefined,
      consent2CheckedAt: csMetadata.consent2CheckedAt ?? undefined,
      consent3CheckedAt: csMetadata.consent3CheckedAt ?? undefined,
      nameTypedAt: csMetadata.nameTypedAt ?? undefined,
      signedAt: now.toISOString(),
      totalViewTimeSeconds: csMetadata.totalViewTimeSeconds ?? undefined,
      documentHash: lease.documentHash ?? "",
      timestamp: now.toISOString(),
      ...(body.signatureImage ? { signatureImage: body.signatureImage } : {}),
    };

    await prisma.lease.update({
      where: { id: lease.id },
      data: {
        landlordSignedAt: now,
        landlordSignatureData: landlordSignatureData as unknown as Prisma.InputJsonValue,
      },
    });

    // Audit: ALL_PARTIES_SIGNED (landlord was the final signer)
    createAuditEntry({
      organizationId: lease.organizationId,
      userId: req.user!.userId,
      action: "ALL_PARTIES_SIGNED",
      entityType: "Lease",
      entityId: lease.id,
      changes: {
        note: "Landlord countersigned - all parties have signed",
        landlordName: body.fullName,
      },
      ipAddress: csClientIp,
    });

    // Regenerate lease document with landlord signature (will include certificate)
    await regenerateLeaseDocument(lease.id);

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

    if (addendum.status === "SIGNED") {
      throw new ValidationError("Cannot delete a signed addendum");
    }

    await prisma.leaseAddendum.delete({
      where: { id: param(req, "addendumId") },
    });

    res.json({ message: "Addendum deleted successfully" });
  })
);

// ─── POST /leases/:id/addendums/upload ────────────────────────────────
router.post(
  "/:id/addendums/upload",
  requireMinRole("TEAM_MEMBER"),
  leaseUpload.single("file"),
  auditLog("CREATE", "LeaseAddendum"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    if (!req.file) {
      throw new ValidationError("A document file is required");
    }

    const body = uploadAddendumSchema.parse(req.body);

    const lease = await prisma.lease.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    if (lease.status === "TERMINATED" || lease.status === "EXPIRED") {
      throw new ValidationError("Cannot add addendums to a terminated or expired lease");
    }

    const addendumId = randomUUID();
    const addendumDir = path.join(
      path.resolve(env.UPLOAD_DIR),
      "leases",
      param(req, "id"),
      "addendums",
      addendumId
    );
    fs.mkdirSync(addendumDir, { recursive: true });

    const sanitizedOriginal = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const destPath = path.join(addendumDir, sanitizedOriginal);
    fs.renameSync(req.file.path, destPath);

    const fileBuffer = fs.readFileSync(destPath);
    const documentHash = createHash("sha256").update(fileBuffer).digest("hex");

    const documentUrl = `/uploads/leases/${param(req, "id")}/addendums/${addendumId}/${sanitizedOriginal}`;

    const addendum = await prisma.leaseAddendum.create({
      data: {
        id: addendumId,
        leaseId: param(req, "id")!,
        title: body.title,
        content: body.description ?? "",
        documentUrl,
        documentHash,
        effectiveDate: body.effectiveDate,
        status: "DRAFT",
      },
    });

    res.status(201).json(addendum);
  })
);

// ─── POST /leases/:id/addendums/:addendumId/send ─────────────────────
router.post(
  "/:id/addendums/:addendumId/send",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: addendumSendParamSchema }),
  auditLog("SEND_FOR_SIGNATURE", "LeaseAddendum"),
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
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    const addendum = await prisma.leaseAddendum.findFirst({
      where: { id: param(req, "addendumId"), leaseId: param(req, "id") },
    });
    if (!addendum) {
      throw new NotFoundError("Addendum", param(req, "addendumId"));
    }

    if (addendum.status !== "DRAFT") {
      throw new ValidationError(
        `Addendum must be in DRAFT status to send for signature (currently ${addendum.status})`
      );
    }

    // Create signatures for all tenants on the lease
    const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const signingTokens: { tenantId: string; token: string; email: string; name: string }[] = [];

    for (const lt of lease.tenants) {
      const token = randomUUID();

      // Upsert to handle re-sends
      await prisma.leaseAddendumSignature.upsert({
        where: {
          addendumId_tenantId: {
            addendumId: addendum.id,
            tenantId: lt.tenant.id,
          },
        },
        create: {
          addendumId: addendum.id,
          tenantId: lt.tenant.id,
          signingToken: token,
          tokenExpiresAt: tokenExpiry,
        },
        update: {
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

    // Generate addendum document (only for text-based addendums without an uploaded file)
    if (!addendum.documentUrl) {
      const leaseTenants = lease.tenants;
      const docHtml = generateAddendumHTML({
        addendumId: addendum.id,
        organizationName: lease.organization.name,
        property: {
          address: lease.unit.property.address,
          city: lease.unit.property.city,
          state: lease.unit.property.state,
          zip: lease.unit.property.zip,
        },
        unitNumber: lease.unit.unitNumber,
        leaseStartDate: lease.startDate.toISOString(),
        addendumTitle: addendum.title,
        addendumContent: addendum.content,
        effectiveDate: addendum.effectiveDate?.toISOString() ?? null,
        tenants: leaseTenants.map((lt) => ({
          id: lt.tenant.id,
          firstName: lt.tenant.firstName,
          lastName: lt.tenant.lastName,
          email: lt.tenant.email,
          isPrimary: lt.isPrimary,
          signedAt: null,
          signatureData: null,
        })),
      });
      const { url: docUrl, hash: docHash } = saveAddendumDocument(docHtml, addendum.id);
      await prisma.leaseAddendum.update({
        where: { id: addendum.id },
        data: { documentUrl: docUrl, documentHash: docHash },
      });
    }

    // Update addendum status
    await prisma.leaseAddendum.update({
      where: { id: addendum.id },
      data: { status: "PENDING_SIGNATURE" },
    });

    // Send emails
    const propertyAddress = `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state}`;
    for (const st of signingTokens) {
      const signingUrl = `${env.PORTAL_URL}/sign/addendum/${st.token}`;
      const emailContent = buildAddendumSignatureRequestEmail({
        tenantName: st.name,
        propertyAddress,
        unitNumber: lease.unit.unitNumber,
        addendumTitle: addendum.title,
        signingUrl,
        landlordName: lease.organization.name,
      });
      sendEmail({ to: st.email, ...emailContent }).catch(() => {});
    }

    res.json({
      message: "Addendum sent for signature",
      pendingSignatures: signingTokens.map((st) => ({
        tenantId: st.tenantId,
        name: st.name,
        email: st.email,
      })),
    });
  })
);

// ─── GET /leases/:id/addendums/:addendumId ─────────────────────────
router.get(
  "/:id/addendums/:addendumId",
  validate({ params: addendumIdParamSchema }),
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
      include: {
        signatures: {
          include: {
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
    if (!addendum) {
      throw new NotFoundError("Addendum", param(req, "addendumId"));
    }

    res.json({ data: addendum });
  })
);

// ─── PATCH /leases/:id/addendums/:addendumId ───────────────────────
// Edit a draft addendum
router.patch(
  "/:id/addendums/:addendumId",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: addendumIdParamSchema, body: updateAddendumSchema }),
  auditLog("UPDATE", "LeaseAddendum"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as UpdateAddendumInput;

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

    if (addendum.status !== "DRAFT") {
      throw new ValidationError("Only DRAFT addendums can be edited");
    }

    const updated = await prisma.leaseAddendum.update({
      where: { id: addendum.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.effectiveDate !== undefined ? { effectiveDate: body.effectiveDate } : {}),
      },
    });

    res.json(updated);
  })
);

// ─── POST /leases/:id/addendums/:addendumId/void ───────────────────
// Void a pending-signature addendum
router.post(
  "/:id/addendums/:addendumId/void",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: addendumIdParamSchema }),
  auditLog("VOID", "LeaseAddendum"),
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

    if (addendum.status !== "PENDING_SIGNATURE") {
      throw new ValidationError(
        `Only PENDING_SIGNATURE addendums can be voided (currently ${addendum.status})`
      );
    }

    // Void the addendum and clear all signing tokens
    await prisma.$transaction([
      prisma.leaseAddendum.update({
        where: { id: addendum.id },
        data: { status: "VOID" },
      }),
      prisma.leaseAddendumSignature.updateMany({
        where: { addendumId: addendum.id },
        data: { signingToken: null, tokenExpiresAt: null },
      }),
    ]);

    res.json({ message: "Addendum voided successfully" });
  })
);

// ─── POST /leases/:id/addendums/:addendumId/resend ─────────────────
// Resend signing emails for pending-signature addendums
router.post(
  "/:id/addendums/:addendumId/resend",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: addendumIdParamSchema }),
  auditLog("RESEND_SIGNATURE", "LeaseAddendum"),
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
      },
    });
    if (!lease) {
      throw new NotFoundError("Lease", param(req, "id"));
    }

    const addendum = await prisma.leaseAddendum.findFirst({
      where: {
        id: param(req, "addendumId"),
        leaseId: param(req, "id"),
      },
      include: {
        signatures: {
          include: {
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
    if (!addendum) {
      throw new NotFoundError("Addendum", param(req, "addendumId"));
    }

    if (addendum.status !== "PENDING_SIGNATURE") {
      throw new ValidationError("Can only resend for PENDING_SIGNATURE addendums");
    }

    const unsignedSigs = addendum.signatures.filter((s) => !s.signedAt);
    const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const propertyAddress = `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state}`;

    for (const sig of unsignedSigs) {
      const token = randomUUID();
      await prisma.leaseAddendumSignature.update({
        where: { id: sig.id },
        data: { signingToken: token, tokenExpiresAt: tokenExpiry },
      });

      const signingUrl = `${env.PORTAL_URL}/sign/addendum/${token}`;
      const emailContent = buildAddendumSignatureRequestEmail({
        tenantName: `${sig.tenant.firstName} ${sig.tenant.lastName}`,
        propertyAddress,
        unitNumber: lease.unit.unitNumber,
        addendumTitle: addendum.title,
        signingUrl,
        landlordName: lease.organization.name,
      });
      sendEmail({ to: sig.tenant.email, ...emailContent }).catch(() => {});
    }

    res.json({
      message: `Signing emails resent to ${unsignedSigs.length} tenant(s)`,
      resentTo: unsignedSigs.map((s) => s.tenant.email),
    });
  })
);

// ─── POST /leases/:id/addendums/:addendumId/countersign ────────────
// Landlord countersigns after all tenants have signed
router.post(
  "/:id/addendums/:addendumId/countersign",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: addendumIdParamSchema, body: countersignAddendumSchema }),
  auditLog("COUNTERSIGN", "LeaseAddendum"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as {
      fullName: string;
      signatureImage?: string;
      signingMetadata?: {
        screenResolution?: string;
        timezone?: string;
        browserLanguage?: string;
        platform?: string;
        pageOpenedAt?: string;
        consent1CheckedAt?: string;
        consent2CheckedAt?: string;
        nameTypedAt?: string;
        signedAt?: string;
        totalViewTimeSeconds?: number;
      };
    };

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

    if (addendum.status !== "SIGNED") {
      throw new ValidationError("Addendum must be SIGNED (by all tenants) to countersign");
    }

    if (addendum.landlordSignedAt) {
      throw new ValidationError("Landlord has already countersigned this addendum");
    }

    const now = new Date();
    const csClientIp = getClientIp(req);
    const csIpCountry = getClientCountry(req);
    const csMetadata = body.signingMetadata ?? {};

    const landlordSignatureData = {
      fullName: body.fullName,
      email: req.user?.email ?? "",
      ipAddress: csClientIp,
      ipCountry: csIpCountry ?? undefined,
      ip: csClientIp,
      userAgent: req.headers["user-agent"] ?? "unknown",
      screenResolution: csMetadata.screenResolution ?? undefined,
      timezone: csMetadata.timezone ?? undefined,
      browserLanguage: csMetadata.browserLanguage ?? undefined,
      platform: csMetadata.platform ?? undefined,
      pageOpenedAt: csMetadata.pageOpenedAt ?? undefined,
      consent1CheckedAt: csMetadata.consent1CheckedAt ?? undefined,
      consent2CheckedAt: csMetadata.consent2CheckedAt ?? undefined,
      nameTypedAt: csMetadata.nameTypedAt ?? undefined,
      signedAt: now.toISOString(),
      totalViewTimeSeconds: csMetadata.totalViewTimeSeconds ?? undefined,
      documentHash: addendum.documentHash ?? "",
      timestamp: now.toISOString(),
      ...(body.signatureImage ? { signatureImage: body.signatureImage } : {}),
    };

    await prisma.leaseAddendum.update({
      where: { id: addendum.id },
      data: {
        landlordSignedAt: now,
        landlordSignatureData: landlordSignatureData as unknown as Prisma.InputJsonValue,
      },
    });

    createAuditEntry({
      organizationId: orgId,
      userId: req.user!.userId,
      action: "ALL_PARTIES_SIGNED",
      entityType: "LeaseAddendum",
      entityId: addendum.id,
      changes: {
        note: "Landlord countersigned addendum - all parties have signed",
        landlordName: body.fullName,
      },
      ipAddress: csClientIp,
    });

    // Regenerate addendum document with landlord signature and certificate
    await regenerateAddendumDocument(addendum.id);

    res.json({
      message: "Addendum countersigned successfully",
      landlordSignedAt: now.toISOString(),
    });
  })
);

export default router;
