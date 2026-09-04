/**
 * email.service.js — Transactional email via Nodemailer.
 *
 * Configuration (all via environment variables — never hardcoded):
 *   EMAIL_ENABLED   "true" to actually send (default: false)
 *   EMAIL_HOST      SMTP host          (default: smtp.gmail.com)
 *   EMAIL_PORT      SMTP port          (default: 587)
 *   EMAIL_SECURE    "true" for SSL/TLS port 465, "false" for STARTTLS 587 (default: false)
 *   EMAIL_USER      SMTP username / Gmail address
 *   EMAIL_PASS      SMTP password / Gmail App Password   ← primary key
 *   EMAIL_PASSWORD  Alias for EMAIL_PASS (accepts either)
 *   EMAIL_FROM      Sender address     (default: CampusFlow <noreply@campusflow.edu>)
 *
 * Gmail setup:
 *   1. Enable 2-Step Verification on your Google account
 *   2. Go to Google Account → Security → App passwords
 *   3. Generate a 16-char App Password (do NOT use your normal Gmail password)
 *   4. Set EMAIL_USER=your@gmail.com  EMAIL_PASS=<16-char app password>
 *   5. Set EMAIL_ENABLED=true
 *
 * SECURITY:
 *   - Credentials come from env vars only — never hardcoded or logged
 *   - Email failures are caught and logged; request/leave operations always succeed
 *   - Socket.io + in-app notifications are never affected by email failures
 */

const nodemailer = require("nodemailer");
const logger     = require("../config/logger");

// Read config once at module load — values are treated as immutable
const ENABLED   = process.env.EMAIL_ENABLED === "true";
const HOST      = process.env.EMAIL_HOST     || "smtp.gmail.com";
const PORT      = Number(process.env.EMAIL_PORT)  || 587;
// EMAIL_SECURE: explicit "true" → SSL (port 465); anything else → STARTTLS (port 587)
const SECURE    = process.env.EMAIL_SECURE === "true" || PORT === 465;
// Accept either EMAIL_PASS or EMAIL_PASSWORD (EMAIL_PASSWORD takes precedence if both set)
const SMTP_USER = process.env.EMAIL_USER;
const SMTP_PASS = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS;
const FROM      = process.env.EMAIL_FROM     || "CampusFlow <noreply@campusflow.edu>";
const APP_URL   = process.env.FRONTEND_URL   || "http://localhost:3000";

// Transporter is built once and reused
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!ENABLED) {
    _transporter = {
      sendMail: async (opts) => {
        logger.debug("[Email] (disabled) Would send", { to: opts.to, subject: opts.subject });
        return { messageId: "dev-stub" };
      },
    };
    return _transporter;
  }

  // Validate required credentials are present (log warning, never log values)
  if (!SMTP_USER || !SMTP_PASS) {
    logger.warn("[Email] EMAIL_USER or EMAIL_PASS/EMAIL_PASSWORD not set — emails will fail to send");
  }

  _transporter = nodemailer.createTransport({
    host:   HOST,
    port:   PORT,
    secure: SECURE,   // true = TLS from the start (port 465); false = STARTTLS upgrade (port 587)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    // Reasonable timeouts — never block the event loop indefinitely
    connectionTimeout: 10000,
    greetingTimeout:   10000,
    socketTimeout:     15000,
  });

  return _transporter;
}

/**
 * Verify SMTP connectivity at startup (non-blocking).
 * Only runs when EMAIL_ENABLED=true. Logs result without exposing credentials.
 */
async function verifyEmailConnection() {
  if (!ENABLED) return;
  try {
    const t = getTransporter();
    await t.verify();
    logger.info("[Email] SMTP connection verified", { host: HOST, port: PORT, user: SMTP_USER });
  } catch (err) {
    // Non-fatal: server still starts, other features unaffected
    logger.error("[Email] SMTP connection failed — emails will not send", {
      host:  HOST,
      port:  PORT,
      user:  SMTP_USER,  // log the username (not the password) to help debugging
      error: err.message,
    });
  }
}

/**
 * Send an email.
 * - Failures are ALWAYS caught and logged — never throws to callers.
 * - Socket.io + DB notifications are separate and unaffected.
 */
async function sendEmail({ to, subject, html, text }) {
  if (!to) return;
  try {
    const t   = getTransporter();
    const res = await t.sendMail({ from: FROM, to, subject, html, text });
    logger.debug("[Email] Sent", { to, subject, messageId: res.messageId });
  } catch (err) {
    logger.error("[Email] Failed to send", { to, subject, error: err.message });
    // Never rethrow — calling code must not fail because email failed
  }
}

// ── HTML template ─────────────────────────────────────────────────────────────

function baseHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 24px; }
    .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px;
            padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    h2 { color: #4f46e5; margin: 0 0 16px; }
    p { color: #374151; line-height: 1.6; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; }
    .badge-pending   { background: #fef9c3; color: #854d0e; }
    .badge-approved  { background: #dcfce7; color: #15803d; }
    .badge-rejected  { background: #fee2e2; color: #b91c1c; }
    .badge-escalated { background: #fffbeb; color: #b45309; }
    .btn { display: inline-block; padding: 10px 22px; background: #4f46e5; color: #fff;
           text-decoration: none; border-radius: 8px; font-weight: 700; margin-top: 20px; }
    .footer { margin-top: 28px; font-size: 12px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h2>CampusFlow</h2>
    ${bodyHtml}
    <div class="footer">Automated message from CampusFlow. Do not reply.</div>
  </div>
</body>
</html>`;
}

// ── Email senders — each maps to one BullMQ job type ─────────────────────────

async function sendRequestSubmitted({ to, name, requestType, requestId }) {
  await sendEmail({
    to,
    subject: `[CampusFlow] Request submitted: ${requestType}`,
    html: baseHtml("Request Submitted", `
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your <strong>${requestType}</strong> request has been submitted.</p>
      <p>Status: <span class="badge badge-pending">Pending</span></p>
      <a class="btn" href="${APP_URL}/student/requests/${requestId}">View Request</a>
    `),
  });
}

async function sendRequestStatusChanged({ to, name, requestType, newStatus, comment, requestId }) {
  const label = newStatus.replace(/_/g, " ");
  await sendEmail({
    to,
    subject: `[CampusFlow] Request ${label}: ${requestType}`,
    html: baseHtml(`Request ${label}`, `
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your <strong>${requestType}</strong> request status was updated to
         <span class="badge badge-${newStatus}">${label}</span>.</p>
      ${comment ? `<p><strong>Staff note:</strong> ${comment}</p>` : ""}
      <a class="btn" href="${APP_URL}/student/requests/${requestId}">View Request</a>
    `),
  });
}

async function sendNewRequestNotification({ to, reviewerName, studentName, requestType, requestId }) {
  await sendEmail({
    to,
    subject: `[CampusFlow] New request to review: ${requestType}`,
    html: baseHtml("New Request to Review", `
      <p>Hi <strong>${reviewerName}</strong>,</p>
      <p><strong>${studentName}</strong> submitted a <strong>${requestType}</strong> request requiring your review.</p>
      <a class="btn" href="${APP_URL}/faculty/requests/${requestId}">Review Request</a>
    `),
  });
}

async function sendSLAWarning({ to, name, requestType, hoursRemaining, requestId }) {
  await sendEmail({
    to,
    subject: `[CampusFlow] SLA Warning: ${requestType} expires in ${hoursRemaining}h`,
    html: baseHtml("SLA Deadline Approaching", `
      <p>Hi <strong>${name}</strong>,</p>
      <p><strong>Type:</strong> ${requestType}<br>
         <strong>Time remaining:</strong> ~${hoursRemaining} hours</p>
      <a class="btn" href="${APP_URL}/faculty/requests/${requestId}">Review Now</a>
    `),
  });
}

async function sendSLABreached({ to, name, requestType, requestId }) {
  await sendEmail({
    to,
    subject: `[CampusFlow] SLA Breached: ${requestType} auto-escalated`,
    html: baseHtml("SLA Deadline Breached", `
      <p>Hi <strong>${name}</strong>,</p>
      <p>The <strong>${requestType}</strong> request breached its SLA and was automatically escalated.</p>
      <a class="btn" href="${APP_URL}/faculty/requests/${requestId}">View Request</a>
    `),
  });
}

async function sendLeaveSubmitted({ to, name, leaveType, startDate, endDate, leaveId }) {
  await sendEmail({
    to,
    subject: `[CampusFlow] Leave application submitted: ${leaveType}`,
    html: baseHtml("Leave Application Submitted", `
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your <strong>${leaveType}</strong> leave application has been submitted.</p>
      <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
      <p>Status: <span class="badge badge-pending">Pending</span></p>
      <a class="btn" href="${APP_URL}/leave/${leaveId}">View Application</a>
    `),
  });
}

async function sendLeaveStatusChanged({ to, name, leaveType, newStatus, comment, leaveId }) {
  const label = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
  await sendEmail({
    to,
    subject: `[CampusFlow] Leave application ${label}: ${leaveType}`,
    html: baseHtml(`Leave ${label}`, `
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your <strong>${leaveType}</strong> leave application was <strong>${label}</strong>.</p>
      ${comment ? `<p><strong>Staff note:</strong> ${comment}</p>` : ""}
      <a class="btn" href="${APP_URL}/leave/${leaveId}">View Application</a>
    `),
  });
}

module.exports = {
  sendEmail,
  verifyEmailConnection,
  sendRequestSubmitted,
  sendRequestStatusChanged,
  sendNewRequestNotification,
  sendSLAWarning,
  sendSLABreached,
  sendLeaveSubmitted,
  sendLeaveStatusChanged,
};
