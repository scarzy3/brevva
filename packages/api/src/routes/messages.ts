import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/async-handler.js";
import { NotFoundError, ValidationError, AuthorizationError } from "../lib/errors.js";
import { getPaginationMeta } from "../lib/pagination.js";
import { param } from "../lib/params.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { tenancy } from "../middleware/tenancy.js";
import { requireMinRole } from "../middleware/rbac.js";
import { auditLog } from "../middleware/audit.js";
import {
  createThreadSchema,
  sendMessageSchema,
  threadListQuerySchema,
  threadIdParamSchema,
  messageIdParamSchema,
} from "../schemas/messages.js";
import type {
  CreateThreadInput,
  SendMessageInput,
  ThreadListQuery,
} from "../schemas/messages.js";

const router = Router();

router.use(authenticate, tenancy);

// ─── Helper: determine sender type from role ────────────────────────
function senderTypeFromRole(role: string): "OWNER" | "TEAM" | "TENANT" {
  if (role === "OWNER") return "OWNER";
  if (role === "TEAM_MEMBER") return "TEAM";
  return "TENANT";
}

// ─── GET /messages/threads ──────────────────────────────────────────
router.get(
  "/threads",
  validate({ query: threadListQuerySchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const query = req.query as unknown as ThreadListQuery;
    const { page, limit, sortOrder, tenantId } = query;

    const where: Record<string, unknown> = {
      organizationId: orgId,
      ...(tenantId ? { tenantId } : {}),
    };

    // If the user is a TENANT, only show their own threads
    if (req.user!.role === "TENANT") {
      const tenant = await prisma.tenant.findFirst({
        where: { userId: req.user!.userId, organizationId: orgId },
        select: { id: true },
      });
      if (!tenant) {
        res.json({ data: [], pagination: getPaginationMeta(0, page, limit) });
        return;
      }
      where["tenantId"] = tenant.id;
    }

    const [threads, total] = await Promise.all([
      prisma.messageThread.findMany({
        where,
        include: {
          tenant: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              body: true,
              senderType: true,
              createdAt: true,
              readAt: true,
            },
          },
          _count: { select: { messages: true } },
        },
        orderBy: { lastMessageAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.messageThread.count({ where }),
    ]);

    // Compute unread count per thread for the current user
    const threadsWithUnread = await Promise.all(
      threads.map(async (thread) => {
        const unreadCount = await prisma.message.count({
          where: {
            threadId: thread.id,
            recipientId: req.user!.userId,
            readAt: null,
          },
        });
        return { ...thread, unreadCount };
      })
    );

    res.json({
      data: threadsWithUnread,
      pagination: getPaginationMeta(total, page, limit),
    });
  })
);

// ─── POST /messages/threads — Start a new thread ────────────────────
router.post(
  "/threads",
  requireMinRole("TENANT"),
  validate({ body: createThreadSchema }),
  auditLog("CREATE", "MessageThread"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const userId = req.user!.userId;
    const body = req.body as CreateThreadInput;

    // Validate tenant belongs to org
    const tenant = await prisma.tenant.findFirst({
      where: { id: body.tenantId, organizationId: orgId },
      select: { id: true, userId: true },
    });
    if (!tenant) {
      throw new NotFoundError("Tenant", body.tenantId);
    }

    // If caller is a TENANT, they can only start threads for themselves
    if (req.user!.role === "TENANT" && tenant.userId !== userId) {
      throw new AuthorizationError("Tenants can only create threads for themselves");
    }

    // Find a recipient — default to org owner
    const orgOwner = await prisma.user.findFirst({
      where: { organizationId: orgId, role: "OWNER" },
      select: { id: true },
    });
    if (!orgOwner) {
      throw new ValidationError("No owner found for this organization");
    }

    const senderId = userId;
    const recipientId = tenant.userId === userId ? orgOwner.id : userId;
    const recipientType =
      recipientId === orgOwner.id ? "OWNER" : senderTypeFromRole(req.user!.role);

    const thread = await prisma.$transaction(async (tx) => {
      const created = await tx.messageThread.create({
        data: {
          organizationId: orgId,
          tenantId: body.tenantId,
          subject: body.subject,
          lastMessageAt: new Date(),
        },
      });

      await tx.message.create({
        data: {
          organizationId: orgId,
          threadId: created.id,
          senderId,
          senderType: senderTypeFromRole(req.user!.role),
          recipientId,
          recipientType,
          channel: "IN_APP",
          subject: body.subject,
          body: body.body,
        },
      });

      return tx.messageThread.findUnique({
        where: { id: created.id },
        include: {
          tenant: {
            select: { id: true, firstName: true, lastName: true },
          },
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              senderId: true,
              senderType: true,
              body: true,
              createdAt: true,
            },
          },
        },
      });
    });

    res.status(201).json(thread);
  })
);

// ─── GET /messages/threads/:id ──────────────────────────────────────
router.get(
  "/threads/:id",
  validate({ params: threadIdParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const thread = await prisma.messageThread.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        },
      },
    });

    if (!thread) {
      throw new NotFoundError("MessageThread", param(req, "id"));
    }

    // If TENANT, verify they own this thread
    if (req.user!.role === "TENANT") {
      const tenant = await prisma.tenant.findFirst({
        where: { userId: req.user!.userId, organizationId: orgId },
        select: { id: true },
      });
      if (!tenant || tenant.id !== thread.tenantId) {
        throw new AuthorizationError("You do not have access to this thread");
      }
    }

    // Mark messages as read for the current user
    await prisma.message.updateMany({
      where: {
        threadId: thread.id,
        recipientId: req.user!.userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    res.json(thread);
  })
);

// ─── POST /messages/threads/:id/reply ───────────────────────────────
router.post(
  "/threads/:id/reply",
  validate({ params: threadIdParamSchema, body: sendMessageSchema }),
  auditLog("CREATE", "Message"),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;
    const userId = req.user!.userId;
    const body = req.body as SendMessageInput;

    const thread = await prisma.messageThread.findFirst({
      where: { id: param(req, "id"), organizationId: orgId },
      include: {
        tenant: { select: { id: true, userId: true } },
      },
    });
    if (!thread) {
      throw new NotFoundError("MessageThread", param(req, "id"));
    }

    // If TENANT, verify they own this thread
    if (req.user!.role === "TENANT") {
      const tenant = await prisma.tenant.findFirst({
        where: { userId, organizationId: orgId },
        select: { id: true },
      });
      if (!tenant || tenant.id !== thread.tenantId) {
        throw new AuthorizationError("You do not have access to this thread");
      }
    }

    // Determine recipient: if sender is tenant → owner, if sender is owner/team → tenant
    let recipientId: string;
    let recipientType: "OWNER" | "TEAM" | "TENANT";

    if (req.user!.role === "TENANT") {
      // Tenant replying → send to org owner
      const orgOwner = await prisma.user.findFirst({
        where: { organizationId: orgId, role: "OWNER" },
        select: { id: true },
      });
      if (!orgOwner) {
        throw new ValidationError("No owner found for this organization");
      }
      recipientId = orgOwner.id;
      recipientType = "OWNER";
    } else {
      // Owner/team replying → send to tenant's user account
      if (!thread.tenant.userId) {
        throw new ValidationError(
          "Tenant does not have a user account to receive messages"
        );
      }
      recipientId = thread.tenant.userId;
      recipientType = "TENANT";
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          organizationId: orgId,
          threadId: thread.id,
          senderId: userId,
          senderType: senderTypeFromRole(req.user!.role),
          recipientId,
          recipientType,
          channel: "IN_APP",
          body: body.body,
        },
        include: {
          sender: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
        },
      });

      await tx.messageThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date() },
      });

      return created;
    });

    res.status(201).json(message);
  })
);

// ─── GET /messages/unread-count ─────────────────────────────────────
router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId!;

    const count = await prisma.message.count({
      where: {
        organizationId: orgId,
        recipientId: req.user!.userId,
        readAt: null,
      },
    });

    res.json({ unreadCount: count });
  })
);

export default router;
