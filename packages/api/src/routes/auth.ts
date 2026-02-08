import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/async-handler.js";
import {
  signAccessToken,
  generateRefreshToken,
  parseExpiryToMs,
} from "../lib/tokens.js";
import { env } from "../config/env.js";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../schemas/auth.js";
import type {
  RegisterInput,
  LoginInput,
  RefreshInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "../schemas/auth.js";

const router = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// POST /auth/register
router.post(
  "/register",
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as RegisterInput;

    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existingUser) {
      throw new ConflictError("A user with this email already exists");
    }

    let slug = slugify(body.organizationName);
    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
    });
    if (existingOrg) {
      slug = `${slug}-${Date.now()}`;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: body.organizationName,
          slug,
          plan: "STARTER",
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: body.email,
          passwordHash,
          firstName: body.firstName,
          lastName: body.lastName,
          role: "OWNER",
          phone: body.phone,
          lastLoginAt: new Date(),
        },
      });

      const refreshToken = generateRefreshToken();
      const refreshExpiresMs = parseExpiryToMs(env.JWT_REFRESH_EXPIRY);

      await tx.session.create({
        data: {
          userId: user.id,
          refreshToken,
          expiresAt: new Date(Date.now() + refreshExpiresMs),
          ipAddress: req.ip ?? req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
        },
      });

      // Create default expense categories
      const defaultCategories = [
        { name: "Advertising", scheduleELine: "Line 5" },
        { name: "Auto and Travel", scheduleELine: "Line 6" },
        { name: "Cleaning and Maintenance", scheduleELine: "Line 7" },
        { name: "Commissions", scheduleELine: "Line 8" },
        { name: "Insurance", scheduleELine: "Line 9" },
        { name: "Legal and Professional Fees", scheduleELine: "Line 10" },
        { name: "Management Fees", scheduleELine: "Line 11" },
        { name: "Mortgage Interest", scheduleELine: "Line 12" },
        { name: "Other Interest", scheduleELine: "Line 13" },
        { name: "Repairs", scheduleELine: "Line 14" },
        { name: "Supplies", scheduleELine: "Line 15" },
        { name: "Taxes", scheduleELine: "Line 16" },
        { name: "Utilities", scheduleELine: "Line 17" },
        { name: "Depreciation", scheduleELine: "Line 18" },
        { name: "Other", scheduleELine: "Line 19" },
        { name: "Rent Income", scheduleELine: "Line 3" },
        { name: "Capital Improvements", scheduleELine: null },
        { name: "HOA Fees", scheduleELine: null },
      ];

      await tx.expenseCategory.createMany({
        data: defaultCategories.map((cat) => ({
          organizationId: organization.id,
          name: cat.name,
          scheduleELine: cat.scheduleELine,
          isDefault: true,
          isActive: true,
        })),
      });

      const accessToken = signAccessToken({
        userId: user.id,
        organizationId: organization.id,
        role: user.role,
      });

      return { organization, user, accessToken, refreshToken };
    });

    res.status(201).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
        plan: result.organization.plan,
      },
    });
  })
);

// POST /auth/login
router.post(
  "/login",
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as LoginInput;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user) {
      throw new AuthenticationError("Invalid email or password");
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      throw new AuthenticationError("Invalid email or password");
    }

    const accessToken = signAccessToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });

    const refreshToken = generateRefreshToken();
    const refreshExpiresMs = parseExpiryToMs(env.JWT_REFRESH_EXPIRY);

    await prisma.$transaction([
      prisma.session.create({
        data: {
          userId: user.id,
          refreshToken,
          expiresAt: new Date(Date.now() + refreshExpiresMs),
          ipAddress: req.ip ?? req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
        plan: user.organization.plan,
      },
    });
  })
);

// POST /auth/refresh
router.post(
  "/refresh",
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as RefreshInput;

    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: {
        user: {
          include: { organization: true },
        },
      },
    });

    if (!session) {
      throw new AuthenticationError("Invalid refresh token");
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      throw new AuthenticationError("Refresh token has expired");
    }

    // Rotate refresh token
    const newRefreshToken = generateRefreshToken();
    const refreshExpiresMs = parseExpiryToMs(env.JWT_REFRESH_EXPIRY);

    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + refreshExpiresMs),
        ipAddress: req.ip ?? req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      },
    });

    const accessToken = signAccessToken({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      role: session.user.role,
    });

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  })
);

// POST /auth/logout
router.post(
  "/logout",
  authenticate,
  asyncHandler(async (req, res) => {
    const refreshToken =
      (req.body as { refreshToken?: string }).refreshToken;

    if (refreshToken) {
      await prisma.session.deleteMany({
        where: {
          refreshToken,
          userId: req.user!.userId,
        },
      });
    } else {
      // Delete all sessions for this user
      await prisma.session.deleteMany({
        where: { userId: req.user!.userId },
      });
    }

    res.json({ message: "Logged out successfully" });
  })
);

// POST /auth/forgot-password
router.post(
  "/forgot-password",
  validate({ body: forgotPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { email } = req.body as ForgotPasswordInput;

    // Always return success to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // In production, this would queue an email job with a reset token.
      // For now, we log it. The actual email sending will be implemented
      // with the Mailgun integration.
      const resetToken = generateRefreshToken();
      console.log(
        `[DEV] Password reset token for ${email}: ${resetToken.slice(0, 20)}...`
      );
    }

    res.json({
      message:
        "If an account with that email exists, a password reset link has been sent",
    });
  })
);

// POST /auth/reset-password
router.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as ResetPasswordInput;

    // In production, this would validate the reset token from a store.
    // For now, return an error since we haven't implemented token storage.
    throw new ValidationError(
      "Password reset is not yet fully implemented. Please contact support."
    );
  })
);

export default router;
