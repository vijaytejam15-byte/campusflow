/**
 * escalation.job.js — Feature 5: SLA Monitoring & Escalation
 *
 * Enhanced with:
 *  - SLA warning notifications at 75% of slaHours elapsed
 *  - SLA breach notifications via Notification Center (Feature 6)
 *  - Workflow-engine SLA scan with warning support
 *  - Audit entries for auto-escalations (Feature 7)
 */
"use strict";

const Request    = require("../models/Request");
const User       = require("../models/User");
const { emitRequestStatusUpdated } = require("../socket/socketHandler");
const emailSvc   = require("../services/email.service");
const notifSvc   = require("../services/notification.service");
const { writeAudit } = require("../services/audit.service");
const logger     = require("../config/logger");
const workflowSvc = require("../services/workflow.service");

const OPEN_STATUSES = ["pending", "in_review"];
const AUTO_ESCALATE_COMMENT = "Automatically escalated: SLA deadline exceeded without resolution.";
const SLA_WARN_THRESHOLD = 0.75; // warn at 75% elapsed

async function runEscalationCheck() {
  const now   = new Date();
  const stats = { checked: 0, warned: 0, breached: 0, escalated: 0 };

  // ── Legacy flat-status requests ──────────────────────────────────────────
  const overdueRequests = await Request.find({
    status:      { $in: OPEN_STATUSES },
    slaDeadline: { $lt: now },
    slaBreached: false,
  }).lean();

  // SLA warning pass — requests approaching deadline but not yet past it
  const warnCandidates = await Request.find({
    status:      { $in: OPEN_STATUSES },
    slaDeadline: { $gt: now },
    slaBreached: false,
    slaWarned:   false,
  }).lean();

  for (const req of warnCandidates) {
    if (!req.slaDeadline || !req.createdAt) continue;
    const total   = req.slaDeadline.getTime() - req.createdAt.getTime();
    const elapsed = now.getTime() - req.createdAt.getTime();
    if (total > 0 && elapsed / total >= SLA_WARN_THRESHOLD) {
      try {
        const doc = await Request.findById(req._id);
        if (!doc || doc.slaWarned) continue;
        doc.slaWarned = true;
        await doc.save();
        stats.warned++;

        const studentDoc = await User.findById(req.student).select("email name").lean();
        if (studentDoc) {
          const hoursLeft = Math.max(0, Math.round((req.slaDeadline - now) / 3_600_000));
          // Email warning
          emailSvc.sendSLAWarning({
            to: studentDoc.email, name: studentDoc.name,
            requestType: req.type?.replace(/_/g, " ") || "request",
            hoursRemaining: hoursLeft, requestId: req._id,
          }).catch(() => {});

          // Persistent notification
          await notifSvc.createNotification({
            userId:     req.student,
            type:       "sla_warning",
            title:      "SLA Warning: Your request needs attention",
            body:       `Your request will breach its SLA in ~${hoursLeft} hour(s).`,
            entityKind: "request",
            entityId:   req._id,
            actionUrl:  `/student/requests/${req._id}`,
          });
        }
      } catch (err) {
        logger.error("[EscalationJob] SLA warn error", { id: req._id, error: err.message });
      }
    }
  }

  stats.checked = overdueRequests.length;
  if (overdueRequests.length === 0 && stats.warned === 0) return stats;

  logger.info(`[EscalationJob] Found ${overdueRequests.length} overdue request(s), ${stats.warned} warned`);

  for (const req of overdueRequests) {
    try {
      const doc = await Request.findById(req._id);
      if (!doc) continue;

      doc.slaBreached = true;
      stats.breached++;

      if (!doc.autoEscalated && OPEN_STATUSES.includes(doc.status)) {
        doc.status        = "escalated";
        doc.autoEscalated = true;
        doc.reviewedAt    = now;
        doc.comments.push({
          user: doc.student, userName: "System", role: "admin",
          comment: AUTO_ESCALATE_COMMENT, action: "escalate",
          statusSnapshot: "escalated", createdAt: now,
        });
        stats.escalated++;

        // Socket + email
        try {
          emitRequestStatusUpdated(doc.student, { request: doc, reviewerName: "System", newStatus: "escalated" });
          const studentDoc = await User.findById(doc.student).select("email name").lean();
          if (studentDoc) {
            emailSvc.sendSLABreached({
              to: studentDoc.email, name: studentDoc.name,
              requestType: doc.type.replace(/_/g, " "), requestId: doc._id,
            }).catch(() => {});

            // Persistent notification
            await notifSvc.createNotification({
              userId:     doc.student,
              type:       "sla_breached",
              title:      "Your request was auto-escalated (SLA breached)",
              body:       `Request type: ${doc.type.replace(/_/g, " ")}`,
              entityKind: "request",
              entityId:   doc._id,
              actionUrl:  `/student/requests/${doc._id}`,
            });
          }
        } catch { /* non-fatal */ }

        // Feature 7: audit
        await writeAudit({
          actorName: "System", actorRole: "system",
          action: "request.auto_escalated",
          entityKind: "request", entityId: doc._id,
          after: { status: "escalated", reason: "SLA breach" },
        });

        logger.info(`[EscalationJob] Auto-escalated request ${doc._id}`);
      }

      await doc.save();
    } catch (err) {
      logger.error(`[EscalationJob] Error processing ${req._id}`, { error: err.message });
    }
  }

  logger.info("[EscalationJob] Done", stats);

  // ── Workflow engine SLA breach + warning scan ────────────────────────────
  try {
    const wfStats = await workflowSvc.checkSLABreaches();
    if (wfStats.breached > 0 || wfStats.warned > 0) {
      logger.info("[EscalationJob] Workflow SLA", wfStats);
    }
  } catch (err) {
    logger.error("[EscalationJob] Workflow SLA error", { error: err.message });
  }

  return stats;
}

function startEscalationJob(intervalMs = 15 * 60 * 1000) {
  logger.info("[EscalationJob] Starting", { intervalSec: intervalMs / 1000 });
  setTimeout(() => {
    runEscalationCheck().catch((err) => console.error("[EscalationJob] Initial run failed:", err.message));
  }, 5000);
  return setInterval(() => {
    runEscalationCheck().catch((err) => console.error("[EscalationJob] Run failed:", err.message));
  }, intervalMs);
}

module.exports = { runEscalationCheck, startEscalationJob };
