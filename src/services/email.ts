import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '../lib/logger.js';
import { escapeHtml } from '../lib/crypto.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  if (!host) return null;

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });

  return transporter;
}

export interface BadgeIssuedEmailParams {
  recipientEmail: string;
  recipientName: string;
  badgeName: string;
  badgeDescription: string;
  badgeImageUrl: string;
  issuerName: string;
  verifyUrl: string;
  expiresAt?: Date | null;
}

export async function sendBadgeIssuedEmail(params: BadgeIssuedEmailParams): Promise<void> {
  const transport = getTransporter();
  if (!transport) {
    logger.debug('SMTP not configured, skipping badge issued email');
    return;
  }

  const {
    recipientEmail,
    recipientName,
    badgeName,
    badgeDescription,
    badgeImageUrl,
    issuerName,
    verifyUrl,
    expiresAt,
  } = params;

  const expirationLine = expiresAt
    ? `<p style="color:#666;font-size:14px;">This credential expires on <strong>${escapeHtml(expiresAt.toISOString().split('T')[0])}</strong>.</p>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#062748;padding:32px;text-align:center;">
      <img src="${escapeHtml(badgeImageUrl)}" alt="${escapeHtml(badgeName)}" style="max-width:120px;border-radius:8px;" />
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a;">Congratulations, ${escapeHtml(recipientName)}!</h1>
      <p style="color:#666;font-size:15px;line-height:1.5;">
        You have been awarded <strong>${escapeHtml(badgeName)}</strong> by <strong>${escapeHtml(issuerName)}</strong>.
      </p>
      <p style="color:#666;font-size:14px;line-height:1.5;">${escapeHtml(badgeDescription)}</p>
      ${expirationLine}
      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#062748;color:#fff;text-decoration:none;padding:12px 32px;border-radius:6px;font-weight:600;font-size:15px;">View Your Credential</a>
      </div>
      <p style="color:#999;font-size:12px;text-align:center;">
        This is a verified digital credential. You can share the link above to prove your achievement.
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || '"BONG Badges" <noreply@example.com>',
      to: recipientEmail,
      subject: `You earned: ${badgeName}`,
      html,
    });
    logger.info({ recipientEmail, badgeName }, 'badge_email_sent');
  } catch (err) {
    logger.error({ err, recipientEmail, badgeName }, 'badge_email_failed');
  }
}
