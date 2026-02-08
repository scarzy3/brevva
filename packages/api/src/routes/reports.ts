import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/async-handler.js";
import { NotFoundError } from "../lib/errors.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { tenancy } from "../middleware/tenancy.js";
import { requireMinRole } from "../middleware/rbac.js";
import { reportQuerySchema } from "../schemas/reports.js";
import type { ReportQuery } from "../schemas/reports.js";

const router = Router();

router.use(authenticate, tenancy, requireMinRole("OWNER"));

// ═══════════════════════════════════════════════════════════════════
// Profit & Loss Report
// ═══════════════════════════════════════════════════════════════════

// GET /reports/profit-loss
router.get(
  "/profit-loss",
  validate({ query: reportQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const { year, month, propertyId } = req.query as unknown as ReportQuery;

    let startDate: Date;
    let endDate: Date;
    if (month) {
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 1);
    } else {
      startDate = new Date(year, 0, 1);
      endDate = new Date(year + 1, 0, 1);
    }

    const baseWhere = {
      organizationId: orgId,
      date: { gte: startDate, lt: endDate },
      ...(propertyId ? { propertyId } : {}),
    };

    // All transactions in the period
    const transactions = await prisma.transaction.findMany({
      where: baseWhere,
      select: {
        type: true,
        category: true,
        subcategory: true,
        amount: true,
        property: { select: { id: true, name: true } },
      },
    });

    // Build income breakdown
    const incomeByCategory = new Map<string, number>();
    let totalIncome = 0;

    // Build expense breakdown
    const expenseByCategory = new Map<string, number>();
    let totalExpenses = 0;

    for (const txn of transactions) {
      const amount = Number(txn.amount);
      if (txn.type === "INCOME") {
        totalIncome += amount;
        incomeByCategory.set(
          txn.category,
          (incomeByCategory.get(txn.category) ?? 0) + amount
        );
      } else {
        totalExpenses += amount;
        expenseByCategory.set(
          txn.category,
          (expenseByCategory.get(txn.category) ?? 0) + amount
        );
      }
    }

    // Rent collected (from payments)
    const rentCollected = await prisma.payment.aggregate({
      where: {
        organizationId: orgId,
        status: "COMPLETED",
        paidAt: { gte: startDate, lt: endDate },
      },
      _sum: { amount: true },
    });

    res.json({
      period: {
        year,
        month: month ?? null,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      propertyId: propertyId ?? null,
      income: {
        total: totalIncome,
        byCategory: Object.fromEntries(
          [...incomeByCategory.entries()].sort((a, b) => b[1] - a[1])
        ),
      },
      expenses: {
        total: totalExpenses,
        byCategory: Object.fromEntries(
          [...expenseByCategory.entries()].sort((a, b) => b[1] - a[1])
        ),
      },
      rentCollected: Number(rentCollected._sum.amount ?? 0),
      netIncome: totalIncome - totalExpenses,
      profitMargin:
        totalIncome > 0
          ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 1000) / 10
          : 0,
    });
  })
);

// ═══════════════════════════════════════════════════════════════════
// Rent Roll Report
// ═══════════════════════════════════════════════════════════════════

// GET /reports/rent-roll
router.get(
  "/rent-roll",
  validate({ query: reportQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const { propertyId } = req.query as unknown as ReportQuery;

    // Get all properties (or specific)
    const properties = await prisma.property.findMany({
      where: {
        organizationId: orgId,
        status: { not: "ARCHIVED" },
        ...(propertyId ? { id: propertyId } : {}),
      },
      select: { id: true, name: true, address: true },
      orderBy: { name: "asc" },
    });

    if (properties.length === 0 && propertyId) {
      throw new NotFoundError("Property", propertyId);
    }

    const rentRoll = await Promise.all(
      properties.map(async (property) => {
        const units = await prisma.unit.findMany({
          where: { propertyId: property.id, organizationId: orgId },
          include: {
            currentTenants: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                moveInDate: true,
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
                securityDeposit: true,
                status: true,
              },
            },
          },
          orderBy: { unitNumber: "asc" },
        });

        let totalMarketRent = 0;
        let totalActualRent = 0;
        let occupiedCount = 0;
        let vacantCount = 0;

        const unitRows = units.map((unit) => {
          const activeLease = unit.leases[0] ?? null;
          const marketRent = Number(unit.rent);
          const actualRent = activeLease ? Number(activeLease.monthlyRent) : 0;

          totalMarketRent += marketRent;
          if (unit.status === "OCCUPIED") {
            totalActualRent += actualRent;
            occupiedCount++;
          } else {
            vacantCount++;
          }

          return {
            unitId: unit.id,
            unitNumber: unit.unitNumber,
            bedrooms: unit.bedrooms,
            bathrooms: Number(unit.bathrooms),
            sqFt: unit.sqFt,
            status: unit.status,
            marketRent,
            actualRent,
            deposit: unit.deposit ? Number(unit.deposit) : null,
            lease: activeLease
              ? {
                  id: activeLease.id,
                  startDate: activeLease.startDate,
                  endDate: activeLease.endDate,
                  securityDeposit: Number(activeLease.securityDeposit),
                }
              : null,
            tenants: unit.currentTenants,
          };
        });

        return {
          property: {
            id: property.id,
            name: property.name,
            address: property.address,
          },
          units: unitRows,
          summary: {
            totalUnits: units.length,
            occupied: occupiedCount,
            vacant: vacantCount,
            occupancyRate:
              units.length > 0
                ? Math.round((occupiedCount / units.length) * 1000) / 10
                : 0,
            totalMarketRent,
            totalActualRent,
            potentialLoss: totalMarketRent - totalActualRent,
          },
        };
      })
    );

    // Grand totals
    const grandTotals = rentRoll.reduce(
      (acc, p) => ({
        totalUnits: acc.totalUnits + p.summary.totalUnits,
        occupied: acc.occupied + p.summary.occupied,
        vacant: acc.vacant + p.summary.vacant,
        totalMarketRent: acc.totalMarketRent + p.summary.totalMarketRent,
        totalActualRent: acc.totalActualRent + p.summary.totalActualRent,
      }),
      { totalUnits: 0, occupied: 0, vacant: 0, totalMarketRent: 0, totalActualRent: 0 }
    );

    res.json({
      properties: rentRoll,
      totals: {
        ...grandTotals,
        occupancyRate:
          grandTotals.totalUnits > 0
            ? Math.round((grandTotals.occupied / grandTotals.totalUnits) * 1000) / 10
            : 0,
        potentialLoss: grandTotals.totalMarketRent - grandTotals.totalActualRent,
      },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════
// Cash Flow Report
// ═══════════════════════════════════════════════════════════════════

// GET /reports/cash-flow
router.get(
  "/cash-flow",
  validate({ query: reportQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const { year, propertyId } = req.query as unknown as ReportQuery;

    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    // Get all transactions for the year
    const transactions = await prisma.transaction.findMany({
      where: {
        organizationId: orgId,
        date: { gte: startOfYear, lt: endOfYear },
        ...(propertyId ? { propertyId } : {}),
      },
      select: {
        type: true,
        category: true,
        amount: true,
        date: true,
      },
      orderBy: { date: "asc" },
    });

    // Get all payments for the year
    const payments = await prisma.payment.findMany({
      where: {
        organizationId: orgId,
        status: "COMPLETED",
        paidAt: { gte: startOfYear, lt: endOfYear },
      },
      select: {
        amount: true,
        netAmount: true,
        stripeFee: true,
        paidAt: true,
      },
    });

    // Build monthly breakdown
    const months: Array<{
      month: number;
      monthName: string;
      income: number;
      expenses: number;
      rentCollected: number;
      processingFees: number;
      netCashFlow: number;
    }> = [];

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(year, m, 1);
      const monthEnd = new Date(year, m + 1, 1);

      let income = 0;
      let expenses = 0;
      for (const txn of transactions) {
        const txnDate = new Date(txn.date);
        if (txnDate >= monthStart && txnDate < monthEnd) {
          if (txn.type === "INCOME") income += Number(txn.amount);
          else expenses += Number(txn.amount);
        }
      }

      let rentCollected = 0;
      let processingFees = 0;
      for (const pmt of payments) {
        if (pmt.paidAt) {
          const pmtDate = new Date(pmt.paidAt);
          if (pmtDate >= monthStart && pmtDate < monthEnd) {
            rentCollected += Number(pmt.amount);
            processingFees += Number(pmt.stripeFee ?? 0);
          }
        }
      }

      months.push({
        month: m + 1,
        monthName: monthNames[m]!,
        income,
        expenses,
        rentCollected,
        processingFees,
        netCashFlow: income - expenses - processingFees,
      });
    }

    // Annual totals
    const annualTotals = months.reduce(
      (acc, m) => ({
        income: acc.income + m.income,
        expenses: acc.expenses + m.expenses,
        rentCollected: acc.rentCollected + m.rentCollected,
        processingFees: acc.processingFees + m.processingFees,
        netCashFlow: acc.netCashFlow + m.netCashFlow,
      }),
      { income: 0, expenses: 0, rentCollected: 0, processingFees: 0, netCashFlow: 0 }
    );

    // Operating expense ratio
    const operatingExpenseRatio =
      annualTotals.income > 0
        ? Math.round((annualTotals.expenses / annualTotals.income) * 1000) / 10
        : 0;

    res.json({
      year,
      propertyId: propertyId ?? null,
      months,
      totals: annualTotals,
      metrics: {
        operatingExpenseRatio,
        averageMonthlyIncome: Math.round(annualTotals.income / 12 * 100) / 100,
        averageMonthlyExpenses: Math.round(annualTotals.expenses / 12 * 100) / 100,
        averageNetCashFlow: Math.round(annualTotals.netCashFlow / 12 * 100) / 100,
      },
    });
  })
);

export default router;
