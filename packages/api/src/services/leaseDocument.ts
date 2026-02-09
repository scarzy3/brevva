import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { env } from "../config/env.js";

interface LeaseClause {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  sortOrder: number;
}

interface TenantInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  isPrimary: boolean;
  signedAt?: string | null;
  signatureData?: {
    fullName: string;
    timestamp: string;
    ip: string;
    signatureImage?: string;
    hash?: string;
  } | null;
}

interface LeaseDocumentData {
  leaseId: string;
  organizationName: string;
  property: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  unit: {
    unitNumber: string;
    bedrooms?: number;
    bathrooms?: number;
    sqFt?: number | null;
    description?: string | null;
  };
  tenants: TenantInfo[];
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  lateFeeAmount: number | null;
  lateFeeType: "FLAT" | "PERCENTAGE";
  gracePeriodDays: number;
  rentDueDay: number;
  clauses: LeaseClause[];
  landlordSignature?: {
    fullName: string;
    timestamp: string;
    ip?: string;
    signatureImage?: string;
  } | null;
}

export interface CertificateSignerInfo {
  role: string;
  name: string;
  email: string;
  signedAt: string;
  ipAddress: string;
  location: string | null;
  viewTimeSeconds: number | null;
}

export interface CertificateData {
  leaseId: string;
  propertyAddress: string;
  createdAt: string;
  completedAt: string;
  documentHash: string;
  signers: CertificateSignerInfo[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
}

function renderSignedBlock(
  label: string,
  sigData: { fullName: string; timestamp: string; ip?: string; signatureImage?: string; hash?: string },
): string {
  const sigVisual = sigData.signatureImage
    ? `<img src="${sigData.signatureImage}" alt="Signature" class="sig-image" />`
    : `<span class="e-signature">${escapeHtml(sigData.fullName)}</span>`;

  return `
    <div class="sig-signed">
      <div class="sig-badge">ELECTRONICALLY SIGNED</div>
      <div class="sig-visual">${sigVisual}</div>
      <div class="sig-meta">
        <table class="sig-meta-table">
          <tr><td class="sig-meta-label">Name:</td><td>${escapeHtml(sigData.fullName)}</td></tr>
          <tr><td class="sig-meta-label">Role:</td><td>${escapeHtml(label)}</td></tr>
          <tr><td class="sig-meta-label">Date:</td><td>${formatDateTime(sigData.timestamp)}</td></tr>
          ${sigData.ip ? `<tr><td class="sig-meta-label">IP Address:</td><td>${escapeHtml(sigData.ip)}</td></tr>` : ""}
          ${sigData.hash ? `<tr><td class="sig-meta-label">Signature ID:</td><td style="font-family:monospace;font-size:8pt">${sigData.hash.substring(0, 16)}...</td></tr>` : ""}
        </table>
      </div>
    </div>`;
}

function renderUnsignedBlock(label: string): string {
  return `
    <div class="sig-unsigned">
      <div class="sig-line"></div>
      <p class="sig-unsigned-label">${escapeHtml(label)}</p>
      <p class="sig-unsigned-date">Date: ________________</p>
    </div>`;
}

function formatViewTime(seconds: number | null): string {
  if (seconds == null) return "N/A";
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min === 0) return `${sec} sec`;
  return `${min} min ${sec} sec`;
}

/**
 * Generate a Certificate of Completion HTML page to append to the signed document.
 */
export function generateCertificateHTML(data: CertificateData): string {
  const signerRows = data.signers
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.role)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.email)}</td>
        <td>${formatDateTime(s.signedAt)}</td>
        <td style="font-family:monospace;font-size:9pt">${escapeHtml(s.ipAddress)}</td>
        <td>${s.location ? escapeHtml(s.location) : "—"}</td>
        <td>${formatViewTime(s.viewTimeSeconds)}</td>
      </tr>`
    )
    .join("");

  return `
<div class="certificate-page" style="page-break-before: always;">
  <style>
    .certificate-page {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      color: #222;
      padding: 40px 60px;
      max-width: 850px;
      margin: 0 auto;
    }
    .cert-header {
      text-align: center;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .cert-logo {
      font-size: 20pt;
      font-weight: bold;
      color: #2563eb;
      letter-spacing: 4px;
    }
    .cert-title {
      font-size: 16pt;
      font-weight: bold;
      margin-top: 8px;
      letter-spacing: 1px;
      color: #333;
    }
    .cert-section {
      margin-bottom: 20px;
    }
    .cert-section h3 {
      font-size: 11pt;
      font-weight: bold;
      color: #2563eb;
      border-bottom: 1px solid #ddd;
      padding-bottom: 4px;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .cert-info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 24px;
    }
    .cert-info-grid .label {
      font-weight: bold;
      color: #555;
      font-size: 9pt;
    }
    .cert-info-grid .value {
      font-size: 10pt;
    }
    .cert-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    .cert-table th {
      background: #f0f4f8;
      border: 1px solid #ddd;
      padding: 6px 8px;
      text-align: left;
      font-weight: bold;
      color: #333;
    }
    .cert-table td {
      border: 1px solid #ddd;
      padding: 5px 8px;
      vertical-align: top;
    }
    .cert-hash {
      font-family: monospace;
      font-size: 8pt;
      word-break: break-all;
      background: #f5f5f5;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .cert-legal {
      font-size: 9pt;
      color: #444;
      line-height: 1.5;
      border: 1px solid #ccc;
      background: #fafafa;
      padding: 12px;
      border-radius: 4px;
    }
    .cert-footer {
      margin-top: 24px;
      text-align: center;
      font-size: 8pt;
      color: #999;
      border-top: 1px solid #ddd;
      padding-top: 10px;
    }
  </style>

  <div class="cert-header">
    <div class="cert-logo">BREVVA</div>
    <div class="cert-title">CERTIFICATE OF COMPLETION</div>
  </div>

  <div class="cert-section">
    <h3>Document Information</h3>
    <div class="cert-info-grid">
      <div><span class="label">Document Title:</span></div>
      <div><span class="value">Residential Lease Agreement</span></div>
      <div><span class="label">Document ID:</span></div>
      <div><span class="value" style="font-family:monospace;font-size:9pt">${escapeHtml(data.leaseId)}</span></div>
      <div><span class="label">Property:</span></div>
      <div><span class="value">${escapeHtml(data.propertyAddress)}</span></div>
      <div><span class="label">Created:</span></div>
      <div><span class="value">${formatDateTime(data.createdAt)}</span></div>
      <div><span class="label">Completed:</span></div>
      <div><span class="value">${formatDateTime(data.completedAt)}</span></div>
    </div>
  </div>

  <div class="cert-section">
    <h3>Signing Summary</h3>
    <table class="cert-table">
      <thead>
        <tr>
          <th>Role</th>
          <th>Name</th>
          <th>Email</th>
          <th>Signed At</th>
          <th>IP Address</th>
          <th>Location</th>
          <th>Time Viewing</th>
        </tr>
      </thead>
      <tbody>
        ${signerRows}
      </tbody>
    </table>
  </div>

  <div class="cert-section">
    <h3>Document Integrity</h3>
    <p style="margin-bottom:6px"><strong>Document Hash (SHA-256):</strong></p>
    <div class="cert-hash">${escapeHtml(data.documentHash)}</div>
    <p style="margin-top:6px;font-size:9pt;color:#666">This hash can be used to verify the document has not been modified since signing.</p>
  </div>

  <div class="cert-section">
    <h3>Legal Statement</h3>
    <div class="cert-legal">
      This document was signed electronically via Brevva (brevva.io). All parties consented to electronic
      signatures. Electronic signatures are legally binding under the Electronic Signatures in Global and
      National Commerce Act (ESIGN Act, 15 U.S.C. &sect; 7001) and the Uniform Electronic Transactions Act (UETA).
      Each signer's identity was verified through their email address, and their signing session was recorded
      including IP address, device information, document viewing time, and explicit consent.
    </div>
  </div>

  <div class="cert-footer">
    <p>Certificate generated by Brevva on ${formatDateTime(new Date().toISOString())}</p>
    <p>For questions about this document, contact support@brevva.io</p>
  </div>
</div>`;
}

export function generateLeaseHTML(data: LeaseDocumentData): string {
  const tenantNames = data.tenants
    .map((t) => `${t.firstName} ${t.lastName}`)
    .join(", ");

  const enabledClauses = data.clauses
    .filter((c) => c.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const fullAddress = `${data.property.address}, ${data.property.city}, ${data.property.state} ${data.property.zip}`;
  const unitDesc = data.unit.unitNumber
    ? `Unit ${data.unit.unitNumber}`
    : "";
  const premisesAddress = unitDesc
    ? `${fullAddress}, ${unitDesc}`
    : fullAddress;

  let clausesSectionHTML = "";
  enabledClauses.forEach((clause, idx) => {
    clausesSectionHTML += `
      <div class="clause">
        <h3>${idx + 1}. ${escapeHtml(clause.title)}</h3>
        <div class="clause-content">${clause.content}</div>
      </div>
    `;
  });

  const signatureBlocksHTML = data.tenants
    .map((t) => {
      const label = `Tenant${t.isPrimary ? " (Primary)" : ""} \u2014 ${t.firstName} ${t.lastName}`;
      if (t.signedAt && t.signatureData) {
        return `<div class="signature-block">${renderSignedBlock(label, t.signatureData)}</div>`;
      }
      return `<div class="signature-block">${renderUnsignedBlock(label)}</div>`;
    })
    .join("");

  const landlordLabel = `Landlord/Property Manager \u2014 ${data.organizationName}`;
  const landlordSignatureHTML = data.landlordSignature
    ? `<div class="signature-block">${renderSignedBlock(landlordLabel, data.landlordSignature)}</div>`
    : `<div class="signature-block">${renderUnsignedBlock(landlordLabel)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Residential Lease Agreement</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; font-size: 12pt; line-height: 1.6; color: #222; padding: 40px 60px; max-width: 850px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
    .header h1 { font-size: 18pt; letter-spacing: 2px; margin-bottom: 8px; text-transform: uppercase; }
    .header .org-name { font-size: 14pt; color: #555; margin-bottom: 4px; }
    .header .date { font-size: 10pt; color: #777; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 13pt; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .parties-table { width: 100%; margin-bottom: 16px; }
    .parties-table td { vertical-align: top; padding: 4px 8px; }
    .parties-table .label { font-weight: bold; width: 130px; }
    .terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
    .terms-grid .term { padding: 6px 0; }
    .terms-grid .term .label { font-weight: bold; display: block; font-size: 10pt; color: #555; }
    .terms-grid .term .value { font-size: 12pt; }
    .clause { margin-bottom: 18px; page-break-inside: avoid; }
    .clause h3 { font-size: 12pt; font-weight: bold; margin-bottom: 6px; }
    .clause-content { margin-left: 12px; }
    .clause-content p { margin-bottom: 6px; }
    .clause-content ul, .clause-content ol { margin-left: 20px; margin-bottom: 6px; }
    .signatures { margin-top: 40px; page-break-inside: avoid; }
    .signatures h2 { font-size: 13pt; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 20px; }
    .signature-block { margin-bottom: 24px; page-break-inside: avoid; }
    .sig-signed { border: 2px solid #2563eb; border-radius: 8px; padding: 16px; background: #f0f7ff; }
    .sig-badge { display: inline-block; background: #2563eb; color: #fff; font-size: 8pt; font-weight: bold; letter-spacing: 1px; padding: 2px 8px; border-radius: 3px; margin-bottom: 10px; font-family: Arial, sans-serif; }
    .sig-visual { border-bottom: 2px solid #1e40af; padding: 8px 0 10px; margin-bottom: 10px; min-height: 50px; }
    .sig-image { max-height: 60px; max-width: 280px; }
    .e-signature { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-size: 24pt; color: #1a365d; }
    .sig-meta { font-size: 9pt; color: #444; font-family: Arial, sans-serif; }
    .sig-meta-table { border-collapse: collapse; }
    .sig-meta-table td { padding: 1px 8px 1px 0; vertical-align: top; }
    .sig-meta-label { font-weight: bold; color: #666; white-space: nowrap; }
    .sig-unsigned { padding: 16px 0; }
    .sig-line { border-bottom: 1px solid #333; min-height: 40px; margin-bottom: 6px; }
    .sig-unsigned-label { font-size: 10pt; font-weight: bold; }
    .sig-unsigned-date { font-size: 10pt; color: #555; }
    .disclosure { margin-top: 30px; padding: 16px; border: 1px solid #ccc; background: #f9f9f9; font-size: 10pt; page-break-inside: avoid; }
    .disclosure h3 { font-size: 11pt; margin-bottom: 8px; }
    .footer { margin-top: 30px; text-align: center; font-size: 9pt; color: #999; border-top: 1px solid #ccc; padding-top: 10px; }
    @media print { body { padding: 20px 40px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="org-name">${escapeHtml(data.organizationName)}</div>
    <h1>Residential Lease Agreement</h1>
    <div class="date">Effective Date: ${formatDate(data.startDate)}</div>
  </div>

  <div class="section">
    <h2>I. Parties</h2>
    <table class="parties-table">
      <tr>
        <td class="label">Landlord:</td>
        <td>${escapeHtml(data.organizationName)}</td>
      </tr>
      <tr>
        <td class="label">Tenant(s):</td>
        <td>${escapeHtml(tenantNames)}</td>
      </tr>
      ${data.tenants.map((t) => `<tr><td></td><td style="font-size:10pt;color:#555">${escapeHtml(t.email)}</td></tr>`).join("")}
    </table>
  </div>

  <div class="section">
    <h2>II. Premises</h2>
    <p>The Landlord hereby leases to the Tenant(s) the property located at:</p>
    <p style="margin:8px 0;font-weight:bold;font-size:13pt">${escapeHtml(premisesAddress)}</p>
    ${data.unit.bedrooms ? `<p>${data.unit.bedrooms} bedroom(s), ${data.unit.bathrooms} bathroom(s)${data.unit.sqFt ? `, approximately ${data.unit.sqFt} sq ft` : ""}</p>` : ""}
    ${data.unit.description ? `<p>${escapeHtml(data.unit.description)}</p>` : ""}
  </div>

  <div class="section">
    <h2>III. Lease Term</h2>
    <div class="terms-grid">
      <div class="term">
        <span class="label">Start Date</span>
        <span class="value">${formatDate(data.startDate)}</span>
      </div>
      <div class="term">
        <span class="label">End Date</span>
        <span class="value">${formatDate(data.endDate)}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>IV. Rent</h2>
    <div class="terms-grid">
      <div class="term">
        <span class="label">Monthly Rent</span>
        <span class="value">${formatCurrency(data.monthlyRent)}</span>
      </div>
      <div class="term">
        <span class="label">Due Date</span>
        <span class="value">${ordinal(data.rentDueDay)} of each month</span>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>V. Security Deposit</h2>
    <div class="terms-grid">
      <div class="term">
        <span class="label">Deposit Amount</span>
        <span class="value">${formatCurrency(data.securityDeposit)}</span>
      </div>
    </div>
    <p>The security deposit shall be held by the Landlord and returned to the Tenant(s) within 30 days of lease termination, less any deductions for damages beyond normal wear and tear or unpaid rent.</p>
  </div>

  <div class="section">
    <h2>VI. Late Fees</h2>
    <div class="terms-grid">
      <div class="term">
        <span class="label">Grace Period</span>
        <span class="value">${data.gracePeriodDays} day(s)</span>
      </div>
      <div class="term">
        <span class="label">Late Fee</span>
        <span class="value">${data.lateFeeAmount != null ? (data.lateFeeType === "FLAT" ? formatCurrency(data.lateFeeAmount) : `${data.lateFeeAmount}% of monthly rent`) : "N/A"}</span>
      </div>
    </div>
    <p>If rent is not received within ${data.gracePeriodDays} day(s) of the due date, a late fee of ${data.lateFeeAmount != null ? (data.lateFeeType === "FLAT" ? formatCurrency(data.lateFeeAmount) : `${data.lateFeeAmount}% of monthly rent`) : "the agreed amount"} shall be assessed.</p>
  </div>

  ${
    enabledClauses.length > 0
      ? `
  <div class="section">
    <h2>VII. Additional Terms & Conditions</h2>
    ${clausesSectionHTML}
  </div>
  `
      : ""
  }

  <div class="signatures">
    <h2>Signatures</h2>
    <p style="margin-bottom:20px;font-size:10pt;color:#555">By signing below, all parties agree to the terms and conditions set forth in this Residential Lease Agreement.</p>
    ${signatureBlocksHTML}
    ${landlordSignatureHTML}
  </div>

  <div class="disclosure">
    <h3>Disclosures</h3>
    <p><strong>Lead-Based Paint Disclosure:</strong> For properties built before 1978, the Landlord is required to disclose any known lead-based paint hazards. Tenants acknowledge receipt of the EPA pamphlet "Protect Your Family From Lead in Your Home."</p>
    <p style="margin-top:8px"><strong>Electronic Signature Disclosure:</strong> All parties consent to the use of electronic signatures in accordance with the ESIGN Act (15 U.S.C. § 7001 et seq.) and applicable state law. Electronic signatures are legally binding and enforceable.</p>
  </div>

  <div class="footer">
    <p>Generated by ${escapeHtml(data.organizationName)} via Brevva Property Management</p>
    <p>Lease ID: ${data.leaseId}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function computeDocumentHash(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export function saveLeaseDocument(html: string, leaseId: string): { url: string; hash: string } {
  const hash = computeDocumentHash(html);
  const filename = `lease-${leaseId}-${Date.now()}.html`;
  const uploadDir = path.resolve(env.UPLOAD_DIR);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, html, "utf-8");
  return { url: `/uploads/${filename}`, hash };
}

export function saveAddendumDocument(html: string, addendumId: string): { url: string; hash: string } {
  const hash = computeDocumentHash(html);
  const filename = `addendum-${addendumId}-${Date.now()}.html`;
  const uploadDir = path.resolve(env.UPLOAD_DIR);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, html, "utf-8");
  return { url: `/uploads/${filename}`, hash };
}

interface AddendumDocumentData {
  addendumId: string;
  organizationName: string;
  property: {
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  unitNumber: string;
  leaseStartDate: string;
  addendumTitle: string;
  addendumContent: string;
  effectiveDate?: string | null;
  tenants: TenantInfo[];
  landlordSignature?: {
    fullName: string;
    timestamp: string;
    ip?: string;
    signatureImage?: string;
  } | null;
}

export function generateAddendumHTML(data: AddendumDocumentData): string {
  const fullAddress = `${data.property.address}, ${data.property.city}, ${data.property.state} ${data.property.zip}`;
  const premisesAddress = data.unitNumber
    ? `${fullAddress}, Unit ${data.unitNumber}`
    : fullAddress;

  const signatureBlocksHTML = data.tenants
    .map((t) => {
      const label = `Tenant${t.isPrimary ? " (Primary)" : ""} \u2014 ${t.firstName} ${t.lastName}`;
      if (t.signedAt && t.signatureData) {
        return `<div class="signature-block">${renderSignedBlock(label, t.signatureData)}</div>`;
      }
      return `<div class="signature-block">${renderUnsignedBlock(label)}</div>`;
    })
    .join("");

  const landlordLabel = `Landlord/Property Manager \u2014 ${data.organizationName}`;
  const landlordSignatureHTML = data.landlordSignature
    ? `<div class="signature-block">${renderSignedBlock(landlordLabel, data.landlordSignature)}</div>`
    : `<div class="signature-block">${renderUnsignedBlock(landlordLabel)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Addendum to Residential Lease Agreement</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; font-size: 12pt; line-height: 1.6; color: #222; padding: 40px 60px; max-width: 850px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
    .header h1 { font-size: 18pt; letter-spacing: 2px; margin-bottom: 8px; text-transform: uppercase; }
    .header .org-name { font-size: 14pt; color: #555; margin-bottom: 4px; }
    .header .date { font-size: 10pt; color: #777; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 13pt; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .reference { margin-bottom: 24px; padding: 12px 16px; background: #f9f9f9; border-left: 3px solid #333; font-size: 11pt; }
    .addendum-content { margin-bottom: 24px; }
    .addendum-content h3 { font-size: 13pt; font-weight: bold; margin-bottom: 10px; }
    .addendum-content .content-body { margin-left: 12px; white-space: pre-wrap; }
    .addendum-content .content-body p { margin-bottom: 6px; }
    .preservation { margin: 30px 0; padding: 16px; border: 1px solid #ccc; background: #f9f9f9; font-size: 11pt; font-style: italic; }
    .signatures { margin-top: 40px; page-break-inside: avoid; }
    .signatures h2 { font-size: 13pt; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 20px; }
    .signature-block { margin-bottom: 24px; page-break-inside: avoid; }
    .sig-signed { border: 2px solid #2563eb; border-radius: 8px; padding: 16px; background: #f0f7ff; }
    .sig-badge { display: inline-block; background: #2563eb; color: #fff; font-size: 8pt; font-weight: bold; letter-spacing: 1px; padding: 2px 8px; border-radius: 3px; margin-bottom: 10px; font-family: Arial, sans-serif; }
    .sig-visual { border-bottom: 2px solid #1e40af; padding: 8px 0 10px; margin-bottom: 10px; min-height: 50px; }
    .sig-image { max-height: 60px; max-width: 280px; }
    .e-signature { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-size: 24pt; color: #1a365d; }
    .sig-meta { font-size: 9pt; color: #444; font-family: Arial, sans-serif; }
    .sig-meta-table { border-collapse: collapse; }
    .sig-meta-table td { padding: 1px 8px 1px 0; vertical-align: top; }
    .sig-meta-label { font-weight: bold; color: #666; white-space: nowrap; }
    .sig-unsigned { padding: 16px 0; }
    .sig-line { border-bottom: 1px solid #333; min-height: 40px; margin-bottom: 6px; }
    .sig-unsigned-label { font-size: 10pt; font-weight: bold; }
    .sig-unsigned-date { font-size: 10pt; color: #555; }
    .disclosure { margin-top: 30px; padding: 16px; border: 1px solid #ccc; background: #f9f9f9; font-size: 10pt; page-break-inside: avoid; }
    .disclosure h3 { font-size: 11pt; margin-bottom: 8px; }
    .footer { margin-top: 30px; text-align: center; font-size: 9pt; color: #999; border-top: 1px solid #ccc; padding-top: 10px; }
    @media print { body { padding: 20px 40px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="org-name">${escapeHtml(data.organizationName)}</div>
    <h1>Addendum to Residential Lease Agreement</h1>
    ${data.effectiveDate ? `<div class="date">Effective Date: ${formatDate(data.effectiveDate)}</div>` : ""}
  </div>

  <div class="reference">
    This addendum modifies the lease dated ${formatDate(data.leaseStartDate)} for the property at
    <strong>${escapeHtml(premisesAddress)}</strong>.
  </div>

  <div class="addendum-content">
    <h3>${escapeHtml(data.addendumTitle)}</h3>
    <div class="content-body">${data.addendumContent}</div>
  </div>

  <div class="preservation">
    All other terms and conditions of the original lease agreement remain in full force and effect.
    In the event of any conflict between this addendum and the original lease, the terms of this
    addendum shall prevail.
  </div>

  <div class="signatures">
    <h2>Signatures</h2>
    <p style="margin-bottom:20px;font-size:10pt;color:#555">By signing below, all parties agree to the terms and conditions set forth in this Addendum.</p>
    ${signatureBlocksHTML}
    ${landlordSignatureHTML}
  </div>

  <div class="disclosure">
    <h3>Electronic Signature Disclosure</h3>
    <p>All parties consent to the use of electronic signatures in accordance with the ESIGN Act (15 U.S.C. &sect; 7001 et seq.) and applicable state law. Electronic signatures are legally binding and enforceable.</p>
  </div>

  <div class="footer">
    <p>Generated by ${escapeHtml(data.organizationName)} via Brevva Property Management</p>
    <p>Addendum ID: ${data.addendumId}</p>
  </div>
</body>
</html>`;
}

export function generateAddendumCertificateHTML(data: {
  addendumId: string;
  addendumTitle: string;
  propertyAddress: string;
  createdAt: string;
  completedAt: string;
  documentHash: string;
  signers: CertificateSignerInfo[];
}): string {
  const signerRows = data.signers
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.role)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.email)}</td>
        <td>${formatDateTime(s.signedAt)}</td>
        <td style="font-family:monospace;font-size:9pt">${escapeHtml(s.ipAddress)}</td>
        <td>${s.location ? escapeHtml(s.location) : "\u2014"}</td>
        <td>${formatViewTime(s.viewTimeSeconds)}</td>
      </tr>`
    )
    .join("");

  return `
<div class="certificate-page" style="page-break-before: always;">
  <style>
    .certificate-page {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      color: #222;
      padding: 40px 60px;
      max-width: 850px;
      margin: 0 auto;
    }
    .cert-header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 24px; }
    .cert-logo { font-size: 20pt; font-weight: bold; color: #2563eb; letter-spacing: 4px; }
    .cert-title { font-size: 16pt; font-weight: bold; margin-top: 8px; letter-spacing: 1px; color: #333; }
    .cert-section { margin-bottom: 20px; }
    .cert-section h3 { font-size: 11pt; font-weight: bold; color: #2563eb; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .cert-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
    .cert-info-grid .label { font-weight: bold; color: #555; font-size: 9pt; }
    .cert-info-grid .value { font-size: 10pt; }
    .cert-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .cert-table th { background: #f0f4f8; border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-weight: bold; color: #333; }
    .cert-table td { border: 1px solid #ddd; padding: 5px 8px; vertical-align: top; }
    .cert-hash { font-family: monospace; font-size: 8pt; word-break: break-all; background: #f5f5f5; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
    .cert-legal { font-size: 9pt; color: #444; line-height: 1.5; border: 1px solid #ccc; background: #fafafa; padding: 12px; border-radius: 4px; }
    .cert-footer { margin-top: 24px; text-align: center; font-size: 8pt; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
  </style>

  <div class="cert-header">
    <div class="cert-logo">BREVVA</div>
    <div class="cert-title">CERTIFICATE OF COMPLETION</div>
  </div>

  <div class="cert-section">
    <h3>Document Information</h3>
    <div class="cert-info-grid">
      <div><span class="label">Document Title:</span></div>
      <div><span class="value">Lease Addendum: ${escapeHtml(data.addendumTitle)}</span></div>
      <div><span class="label">Document ID:</span></div>
      <div><span class="value" style="font-family:monospace;font-size:9pt">${escapeHtml(data.addendumId)}</span></div>
      <div><span class="label">Property:</span></div>
      <div><span class="value">${escapeHtml(data.propertyAddress)}</span></div>
      <div><span class="label">Created:</span></div>
      <div><span class="value">${formatDateTime(data.createdAt)}</span></div>
      <div><span class="label">Completed:</span></div>
      <div><span class="value">${formatDateTime(data.completedAt)}</span></div>
    </div>
  </div>

  <div class="cert-section">
    <h3>Signing Summary</h3>
    <table class="cert-table">
      <thead>
        <tr>
          <th>Role</th>
          <th>Name</th>
          <th>Email</th>
          <th>Signed At</th>
          <th>IP Address</th>
          <th>Location</th>
          <th>Time Viewing</th>
        </tr>
      </thead>
      <tbody>
        ${signerRows}
      </tbody>
    </table>
  </div>

  <div class="cert-section">
    <h3>Document Integrity</h3>
    <p style="margin-bottom:6px"><strong>Document Hash (SHA-256):</strong></p>
    <div class="cert-hash">${escapeHtml(data.documentHash)}</div>
    <p style="margin-top:6px;font-size:9pt;color:#666">This hash can be used to verify the document has not been modified since signing.</p>
  </div>

  <div class="cert-section">
    <h3>Legal Statement</h3>
    <div class="cert-legal">
      This document was signed electronically via Brevva (brevva.io). All parties consented to electronic
      signatures. Electronic signatures are legally binding under the Electronic Signatures in Global and
      National Commerce Act (ESIGN Act, 15 U.S.C. &sect; 7001) and the Uniform Electronic Transactions Act (UETA).
      Each signer's identity was verified through their email address, and their signing session was recorded
      including IP address, device information, document viewing time, and explicit consent.
    </div>
  </div>

  <div class="cert-footer">
    <p>Certificate generated by Brevva on ${formatDateTime(new Date().toISOString())}</p>
    <p>For questions about this document, contact support@brevva.io</p>
  </div>
</div>`;
}

export const DEFAULT_CLAUSES: LeaseClause[] = [
  {
    id: "rent-payment",
    title: "Rent Payment Terms",
    content: "<p>Rent shall be paid in full on or before the due date each month. Acceptable payment methods include electronic transfer (ACH), credit/debit card, or certified check. Partial payments will not be accepted unless agreed upon in writing by the Landlord.</p>",
    enabled: true,
    sortOrder: 1,
  },
  {
    id: "security-deposit",
    title: "Security Deposit Terms",
    content: "<p>The security deposit shall be held in accordance with applicable state law. The deposit may be applied to cover unpaid rent, damages beyond normal wear and tear, cleaning costs, or any other amounts owed by the Tenant. An itemized statement of any deductions will be provided within the timeframe required by law.</p>",
    enabled: true,
    sortOrder: 2,
  },
  {
    id: "late-fee-policy",
    title: "Late Fee Policy",
    content: "<p>If rent is not paid by the end of the grace period, a late fee will be assessed as specified in the lease terms above. Continued failure to pay rent may result in legal action, including eviction proceedings in accordance with state and local law.</p>",
    enabled: true,
    sortOrder: 3,
  },
  {
    id: "maintenance",
    title: "Maintenance Responsibilities",
    content: "<p>The Tenant shall maintain the premises in a clean and habitable condition. The Tenant is responsible for minor repairs and upkeep, including replacing light bulbs, maintaining smoke detector batteries, and keeping drains clear. The Landlord is responsible for major repairs and maintaining the structural integrity of the property. The Tenant shall promptly report any needed repairs to the Landlord in writing.</p>",
    enabled: true,
    sortOrder: 4,
  },
  {
    id: "pet-policy",
    title: "Pet Policy",
    content: "<p>No pets shall be allowed on the premises without prior written consent from the Landlord. If pets are approved, a pet deposit and/or monthly pet rent may be required. The Tenant is responsible for any damage caused by approved pets and must comply with all local animal regulations.</p>",
    enabled: false,
    sortOrder: 5,
  },
  {
    id: "smoking-policy",
    title: "Smoking Policy",
    content: "<p>Smoking of any kind (including e-cigarettes and vaping) is strictly prohibited inside the premises and within 25 feet of any building entrance, window, or ventilation intake. Violation of this policy may result in additional charges for cleaning and deodorizing and may be grounds for lease termination.</p>",
    enabled: true,
    sortOrder: 6,
  },
  {
    id: "parking",
    title: "Parking",
    content: "<p>The Tenant is assigned the parking space(s) specified, if any. Vehicles must be properly registered, insured, and operable. No vehicle repairs may be performed on the premises. Unauthorized vehicles may be towed at the owner's expense.</p>",
    enabled: false,
    sortOrder: 7,
  },
  {
    id: "utilities",
    title: "Utilities",
    content: "<p>Unless otherwise specified, the Tenant is responsible for establishing and paying for all utility services including electricity, gas, water/sewer, trash collection, internet, and cable/satellite. The Landlord shall not be liable for interruption of utility services beyond the Landlord's control.</p>",
    enabled: true,
    sortOrder: 8,
  },
  {
    id: "entry-notice",
    title: "Entry Notice Requirements",
    content: "<p>The Landlord or Landlord's agent may enter the premises with at least 24 hours' written notice for inspections, repairs, showings, or other reasonable purposes. In cases of emergency, the Landlord may enter without prior notice. The Tenant shall not unreasonably withhold consent to entry.</p>",
    enabled: true,
    sortOrder: 9,
  },
  {
    id: "termination",
    title: "Termination & Early Exit",
    content: "<p>Either party may terminate this lease at the end of the lease term by providing at least 30 days' written notice prior to the expiration date. Early termination by the Tenant may require payment of an early termination fee equal to two months' rent, unless otherwise prohibited by law. The Landlord may terminate the lease for material breach by the Tenant after providing appropriate notice as required by law.</p>",
    enabled: true,
    sortOrder: 10,
  },
  {
    id: "renewal",
    title: "Renewal Terms",
    content: "<p>Upon expiration of the initial lease term, this lease shall automatically convert to a month-to-month tenancy under the same terms and conditions, unless either party provides at least 30 days' written notice of intent not to renew. The Landlord reserves the right to adjust rent upon renewal with proper notice as required by law.</p>",
    enabled: true,
    sortOrder: 11,
  },
  {
    id: "guest-policy",
    title: "Guest Policy",
    content: "<p>Guests may stay for a period not exceeding 14 consecutive days or 30 total days in any 12-month period without prior written consent from the Landlord. Any person staying beyond this period must be approved and added to the lease. The Tenant is responsible for the conduct of all guests.</p>",
    enabled: true,
    sortOrder: 12,
  },
  {
    id: "noise-quiet-hours",
    title: "Noise & Quiet Hours",
    content: "<p>Quiet hours are observed between 10:00 PM and 8:00 AM daily. During quiet hours, the Tenant shall refrain from excessive noise that may disturb other residents or neighbors. Repeated noise complaints may constitute a material breach of this lease.</p>",
    enabled: true,
    sortOrder: 13,
  },
  {
    id: "alterations",
    title: "Alterations & Modifications",
    content: "<p>The Tenant shall not make any structural alterations, additions, or modifications to the premises without prior written consent from the Landlord. Minor decorative changes such as painting or hanging pictures may be permitted with approval. All approved alterations shall become the property of the Landlord unless otherwise agreed upon in writing.</p>",
    enabled: true,
    sortOrder: 14,
  },
];
