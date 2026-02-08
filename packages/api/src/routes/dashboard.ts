import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/async-handler.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { tenancy } from "../middleware/tenancy.js";
import { requireMinRole } from "../middleware/rbac.js";
import { dashboardQuerySchema } from "../schemas/reports.js";
import type { DashboardQuery } from "../schemas/reports.js";

const router = Router();

router.use(authenticate, tenancy, requireMinRole("TEAM_MEMBER"));

// ─── GET /dashboard ─────────────────────────────────────────────────
// Owner/team dashboard with KPIs and recent activity
router.get(
  "/",
  validate({ query: dashboardQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const query = req.query as unknown as DashboardQuery;
    const propertyFilter = query.propertyId
      ? { propertyId: query.propertyId }
      : {};

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // ── KPIs ──────────────────────────────────────────────────────────
    const [
      propertyCount,
      unitCounts,
      tenantCounts,
      leaseCounts,
      monthlyIncome,
      monthlyExpenses,
      monthlyPayments,
      openMaintenanceCount,
      unreadMessages,
    ] = await Promise.all([
      // Total properties
      prisma.property.count({
        where: {
          organizationId: orgId,
          status: { not: "ARCHIVED" },
          ...(query.propertyId ? { id: query.propertyId } : {}),
        },
      }),

      // Unit statuses
      prisma.unit.groupBy({
        by: ["status"],
        where: { organizationId: orgId, ...propertyFilter },
        _count: true,
      }),

      // Tenant statuses
      prisma.tenant.groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: true,
      }),

      // Lease statuses
      prisma.lease.groupBy({
        by: ["status"],
        where: { organizationId: orgId, ...({ unit: propertyFilter } as Record<string, unknown>) },
        _count: true,
      }),

      // This month's income
      prisma.transaction.aggregate({
        where: {
          organizationId: orgId,
          type: "INCOME",
          date: { gte: startOfMonth, lt: startOfNextMonth },
          ...propertyFilter,
        },
        _sum: { amount: true },
      }),

      // This month's expenses
      prisma.transaction.aggregate({
        where: {
          organizationId: orgId,
          type: "EXPENSE",
          date: { gte: startOfMonth, lt: startOfNextMonth },
          ...propertyFilter,
        },
        _sum: { amount: true },
      }),

      // This month's payments received
      prisma.payment.aggregate({
        where: {
          organizationId: orgId,
          status: "COMPLETED",
          paidAt: { gte: startOfMonth, lt: startOfNextMonth },
        },
        _sum: { amount: true },
        _count: true,
      }),

      // Open maintenance requests
      prisma.maintenanceRequest.count({
        where: {
          organizationId: orgId,
          status: { notIn: ["COMPLETED", "CLOSED"] },
          ...propertyFilter,
        },
      }),

      // Unread messages
      prisma.message.count({
        where: {
          organizationId: orgId,
          recipientId: req.user!.userId,
          readAt: null,
        },
      }),
    ]);

    // Compute unit status map
    const unitStatusMap: Record<string, number> = {};
    let totalUnits = 0;
    for (const g of unitCounts) {
      unitStatusMap[g.status] = g._count;
      totalUnits += g._count;
    }

    // Compute occupancy rate
    const occupiedUnits = unitStatusMap["OCCUPIED"] ?? 0;
    const occupancyRate = totalUnits > 0 ? occupiedUnits / totalUnits : 0;

    // Expected monthly rent from active leases
    const expectedRent = await prisma.lease.aggregate({
      where: {
        organizationId: orgId,
        status: "ACTIVE",
        ...({ unit: propertyFilter } as Record<string, unknown>),
      },
      _sum: { monthlyRent: true },
    });

    const expectedRentAmount = Number(expectedRent._sum.monthlyRent ?? 0);
    const collectedAmount = Number(monthlyPayments._sum.amount ?? 0);
    const collectionRate = expectedRentAmount > 0
      ? collectedAmount / expectedRentAmount
      : 0;

    // Outstanding late fees
    const outstandingLateFees = await prisma.lateFee.aggregate({
      where: {
        organizationId: orgId,
        waived: false,
        paidDate: null,
      },
      _sum: { amount: true },
      _count: true,
    });

    // ── Recent Activity ───────────────────────────────────────────────
    const [
      recentPayments,
      recentMaintenanceRequests,
      leasesExpiringSoon,
      recentAuditLogs,
    ] = await Promise.all([
      // Recent payments
      prisma.payment.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          amount: true,
          status: true,
          method: true,
          paidAt: true,
          createdAt: true,
          tenant: {
            select: { id: true, firstName: true, lastName: true },
          },
          lease: {
            select: {
              unit: {
                select: {
                  unitNumber: true,
                  property: { select: { name: true } },
                },
              },
            },
          },
        },
      }),

      // Recent maintenance requests
      prisma.maintenanceRequest.findMany({
        where: {
          organizationId: orgId,
          ...propertyFilter,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true,
          tenant: {
            select: { firstName: true, lastName: true },
          },
          unit: {
            select: {
              unitNumber: true,
              property: { select: { name: true } },
            },
          },
        },
      }),

      // Leases expiring in the next 60 days
      prisma.lease.findMany({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          endDate: {
            gte: now,
            lte: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { endDate: "asc" },
        take: 10,
        select: {
          id: true,
          endDate: true,
          monthlyRent: true,
          unit: {
            select: {
              unitNumber: true,
              property: { select: { name: true } },
            },
          },
          tenants: {
            where: { isPrimary: true },
            include: {
              tenant: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      }),

      // Recent audit logs
      prisma.auditLog.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
    ]);

    res.json({
      kpis: {
        properties: propertyCount,
        units: {
          total: totalUnits,
          byStatus: unitStatusMap,
          occupancyRate: Math.round(occupancyRate * 1000) / 10,
        },
        tenants: {
          byStatus: Object.fromEntries(
            tenantCounts.map((g) => [g.status, g._count])
          ),
        },
        leases: {
          byStatus: Object.fromEntries(
            leaseCounts.map((g) => [g.status, g._count])
          ),
        },
        financials: {
          monthlyIncome: Number(monthlyIncome._sum.amount ?? 0),
          monthlyExpenses: Number(monthlyExpenses._sum.amount ?? 0),
          netIncome:
            Number(monthlyIncome._sum.amount ?? 0) -
            Number(monthlyExpenses._sum.amount ?? 0),
          expectedRent: expectedRentAmount,
          collectedRent: collectedAmount,
          collectionRate: Math.round(collectionRate * 1000) / 10,
          paymentsThisMonth: monthlyPayments._count,
        },
        outstandingLateFees: {
          total: Number(outstandingLateFees._sum.amount ?? 0),
          count: outstandingLateFees._count,
        },
        openMaintenanceRequests: openMaintenanceCount,
        unreadMessages,
      },
      recentActivity: {
        payments: recentPayments,
        maintenanceRequests: recentMaintenanceRequests,
        leasesExpiringSoon,
        auditLog: recentAuditLogs,
      },
    });
  })
);

export default router;
