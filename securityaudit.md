# Security Audit Report — Brevva Property Management Platform

**Audit Date:** 2026-02-09
**Scope:** Full codebase review of the Brevva monorepo (`packages/api`, `packages/web`, `packages/portal`, `packages/landing`, `nginx/`, `docker-compose.yml`)
**Methodology:** Manual static analysis of all source code, configuration files, schemas, and infrastructure definitions

---

## Executive Summary

Brevva is a full-stack property management SaaS platform handling sensitive data including Social Security Numbers, financial records, lease agreements, and payment processing. The codebase demonstrates several good security practices (Zod validation, bcrypt hashing, Helmet headers, rate limiting, Stripe webhook signature verification), but also contains multiple vulnerabilities ranging from critical to low severity. The most urgent issues involve plaintext storage of sensitive PII, unauthenticated access to uploaded documents, hardcoded secrets in deployment configuration, and tokens stored in localStorage.

### Finding Counts by Severity

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 8 |
| Medium | 12 |
| Low | 8 |
| Informational | 5 |

---

## Critical Findings

### C1. Social Security Numbers Stored in Plaintext

**Files:** `packages/api/prisma/schema.prisma:353`, `packages/api/src/config/env.ts:36`, `packages/api/src/routes/tenants.ts:185`
**OWASP:** A02:2021 – Cryptographic Failures

The Tenant model has an `ssn` field marked with the comment `// Encrypted at application level`, and the env config defines an optional `ENCRYPTION_KEY`. However, **no encryption code exists anywhere in the codebase**. A grep for `encrypt`, `decrypt`, `cipher`, or any usage of `ENCRYPTION_KEY` reveals it is defined but never imported or used outside the env validation.

SSNs are written directly to the database as plaintext strings via the tenant creation route:

```typescript
// packages/api/src/routes/tenants.ts:185
ssn: body.ssn,
```

A database breach would expose all tenant SSNs in cleartext, creating massive liability under regulations including the FTC Safeguards Rule and state breach notification laws.

The same issue applies to the `ScreeningReport.reportData` field (`// Encrypted JSON at application level`) and `ConnectedEmail.accessToken` / `ConnectedEmail.refreshToken` fields — all marked for encryption but stored in plaintext.

---

### C2. Hardcoded Default Secrets in Docker Compose

**File:** `docker-compose.yml:8,45-46`

The production docker-compose.yml contains weak default secrets that will be used if environment variables are not explicitly set:

```yaml
POSTGRES_PASSWORD: ${DB_PASSWORD:-brevva_dev_password}
JWT_SECRET: ${JWT_SECRET:-dev_jwt_secret_change_in_production_min_16_chars}
JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-dev_jwt_refresh_secret_change_in_prod_min16}
```

If this compose file is used to deploy without a `.env` file (which is in `.gitignore`), the application runs with predictable secrets. The JWT secrets would allow an attacker to forge arbitrary access tokens for any user and role.

---

### C3. Uploaded Files Served Without Authentication

**Files:** `packages/api/src/index.ts:88`, `nginx/nginx.conf:50-56,90-97`

All uploaded files — including tenant IDs, pay stubs, lease documents, and maintenance photos — are served as unauthenticated static assets:

```typescript
// packages/api/src/index.ts:88
app.use("/uploads", express.static(uploadDir));
```

The nginx config also proxies `/uploads/` without any auth check. File URLs follow a predictable pattern (`/uploads/tenant-doc-<uuid>.pdf`). While UUIDs provide some obscurity, anyone with a file URL can access sensitive documents without authentication. This includes:

- Government-issued IDs
- Pay stubs with financial information
- Signed lease agreements with personal details
- SSN documents (if uploaded as supporting documents)

---

## High Findings

### H1. JWT Tokens and Refresh Tokens Stored in localStorage

**Files:** `packages/web/src/lib/api.ts:18-29`, `packages/web/src/lib/auth.tsx:55`, `packages/portal/src/lib/api.ts:18-29`, `packages/portal/src/lib/auth.tsx:55`

Both frontend applications store the complete auth state (access token, refresh token, and user data) in `localStorage`:

```typescript
localStorage.setItem("auth", JSON.stringify(data));
```

`localStorage` is accessible to any JavaScript running on the same origin. Any XSS vulnerability — including from third-party scripts, browser extensions, or injected content — would allow an attacker to exfiltrate all tokens. The refresh token grants long-lived access (7 days by default) and can be used to generate new access tokens.

Tokens should be stored in `httpOnly` cookies, which are inaccessible to JavaScript.

---

### H2. No Session Invalidation on Password Reset

**File:** `packages/api/src/routes/auth.ts:349-384`

When a user resets their password, existing sessions are NOT deleted:

```typescript
await prisma.user.update({
  where: { id: user.id },
  data: {
    passwordHash,
    passwordResetToken: null,
    passwordResetExpires: null,
  },
});
```

An attacker who has stolen a refresh token can continue accessing the account even after the legitimate user resets their password. All existing sessions should be invalidated when a password is changed.

---

### H3. Refresh Tokens Stored Unhashed in Database

**File:** `packages/api/prisma/schema.prisma:243`, `packages/api/src/routes/auth.ts:94-102`

Refresh tokens are stored as plaintext strings in the `sessions` table:

```prisma
model Session {
  refreshToken String @unique
}
```

If the database is compromised (SQL injection, backup exposure, insider threat), all refresh tokens are immediately usable. Refresh tokens should be stored as bcrypt or SHA-256 hashes, similar to how passwords are treated.

---

### H4. Audit Log Records Sensitive Request Bodies

**File:** `packages/api/src/middleware/audit.ts:30-33`

The audit middleware logs the entire request body as the `changes` field:

```typescript
changes: {
  ...(req.body as object),
  userAgent: req.headers["user-agent"] ?? "unknown",
},
```

This means that when a tenant is created with an SSN, or when a user registers with a password, those sensitive values are written to the `audit_logs` table in plaintext. The audit log becomes a secondary exposure point for sensitive data including passwords, SSNs, and financial information.

---

### H5. No HTTPS Enforcement

**File:** `nginx/nginx.conf`

The nginx configuration only listens on ports 80 and 8080 (HTTP). There is no TLS configuration, no HTTPS redirect, and no HSTS header. All data — including JWT tokens, passwords, SSNs, and payment information — is transmitted in cleartext.

While a separate TLS termination layer (e.g., Cloudflare) may be assumed, this is not documented, not enforced in the application, and the CORS origins in `.env.example` use `http://` URLs.

---

### H6. Stripe Mandate Uses Hardcoded Fake IP Address

**File:** `packages/api/src/lib/stripe.ts:43-51`

ACH payment mandates are created with a hardcoded fake IP and user agent:

```typescript
mandate_data: {
  customer_acceptance: {
    type: "online",
    online: {
      ip_address: "0.0.0.0",
      user_agent: "brevva-api",
    },
  },
},
```

Stripe requires the actual client's IP address and user agent for mandate compliance. Using `0.0.0.0` violates Stripe's terms and could result in mandate disputes being undefendable, as there is no proof of the actual customer's acceptance.

---

### H7. Email Template URL Injection

**Files:** `packages/api/src/services/email.ts:59,96,124,128,187-189,222-223`

While text content in email templates is properly escaped with `escapeHtml()`, URLs inserted into `href` attributes are not sanitized:

```html
<a href="${params.signingUrl}" ...>Review & Sign Lease</a>
<a href="${params.resetUrl}" ...>Reset Password</a>
<a href="${params.setupUrl}" ...>Set Up Your Account</a>
```

If any of these URL values can be influenced by user input (e.g., through a manipulated `WEB_URL` or `PORTAL_URL` environment variable, or through data injection), it could lead to phishing via crafted email links. The `resetUrl` is constructed from env vars plus a token, but the `documentUrl` comes directly from database data.

---

### H8. `JWT_REFRESH_SECRET` Configured But Never Used

**File:** `packages/api/src/config/env.ts:16`, `packages/api/src/lib/tokens.ts`

The environment configuration validates `JWT_REFRESH_SECRET` with `z.string().min(16)`, but refresh tokens are generated using `randomBytes(64)` rather than JWT signing. This secret is never imported or used anywhere. This means:

1. Developers may believe refresh tokens are cryptographically signed when they are not
2. The refresh token security model relies entirely on database lookup of a random value — which is valid, but inconsistent with the configuration suggesting JWT signing

---

## Medium Findings

### M1. Role Not Verified Against Database on Each Request

**File:** `packages/api/src/middleware/auth.ts:34-38`

The authentication middleware trusts the role from the JWT payload without verifying it against the database:

```typescript
req.user = {
  userId: payload.userId,
  organizationId: payload.organizationId,
  role: payload.role as UserRole,
  email: "",
};
```

If a user's role is downgraded (e.g., from OWNER to TEAM_MEMBER, or an account is disabled), the change doesn't take effect until the access token expires (15 minutes). During this window, a demoted or disabled user retains their previous privileges.

---

### M2. File Upload Mime Type Validation Trusts Client Headers

**Files:** `packages/api/src/routes/tenants.ts:53-71`, `packages/api/src/routes/portal.ts:60-68`, `packages/api/src/routes/properties.ts:44-56`

Multer's `fileFilter` checks `file.mimetype`, which comes from the client's `Content-Type` header — not from actual file content inspection:

```typescript
if (!allowed.includes(file.mimetype)) {
  cb(new ValidationError("Only JPEG, PNG, WebP, PDF..."));
}
```

An attacker can upload an HTML file containing JavaScript by setting the Content-Type to `image/jpeg`. Since uploaded files are served statically without `Content-Type` headers being forced, browsers may sniff the content and execute the JavaScript, leading to stored XSS.

---

### M3. No Antivirus or Content Validation on Uploads

**Files:** All multer configurations across `tenants.ts`, `portal.ts`, `properties.ts`, `leases.ts`

Uploaded files are only validated by mime type (which is client-controlled). There is no:
- Magic byte / file signature validation
- Antivirus scanning
- Image re-encoding or stripping of metadata
- PDF sanitization

Malicious files (polyglot files, files with embedded macros, steganographic content) can be uploaded and served to other users.

---

### M4. Redis Has No Authentication

**Files:** `docker-compose.yml:22-26`, `packages/api/src/config/env.ts:20`

Redis is configured without a password:

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
```

```typescript
REDIS_URL: z.string().default("redis://localhost:6379"),
```

Redis is exposed on port 6379 on the host. If the host is network-accessible, anyone can connect to Redis and access or modify cached data, rate limiter state, and job queue data.

---

### M5. PostgreSQL and Redis Ports Exposed to Host

**File:** `docker-compose.yml:10-11,24-25`

Both database services have their ports mapped to the host:

```yaml
postgres:
  ports:
    - "5432:5432"
redis:
  ports:
    - "6379:6379"
```

In production, these ports should not be exposed outside the Docker network. They should only be accessible to the API service via internal Docker networking.

---

### M6. No Account Lockout After Failed Login Attempts

**File:** `packages/api/src/routes/auth.ts:166-229`

The auth rate limiter allows 10 requests per 60 seconds, but there is no per-account lockout. An attacker can distribute attempts across multiple IP addresses (botnet) to perform credential stuffing without triggering any lockout. The application should track failed login attempts per account and lock accounts after a threshold.

---

### M7. IP-Based Rate Limiting Can Be Bypassed

**File:** `packages/api/src/index.ts:44`

```typescript
app.set("trust proxy", 1);
```

Setting `trust proxy` to `1` trusts the first hop's `X-Forwarded-For` header. If the application is not behind a properly configured proxy that strips/overwrites this header, an attacker can spoof their IP by sending a fake `X-Forwarded-For` header, completely bypassing IP-based rate limiting.

---

### M8. Password Reset Token Not Rate-Limited Per Email

**File:** `packages/api/src/routes/auth.ts:309-347`

The forgot-password endpoint creates a new reset token on every request without checking if one was recently issued:

```typescript
const resetToken = randomBytes(32).toString("hex");
await prisma.user.update({
  where: { id: user.id },
  data: {
    passwordResetToken: resetToken,
    passwordResetExpires: resetExpires,
  },
});
```

The general rate limiter (10 req/min) provides some protection, but from a distributed source, an attacker could flood a user's inbox with password reset emails (email bombing) while also invalidating previous valid reset tokens.

---

### M9. No Maximum Session Limit Per User

**Files:** `packages/api/src/routes/auth.ts:93-102,195-209`

Each login creates a new session without cleaning up old sessions. There is no limit on concurrent sessions. An attacker with stolen credentials could create many sessions, and even after the user changes their password (which doesn't invalidate sessions — see H2), all sessions remain active until they naturally expire.

---

### M10. Prisma Error Handler Leaks Database Schema Details

**File:** `packages/api/src/middleware/error-handler.ts:37-47`

Unique constraint violations expose the constraint target fields:

```typescript
if (err.code === "P2002") {
  const target = (err.meta?.["target"] as string[]) ?? [];
  res.status(409).json({
    error: {
      code: "CONFLICT",
      message: `A record with this ${target.join(", ")} already exists`,
    },
  });
}
```

This reveals database column names to attackers, aiding in schema enumeration.

---

### M11. Error Messages Leak Internal Details in Non-Production

**File:** `packages/api/src/middleware/error-handler.ts:59-68`

```typescript
message:
  process.env["NODE_ENV"] === "production"
    ? "An unexpected error occurred"
    : err.message,
```

In development/staging environments, unhandled errors expose full error messages which may contain file paths, SQL queries, or stack traces. If `NODE_ENV` is misconfigured or forgotten in a staging deployment, this becomes an information disclosure issue.

---

### M12. Lease Activation Without Landlord Countersignature

**File:** `packages/api/src/routes/leases.ts:644-667`

When all tenants sign a lease, it is immediately set to `ACTIVE` and the unit status is changed to `OCCUPIED`:

```typescript
if (unsignedCount === 0) {
  await tx.lease.update({
    where: { id: lease.id },
    data: { status: "ACTIVE" },
  });
  await tx.unit.update({
    where: { id: lease.unitId },
    data: { status: "OCCUPIED" },
  });
}
```

This occurs before the landlord countersigns. In many jurisdictions, a lease requires signatures from all parties to be legally binding. This premature activation could create legal disputes.

---

## Low Findings

### L1. Docker Container Runs as Root

**File:** `packages/api/Dockerfile`

The Dockerfile does not create or switch to a non-root user. The Node.js process runs as `root` inside the container. If a vulnerability allows remote code execution, the attacker gains root privileges within the container.

---

### L2. No `Content-Security-Policy` for Uploaded Files

**File:** `packages/api/src/index.ts:88`

The static file middleware does not set security headers like `X-Content-Type-Options: nosniff` or `Content-Disposition: attachment`. While Helmet sets some headers for API responses, the `express.static` middleware for uploads precedes or bypasses these. Browsers may content-sniff uploaded files and execute them as HTML.

---

### L3. No Database Connection Encryption (SSL)

**Files:** `docker-compose.yml:43`, `.env.example:2`

The `DATABASE_URL` uses plain `postgresql://` without SSL:

```
DATABASE_URL=postgresql://brevva:password@postgres:5432/brevva
```

Database connections within Docker are unencrypted. If the database is ever moved to an external host or a cloud service, connections would transmit data (including SSNs and financial data) in cleartext.

---

### L4. Global 10MB JSON Body Limit

**File:** `packages/api/src/index.ts:80-81`

```typescript
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
```

A 10MB JSON body limit applies to all routes. Most API endpoints need far less. This could facilitate denial-of-service by sending large payloads to lightweight endpoints, consuming server memory.

---

### L5. Logout Without Refresh Token Deletes All Sessions

**File:** `packages/api/src/routes/auth.ts:284-307`

If the logout request doesn't include a `refreshToken` in the body, all sessions for the user are deleted:

```typescript
if (refreshToken) {
  await prisma.session.deleteMany({ where: { refreshToken, userId: req.user!.userId } });
} else {
  await prisma.session.deleteMany({ where: { userId: req.user!.userId } });
}
```

This is a potential denial-of-service vector: a logged-in attacker (or a compromised access token) can log out the user from all devices by calling logout without a refresh token.

---

### L6. Email Sending Failures Silently Swallowed

**Files:** `packages/api/src/routes/auth.ts:339`, `packages/api/src/routes/leases.ts:693-696`

Email sending errors are caught and silently ignored:

```typescript
sendEmail({ to: user.email, ...emailContent }).catch(() => {});
```

Failed password reset emails, lease signing notifications, and welcome emails produce no alerts. Users may not receive critical security emails (password reset links) with no indication of failure.

---

### L7. Signing Token Metadata Inference

**File:** `packages/api/src/routes/leases.ts:468-474`

The token-based signing endpoint returns the token value and computed token creation time:

```typescript
signingToken: {
  token: token,
  createdAt: leaseTenant.tokenExpiresAt
    ? new Date(leaseTenant.tokenExpiresAt.getTime() - 7 * 24 * 60 * 60 * 1000)
    : null,
  expiresAt: leaseTenant.tokenExpiresAt?.toISOString() ?? null,
},
```

While the token is already known to the requester (it's in the URL), including the creation time and expiry in the response provides metadata that could aid in timing attacks or social engineering.

---

### L8. No Input Sanitization on Message Bodies

**File:** `packages/api/src/routes/messages.ts:160-172`

Message content (`body`) is stored and returned without sanitization. If the frontend renders message bodies as HTML rather than plain text, this creates a stored XSS vector.

---

## Informational Findings

### I1. No Security Event Logging

Failed login attempts, rate limit hits, password reset requests, and token-based signing events are not forwarded to any monitoring or alerting system. While audit logs capture successful state changes, security-relevant failures are only logged to `console.error` (if at all).

---

### I2. Seed Script Could Be Run in Production

**File:** `packages/api/prisma/seed.ts`

The seed script is available via `npm run db:seed`. There is no guard to prevent it from running in production. If executed, it would create known test data that could be used to access the system.

---

### I3. No API Rate Limiting Per User

Rate limiting is only IP-based. A single user could be targeted by multiple IPs (for brute force), or a single IP (shared office/VPN) could hit limits affecting many users. Per-user rate limiting would provide more granular protection.

---

### I4. CORS Allows Credentials Without Strict Origin Validation

**File:** `packages/api/src/index.ts:30-38`

```typescript
cors({
  origin: allowedOrigins,
  credentials: true,
})
```

CORS origins come from the `CORS_ORIGINS` environment variable. If this is misconfigured (e.g., set to `*` or includes a typo'd domain), credentials could be sent to malicious origins. The configuration should be validated at startup.

---

### I5. No Dependency Vulnerability Scanning in CI

The project has no `npm audit`, Snyk, or Dependabot configuration. Dependencies (especially `multer`, `jsonwebtoken`, and `express`) should be regularly scanned for known vulnerabilities.

---

## Positive Security Practices Observed

The following security measures are already in place and should be maintained:

- **Password hashing:** bcrypt with 12 rounds (`packages/api/src/routes/auth.ts:67`)
- **Strong password policy:** Minimum 8 chars, uppercase, lowercase, number, special character via Zod schema (`packages/api/src/schemas/auth.ts:3-13`)
- **Zod input validation:** All API endpoints validate input with Zod schemas before processing
- **Helmet security headers:** Applied globally (`packages/api/src/index.ts:41`)
- **Rate limiting:** Both general (100/min) and auth-specific (10/min) rate limits (`packages/api/src/index.ts:47-71`)
- **Stripe webhook signature verification:** Properly validates webhook signatures before processing (`packages/api/src/routes/webhooks.ts:28-37`)
- **Multi-tenancy isolation:** All database queries scope by `organizationId` (`packages/api/src/middleware/tenancy.ts`)
- **RBAC enforcement:** Role-based access control on sensitive endpoints (`packages/api/src/middleware/rbac.ts`)
- **Anti-enumeration on forgot-password:** Returns same response regardless of whether email exists (`packages/api/src/routes/auth.ts:342-345`)
- **Refresh token rotation:** Refresh tokens are rotated on each use (`packages/api/src/routes/auth.ts:257-268`)
- **Audit logging:** State-changing operations are logged with IP, user agent, and changes (`packages/api/src/middleware/audit.ts`)
- **Lease document integrity:** SHA-256 hashing of lease documents for tamper detection (`packages/api/src/routes/leases.ts:558-569`)
- **HTML escaping in emails:** User-provided text is escaped in email templates (`packages/api/src/services/email.ts:233-238`)
- **File upload size limits:** 10MB max file size enforced by both multer and nginx
- **Path traversal protection in lease uploads:** Filename sanitization in lease upload multer config (`packages/api/src/routes/leases.ts:79`)

---

## Remediation Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| Immediate | C1 — Implement SSN/PII encryption | Medium |
| Immediate | C2 — Remove default secrets from docker-compose | Low |
| Immediate | C3 — Add authentication to file serving | Medium |
| Immediate | H2 — Invalidate sessions on password reset | Low |
| This Sprint | H1 — Move tokens to httpOnly cookies | High |
| This Sprint | H3 — Hash refresh tokens before storage | Medium |
| This Sprint | H4 — Redact sensitive fields from audit logs | Low |
| This Sprint | H5 — Configure TLS/HTTPS | Medium |
| This Sprint | H6 — Pass real client IP to Stripe mandates | Low |
| Next Sprint | M1 — Add database role check to auth middleware | Low |
| Next Sprint | M2/M3 — Add magic byte validation for uploads | Medium |
| Next Sprint | M4/M5 — Secure Redis, remove exposed ports | Low |
| Next Sprint | M6 — Implement account lockout | Medium |
| Backlog | All Low and Informational findings | Varies |
