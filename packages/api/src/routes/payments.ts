import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/async-handler.js";
import {
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";
import { getPaginationMeta } from "../lib/pagination.js";
import { param } from "../lib/params.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { tenancy } from "../middleware/tenancy.js";
import { requireMinRole } from "../middleware/rbac.js";
import { auditLog } from "../middleware/audit.js";
import {
  createPaymentSchema,
  recordManualPaymentSchema,
  paymentListQuerySchema,
  paymentIdParamSchema,
  savePaymentMethodSchema,
  paymentMethodIdParamSchema,
  assessLateFeeSchema,
  lateFeeIdParamSchema,
} from "../schemas/payments.js";
import type {
  CreatePaymentInput,
  RecordManualPaymentInput,
  PaymentListQuery,
  SavePaymentMethodInput,
  AssessLateFeeInput,
} from "../schemas/payments.js";
import {
  createPaymentIntent,
  refundPayment,
} from "../lib/stripe.js";

const router = Router();

router.use(authenticate, tenancy);

// ─── GET /payments ──────────────────────────────────────────────────
router.get(
  "/",
  validate({ query: paymentListQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const query = req.query as unknown as PaymentListQuery;
    const { page, limit, sortBy, sortOrder, status, leaseId, tenantId, method } =
      query;

    const where: Record<string, unknown> = {
      organizationId: orgId,
      ...(status ? { status } : {}),
      ...(leaseId ? { leaseId } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(method ? { method } : {}),
    };

    const orderBy = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: sortOrder };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          lease: {
            select: {
              id: true,
              monthlyRent: true,
              unit: {
                select: {
                  id: true,
                  unitNumber: true,
                  property: { select: { id: true, name: true } },
                },
              },
            },
          },
          tenant: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          lateFees: true,
        },
        orderBy,
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

// ─── POST /payments — Stripe-backed payment (ACH or card) ──────────
router.post(
  "/",
  validate({ body: createPaymentSchema }),
  auditLog("CREATE", "Payment"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreatePaymentInput;

    // Validate lease belongs to org and is active
    const lease = await prisma.lease.findFirst({
      where: { id: body.leaseId, organizationId: orgId, status: "ACTIVE" },
    });
    if (!lease) {
      throw new NotFoundError("Lease", body.leaseId);
    }

    // Validate tenant is on this lease
    const leaseTenant = await prisma.leaseTenant.findFirst({
      where: { leaseId: body.leaseId, tenantId: body.tenantId },
    });
    if (!leaseTenant) {
      throw new ValidationError(
        "This tenant is not associated with the specified lease"
      );
    }

    if (body.method === "MANUAL") {
      throw new ValidationError(
        "Use POST /payments/manual for manual payments"
      );
    }

    // Get payment method from Stripe
    let stripePaymentMethodId: string | undefined;
    if (body.paymentMethodId) {
      const pm = await prisma.paymentMethodRecord.findFirst({
        where: { id: body.paymentMethodId, tenantId: body.tenantId },
      });
      if (!pm) {
        throw new NotFoundError("PaymentMethod", body.paymentMethodId);
      }
      stripePaymentMethodId = pm.stripePaymentMethodId ?? undefined;
    }

    if (!stripePaymentMethodId) {
      throw new ValidationError(
        "A payment method with a valid Stripe ID is required for ACH/card payments"
      );
    }

    // Create Stripe PaymentIntent
    const intent = await createPaymentIntent({
      amount: body.amount,
      stripePaymentMethodId,
      metadata: {
        organizationId: orgId,
        leaseId: body.leaseId,
        tenantId: body.tenantId,
      },
    });

    const stripeFee = intent.latest_charge
      ? 0 // Will be updated by webhook when charge finalizes
      : null;

    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        leaseId: body.leaseId,
        tenantId: body.tenantId,
        amount: body.amount,
        method: body.method,
        status:
          intent.status === "succeeded" ? "COMPLETED" : "PROCESSING",
        stripePaymentIntentId: intent.id,
        stripeFee: stripeFee,
        netAmount:
          intent.status === "succeeded"
            ? body.amount - (stripeFee ?? 0)
            : null,
        paidAt: intent.status === "succeeded" ? new Date() : null,
      },
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
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    res.status(201).json({
      ...payment,
      stripeClientSecret: intent.client_secret,
    });
  })
);

// ─── POST /payments/manual — Record a manual payment ────────────────
router.post(
  "/manual",
  requireMinRole("TEAM_MEMBER"),
  validate({ body: recordManualPaymentSchema }),
  auditLog("CREATE", "Payment"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as RecordManualPaymentInput;

    const lease = await prisma.lease.findFirst({
      where: { id: body.leaseId, organizationId: orgId, status: "ACTIVE" },
    });
    if (!lease) {
      throw new NotFoundError("Lease", body.leaseId);
    }

    const leaseTenant = await prisma.leaseTenant.findFirst({
      where: { leaseId: body.leaseId, tenantId: body.tenantId },
    });
    if (!leaseTenant) {
      throw new ValidationError(
        "This tenant is not associated with the specified lease"
      );
    }

    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        leaseId: body.leaseId,
        tenantId: body.tenantId,
        amount: body.amount,
        method: "MANUAL",
        status: "COMPLETED",
        netAmount: body.amount,
        paidAt: body.paidAt ?? new Date(),
      },
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
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    res.status(201).json(payment);
  })
);

// ─── GET /payments/:id ──────────────────────────────────────────────
router.get(
  "/:id",
  validate({ params: paymentIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const payment = await prisma.payment.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        lease: {
          select: {
            id: true,
            monthlyRent: true,
            startDate: true,
            endDate: true,
            unit: {
              select: {
                id: true,
                unitNumber: true,
                property: {
                  select: { id: true, name: true, address: true },
                },
              },
            },
          },
        },
        tenant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        lateFees: true,
      },
    });

    if (!payment) {
      throw new NotFoundError("Payment", param(req, "id"));
    }

    res.json(payment);
  })
);

// ─── POST /payments/:id/refund ──────────────────────────────────────
router.post(
  "/:id/refund",
  requireMinRole("OWNER"),
  validate({ params: paymentIdParamSchema }),
  auditLog("REFUND", "Payment"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const payment = await prisma.payment.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!payment) {
      throw new NotFoundError("Payment", param(req, "id"));
    }

    if (payment.status !== "COMPLETED") {
      throw new ValidationError(
        "Only completed payments can be refunded"
      );
    }

    // Refund through Stripe if it was a Stripe payment
    if (payment.stripePaymentIntentId) {
      await refundPayment(payment.stripePaymentIntentId);
    }

    const updated = await prisma.payment.update({
      where: { id: param(req, "id") },
      data: { status: "REFUNDED" },
    });

    res.json({ ...updated, message: "Payment refunded successfully" });
  })
);

// ─── Payment Methods ────────────────────────────────────────────────

// GET /payments/methods
router.get(
  "/methods/list",
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const tenantId = req.query["tenantId"] as string | undefined;

    const where: Record<string, unknown> = {};
    if (tenantId) {
      // Validate tenant belongs to org
      const tenant = await prisma.tenant.findFirst({
        where: { id: tenantId, organizationId: orgId },
        select: { id: true },
      });
      if (!tenant) {
        throw new NotFoundError("Tenant", tenantId);
      }
      where["tenantId"] = tenantId;
    } else {
      // Return all payment methods for org tenants
      where["tenant"] = { organizationId: orgId };
    }

    const methods = await prisma.paymentMethodRecord.findMany({
      where,
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { isDefault: "desc" },
    });

    res.json({ data: methods });
  })
);

// POST /payments/methods
router.post(
  "/methods",
  requireMinRole("TEAM_MEMBER"),
  validate({ body: savePaymentMethodSchema }),
  auditLog("CREATE", "PaymentMethod"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as SavePaymentMethodInput;

    const tenant = await prisma.tenant.findFirst({
      where: { id: body.tenantId, organizationId: orgId },
    });
    if (!tenant) {
      throw new NotFoundError("Tenant", body.tenantId);
    }

    // If setting as default, unset other defaults
    if (body.isDefault) {
      await prisma.paymentMethodRecord.updateMany({
        where: { tenantId: body.tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const method = await prisma.paymentMethodRecord.create({
      data: {
        tenantId: body.tenantId,
        type: body.type,
        stripePaymentMethodId: body.stripePaymentMethodId,
        last4: body.last4,
        bankName: body.bankName,
        isDefault: body.isDefault,
        isAutoPay: body.isAutoPay,
      },
    });

    res.status(201).json(method);
  })
);

// DELETE /payments/methods/:id
router.delete(
  "/methods/:id",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: paymentMethodIdParamSchema }),
  auditLog("DELETE", "PaymentMethod"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const method = await prisma.paymentMethodRecord.findFirst({
      where: { id: param(req, "id") },
      include: { tenant: { select: { organizationId: true } } },
    });
    if (!method || method.tenant.organizationId !== orgId) {
      throw new NotFoundError("PaymentMethod", param(req, "id"));
    }

    await prisma.paymentMethodRecord.delete({
      where: { id: param(req, "id") },
    });

    res.json({ message: "Payment method removed successfully" });
  })
);

// ─── Late Fees ──────────────────────────────────────────────────────

// POST /payments/late-fees — Assess a late fee on a lease
router.post(
  "/late-fees",
  requireMinRole("TEAM_MEMBER"),
  validate({ body: assessLateFeeSchema }),
  auditLog("CREATE", "LateFee"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as AssessLateFeeInput;

    const lease = await prisma.lease.findFirst({
      where: { id: body.leaseId, organizationId: orgId, status: "ACTIVE" },
    });
    if (!lease) {
      throw new NotFoundError("Lease", body.leaseId);
    }

    // Determine late fee amount from lease settings or override
    let feeAmount = body.amount;
    if (!feeAmount) {
      if (!lease.lateFeeAmount) {
        throw new ValidationError(
          "No late fee amount configured on this lease. Provide an explicit amount."
        );
      }
      if (lease.lateFeeType === "PERCENTAGE") {
        feeAmount = Number(lease.monthlyRent) * (Number(lease.lateFeeAmount) / 100);
      } else {
        feeAmount = Number(lease.lateFeeAmount);
      }
    }

    const lateFee = await prisma.lateFee.create({
      data: {
        organizationId: orgId,
        leaseId: body.leaseId,
        amount: feeAmount,
        assessedDate: new Date(),
      },
      include: {
        lease: {
          select: {
            id: true,
            monthlyRent: true,
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
    });

    res.status(201).json(lateFee);
  })
);

// POST /payments/late-fees/:id/waive
router.post(
  "/late-fees/:id/waive",
  requireMinRole("OWNER"),
  validate({ params: lateFeeIdParamSchema }),
  auditLog("WAIVE", "LateFee"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const lateFee = await prisma.lateFee.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!lateFee) {
      throw new NotFoundError("LateFee", param(req, "id"));
    }

    if (lateFee.paidDate) {
      throw new ValidationError("Cannot waive a late fee that has been paid");
    }

    if (lateFee.waived) {
      throw new ValidationError("This late fee has already been waived");
    }

    const updated = await prisma.lateFee.update({
      where: { id: param(req, "id") },
      data: { waived: true },
    });

    res.json({ ...updated, message: "Late fee waived successfully" });
  })
);

// GET /payments/late-fees — List late fees
router.get(
  "/late-fees/list",
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const leaseId = req.query["leaseId"] as string | undefined;

    const where: Record<string, unknown> = {
      organizationId: orgId,
      ...(leaseId ? { leaseId } : {}),
    };

    const lateFees = await prisma.lateFee.findMany({
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
        payment: {
          select: { id: true, status: true, paidAt: true },
        },
      },
      orderBy: { assessedDate: "desc" },
    });

    res.json({ data: lateFees });
  })
);

export default router;
