import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import authRoutes from "./routes/auth.js";
import propertyRoutes from "./routes/properties.js";
import {
  unitNestedRouter,
  unitStandaloneRouter,
} from "./routes/units.js";
import tenantRoutes from "./routes/tenants.js";
import leaseRoutes from "./routes/leases.js";

const app = express();

// ─── 1. CORS ─────────────────────────────────────────────────────────
const allowedOrigins = env.CORS_ORIGINS.split(",").map((o) => o.trim());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── 2. Security headers ─────────────────────────────────────────────
app.use(helmet());

// ─── 3. Rate limiting ────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again later",
    },
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many auth attempts, please try again later",
    },
  },
});

app.use("/api/v1/auth", authLimiter);
app.use(generalLimiter);

// ─── 4. Body parsing ─────────────────────────────────────────────────
// Note: Stripe webhook route needs raw body — mount it BEFORE json parser
// when we implement webhooks. For now, apply json parser globally.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── 5. Static file serving for uploads ──────────────────────────────
const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use("/uploads", express.static(uploadDir));

// ─── 6. Health check ─────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── 7. API routes ───────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/properties", propertyRoutes);
app.use("/api/v1/properties/:propertyId/units", unitNestedRouter);
app.use("/api/v1/units", unitStandaloneRouter);
app.use("/api/v1/tenants", tenantRoutes);
app.use("/api/v1/leases", leaseRoutes);

// ─── 8. 404 handler ──────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested endpoint does not exist",
    },
  });
});

// ─── 9. Error handler ────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start server ────────────────────────────────────────────────────
app.listen(env.API_PORT, () => {
  console.log(
    `Brevva API running on port ${env.API_PORT} (${env.NODE_ENV})`
  );
});

export default app;
