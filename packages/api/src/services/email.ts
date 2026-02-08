import { env } from "../config/env.js";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  // In production, this would use Mailgun
  // For now, log the email (Mailgun config is optional)
  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) {
    try {
      const formData = await import("form-data");
      const Mailgun = await import("mailgun.js");
      const MailgunClass = Mailgun.default ?? Mailgun;
      const mg = new (MailgunClass as any)(formData.default);
      const client = mg.client({
        username: "api",
        key: env.MAILGUN_API_KEY,
      });

      await client.messages.create(env.MAILGUN_DOMAIN, {
        from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
    } catch (err) {
      console.error("Failed to send email via Mailgun:", err);
    }
  } else {
    console.log(`[Email] To: ${options.to} | Subject: ${options.subject}`);
  }
}

export function buildSignatureRequestEmail(params: {
  tenantName: string;
  propertyAddress: string;
  unitNumber: string;
  signingUrl: string;
  landlordName: string;
}): { subject: string; html: string } {
  return {
    subject: `Lease Agreement Ready for Your Signature - ${params.propertyAddress}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #2563eb;">
    <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Brevva</h1>
  </div>
  <div style="padding: 30px 0;">
    <h2 style="color: #1e293b;">Hello ${escapeHtml(params.tenantName)},</h2>
    <p>Your lease agreement for <strong>${escapeHtml(params.propertyAddress)}, Unit ${escapeHtml(params.unitNumber)}</strong> is ready for your review and signature.</p>
    <p>${escapeHtml(params.landlordName)} has prepared a lease agreement and is requesting your electronic signature.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${params.signingUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Review & Sign Lease</a>
    </div>
    <p style="color: #64748b; font-size: 14px;">This signing link will expire in 7 days. If you have any questions, please contact your landlord directly.</p>
    <p style="color: #64748b; font-size: 14px;">If you did not expect this email, you can safely ignore it.</p>
  </div>
  <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
    <p>Sent via Brevva Property Management</p>
  </div>
</body>
</html>`,
  };
}

export function buildLeaseSignedConfirmationEmail(params: {
  recipientName: string;
  propertyAddress: string;
  unitNumber: string;
  allSigned: boolean;
}): { subject: string; html: string } {
  const status = params.allSigned
    ? "All parties have signed. The lease is now active."
    : "A tenant has signed the lease. Waiting for remaining signatures.";

  return {
    subject: `Lease Signature Confirmation - ${params.propertyAddress}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #2563eb;">
    <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Brevva</h1>
  </div>
  <div style="padding: 30px 0;">
    <h2 style="color: #1e293b;">Hello ${escapeHtml(params.recipientName)},</h2>
    <p>${status}</p>
    <p><strong>Property:</strong> ${escapeHtml(params.propertyAddress)}, Unit ${escapeHtml(params.unitNumber)}</p>
  </div>
  <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
    <p>Sent via Brevva Property Management</p>
  </div>
</body>
</html>`,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
