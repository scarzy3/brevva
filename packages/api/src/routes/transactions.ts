import { Router } from "express";
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
  createTransactionSchema,
  updateTransactionSchema,
  transactionListQuerySchema,
  transactionIdParamSchema,
  createRecurringTemplateSchema,
  recurringTemplateIdParamSchema,
  createExpenseCategorySchema,
  expenseCategoryIdParamSchema,
  scheduleEQuerySchema,
} from "../schemas/transactions.js";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  TransactionListQuery,
  CreateRecurringTemplateInput,
  CreateExpenseCategoryInput,
  ScheduleEQuery,
} from "../schemas/transactions.js";

const router = Router();

router.use(authenticate, tenancy);

// ═══════════════════════════════════════════════════════════════════
// Transactions CRUD
// ═══════════════════════════════════════════════════════════════════

// GET /transactions
router.get(
  "/",
  validate({ query: transactionListQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const query = req.query as unknown as TransactionListQuery;
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      type,
      category,
      propertyId,
      unitId,
      tenantId,
      vendorId,
      startDate,
      endDate,
    } = query;

    const where: Record<string, unknown> = {
      organizationId: orgId,
      ...(type ? { type } : {}),
      ...(category ? { category } : {}),
      ...(propertyId ? { propertyId } : {}),
      ...(unitId ? { unitId } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(vendorId ? { vendorId } : {}),
    };

    if (startDate || endDate) {
      where["date"] = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const orderBy = sortBy
      ? { [sortBy]: sortOrder }
      : { date: sortOrder };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          property: {
            select: { id: true, name: true, address: true },
          },
          unit: {
            select: { id: true, unitNumber: true },
          },
          tenant: {
            select: { id: true, firstName: true, lastName: true },
          },
          vendor: {
            select: { id: true, companyName: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      data: transactions,
      pagination: getPaginationMeta(total, page, limit),
    });
  })
);

// POST /transactions
router.post(
  "/",
  requireMinRole("TEAM_MEMBER"),
  validate({ body: createTransactionSchema }),
  auditLog("CREATE", "Transaction"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreateTransactionInput;

    // Validate property belongs to org
    const property = await prisma.property.findFirst({
      where: { id: body.propertyId, organizationId: orgId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundError("Property", body.propertyId);
    }

    // Validate unit if provided
    if (body.unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: body.unitId, propertyId: body.propertyId, organizationId: orgId },
        select: { id: true },
      });
      if (!unit) {
        throw new NotFoundError("Unit", body.unitId);
      }
    }

    const transaction = await prisma.transaction.create({
      data: {
        organizationId: orgId,
        propertyId: body.propertyId,
        unitId: body.unitId,
        tenantId: body.tenantId,
        vendorId: body.vendorId,
        type: body.type,
        category: body.category,
        subcategory: body.subcategory,
        amount: body.amount,
        date: body.date,
        description: body.description,
        receiptUrl: body.receiptUrl,
      },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
    });

    res.status(201).json(transaction);
  })
);

// GET /transactions/:id
router.get(
  "/:id",
  validate({ params: transactionIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const transaction = await prisma.transaction.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        property: {
          select: { id: true, name: true, address: true },
        },
        unit: { select: { id: true, unitNumber: true } },
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        vendor: {
          select: { id: true, companyName: true, contactName: true },
        },
        recurringTemplate: true,
      },
    });

    if (!transaction) {
      throw new NotFoundError("Transaction", param(req, "id"));
    }

    res.json(transaction);
  })
);

// PATCH /transactions/:id
router.patch(
  "/:id",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: transactionIdParamSchema, body: updateTransactionSchema }),
  auditLog("UPDATE", "Transaction"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as UpdateTransactionInput;

    const existing = await prisma.transaction.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("Transaction", param(req, "id"));
    }

    const transaction = await prisma.transaction.update({
      where: { id: param(req, "id") },
      data: body,
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
    });

    res.json(transaction);
  })
);

// DELETE /transactions/:id
router.delete(
  "/:id",
  requireMinRole("OWNER"),
  validate({ params: transactionIdParamSchema }),
  auditLog("DELETE", "Transaction"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const existing = await prisma.transaction.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundError("Transaction", param(req, "id"));
    }

    await prisma.transaction.delete({
      where: { id: param(req, "id") },
    });

    res.json({ message: "Transaction deleted successfully" });
  })
);

// ─── Summary ────────────────────────────────────────────────────────

// GET /transactions/summary — Aggregate income vs expenses
router.get(
  "/summary/totals",
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const propertyId = req.query["propertyId"] as string | undefined;
    const year = Number(req.query["year"]) || new Date().getFullYear();

    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    const where: Record<string, unknown> = {
      organizationId: orgId,
      date: { gte: startOfYear, lt: endOfYear },
      ...(propertyId ? { propertyId } : {}),
    };

    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...where, type: "INCOME" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { ...where, type: "EXPENSE" },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const totalIncome = Number(incomeAgg._sum.amount ?? 0);
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0);

    res.json({
      year,
      propertyId: propertyId ?? null,
      income: {
        total: totalIncome,
        count: incomeAgg._count,
      },
      expenses: {
        total: totalExpenses,
        count: expenseAgg._count,
      },
      netIncome: totalIncome - totalExpenses,
    });
  })
);

// ═══════════════════════════════════════════════════════════════════
// Recurring Templates
// ═══════════════════════════════════════════════════════════════════

// GET /transactions/recurring
router.get(
  "/recurring/list",
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const templates = await prisma.recurringTemplate.findMany({
      where: { organizationId: orgId },
      orderBy: { nextDate: "asc" },
    });

    res.json({ data: templates });
  })
);

// POST /transactions/recurring
router.post(
  "/recurring",
  requireMinRole("TEAM_MEMBER"),
  validate({ body: createRecurringTemplateSchema }),
  auditLog("CREATE", "RecurringTemplate"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreateRecurringTemplateInput;

    const property = await prisma.property.findFirst({
      where: { id: body.propertyId, organizationId: orgId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundError("Property", body.propertyId);
    }

    const template = await prisma.recurringTemplate.create({
      data: {
        organizationId: orgId,
        type: body.type,
        category: body.category,
        amount: body.amount,
        description: body.description,
        frequency: body.frequency,
        nextDate: body.nextDate,
        propertyId: body.propertyId,
        unitId: body.unitId,
      },
    });

    res.status(201).json(template);
  })
);

// DELETE /transactions/recurring/:id
router.delete(
  "/recurring/:id",
  requireMinRole("TEAM_MEMBER"),
  validate({ params: recurringTemplateIdParamSchema }),
  auditLog("DELETE", "RecurringTemplate"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const template = await prisma.recurringTemplate.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!template) {
      throw new NotFoundError("RecurringTemplate", param(req, "id"));
    }

    await prisma.recurringTemplate.update({
      where: { id: param(req, "id") },
      data: { isActive: false },
    });

    res.json({ message: "Recurring template deactivated" });
  })
);

// ═══════════════════════════════════════════════════════════════════
// Expense Categories
// ═══════════════════════════════════════════════════════════════════

// GET /transactions/categories
router.get(
  "/categories/list",
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const categories = await prisma.expenseCategory.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { name: "asc" },
    });

    res.json({ data: categories });
  })
);

// POST /transactions/categories
router.post(
  "/categories",
  requireMinRole("TEAM_MEMBER"),
  validate({ body: createExpenseCategorySchema }),
  auditLog("CREATE", "ExpenseCategory"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const body = req.body as CreateExpenseCategoryInput;

    const category = await prisma.expenseCategory.create({
      data: {
        organizationId: orgId,
        name: body.name,
        scheduleELine: body.scheduleELine,
      },
    });

    res.status(201).json(category);
  })
);

// DELETE /transactions/categories/:id
router.delete(
  "/categories/:id",
  requireMinRole("OWNER"),
  validate({ params: expenseCategoryIdParamSchema }),
  auditLog("DELETE", "ExpenseCategory"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const category = await prisma.expenseCategory.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
    });
    if (!category) {
      throw new NotFoundError("ExpenseCategory", param(req, "id"));
    }

    if (category.isDefault) {
      throw new ValidationError("Cannot delete a default expense category");
    }

    await prisma.expenseCategory.update({
      where: { id: param(req, "id") },
      data: { isActive: false },
    });

    res.json({ message: "Expense category deactivated" });
  })
);

// ═══════════════════════════════════════════════════════════════════
// Schedule E Report
// ═══════════════════════════════════════════════════════════════════

// GET /transactions/schedule-e — IRS Schedule E tax report
router.get(
  "/schedule-e/report",
  requireMinRole("OWNER"),
  validate({ query: scheduleEQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const query = req.query as unknown as ScheduleEQuery;
    const { year, propertyId } = query;

    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    // Get all properties (or specific one)
    const properties = await prisma.property.findMany({
      where: {
        organizationId: orgId,
        ...(propertyId ? { id: propertyId } : {}),
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        zip: true,
      },
    });

    if (properties.length === 0 && propertyId) {
      throw new NotFoundError("Property", propertyId);
    }

    // Get expense categories with Schedule E mappings
    const categories = await prisma.expenseCategory.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { name: true, scheduleELine: true },
    });

    const categoryMap = new Map(
      categories.map((c) => [c.name, c.scheduleELine])
    );

    // Build per-property report
    const propertyReports = await Promise.all(
      properties.map(async (property) => {
        const baseWhere = {
          organizationId: orgId,
          propertyId: property.id,
          date: { gte: startOfYear, lt: endOfYear },
        };

        // Get all transactions for this property in this year
        const transactions = await prisma.transaction.findMany({
          where: baseWhere,
          select: {
            type: true,
            category: true,
            subcategory: true,
            amount: true,
          },
        });

        // Aggregate by type and category
        const incomeByCategory = new Map<string, number>();
        const expenseByCategory = new Map<string, number>();
        let totalIncome = 0;
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

        // Map expenses to Schedule E lines
        const scheduleEExpenses: Array<{
          category: string;
          scheduleELine: string | null;
          amount: number;
        }> = [];

        for (const [cat, amount] of expenseByCategory) {
          scheduleEExpenses.push({
            category: cat,
            scheduleELine: categoryMap.get(cat) ?? null,
            amount,
          });
        }

        // Sort by Schedule E line for cleaner presentation
        scheduleEExpenses.sort((a, b) =>
          (a.scheduleELine ?? "ZZ").localeCompare(b.scheduleELine ?? "ZZ")
        );

        return {
          property: {
            id: property.id,
            name: property.name,
            address: `${property.address}, ${property.city}, ${property.state} ${property.zip}`,
          },
          income: {
            total: totalIncome,
            byCategory: Object.fromEntries(incomeByCategory),
          },
          expenses: {
            total: totalExpenses,
            byCategory: scheduleEExpenses,
          },
          netIncome: totalIncome - totalExpenses,
        };
      })
    );

    // Grand totals
    const grandTotalIncome = propertyReports.reduce(
      (sum, p) => sum + p.income.total,
      0
    );
    const grandTotalExpenses = propertyReports.reduce(
      (sum, p) => sum + p.expenses.total,
      0
    );

    res.json({
      year,
      properties: propertyReports,
      totals: {
        income: grandTotalIncome,
        expenses: grandTotalExpenses,
        netIncome: grandTotalIncome - grandTotalExpenses,
      },
    });
  })
);

export default router;
