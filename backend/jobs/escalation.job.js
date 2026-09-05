/**
 * escalation.job.js — Automatic SLA breach detection and escalation.
 *
 * Runs periodically (every 15 minutes in production, on demand in tests).
 *
 * What it does:
 *  1. Finds all open requests (pending / in_review) where slaDeadline < now
 *     and slaBreached === false.
 *  2. Marks them slaBreached = true.
 *  3. If the request is pending or in_review and not yet escalated,
 *     escalates to the HOD and appends an auto-escalation audit entry.
 *  4. Emits socket notifications to the student and to the HOD room.
 *  5. Logs every action.
 */

const Request    = require("../models/Request");
const User       = require("../models/User");
const { emitRequestStatusUpdated } = require("../socket/socketHandler");
const emailSvc   = require("../services/email.service");
const logger     = require("../config/logger");

const OPEN_STATUSES = ["pending", "in_review"];
const AUTO_ESCALATE_COMMENT = "Automatically escalated: SLA deadline exceeded without resolution.";

/**
 * Run one pass of the escalation check.
 * @returns {Promise<{ checked: number, breached: number, escalated: number }>}
 */
async function runEscalationCheck() {
  const now = new Date();
  const stats = { checked: 0, breached: 0, escalated: 0 };

  // Find non-terminal requests where slaDeadline has passed and not yet marked
  const overdueRequests = await Request.find({
    status:     { $in: OPEN_STATUSES },
    slaDeadline:{ $lt: now },
    slaBreached: false,
  }).lean();

  stats.checked = overdueRequests.length;
  if (overdueRequests.length === 0) return stats;

  logger.info(`[EscalationJob] Found ${overdueRequests.length} overdue request(s)`);

  for (const req of overdueRequests) {
    try {
      const doc = await Request.findById(req._id);
      if (!doc) continue;

      // Mark SLA breached
      doc.slaBreached = true;
      stats.breached++;

      // Auto-escalate if not already escalated and not yet at terminal status
      if (!doc.autoEscalated && OPEN_STATUSES.includes(doc.status)) {
        doc.status        = "escalated";
        doc.autoEscalated = true;
        doc.reviewedAt    = now;

        doc.comments.push({
          user:           doc.student,  // system action attributed to student record
          userName:       "System",
          role:           "admin",
          comment:        AUTO_ESCALATE_COMMENT,
          action:         "escalate",
          statusSnapshot: "escalated",
          createdAt:      now,
        });

        stats.escalated++;

        // Notify via socket + email
        try {
          emitRequestStatusUpdated(doc.student, {
            request:      doc,
            reviewerName: "System",
            newStatus:    "escalated",
          });

          // Email the student that their request was auto-escalated
          const studentDoc = await User.findById(doc.student).select("email name").lean();
          if (studentDoc) {
            emailSvc.sendSLABreached({
              to:          studentDoc.email,
              name:        studentDoc.name,
              requestType: doc.type.replace(/_/g, " "),
              requestId:   doc._id,
            }).catch(() => {});
          }
        } catch { /* non-fatal */ }

        logger.info(`[EscalationJob] Auto-escalated request ${doc._id}`);
      }

      await doc.save();
    } catch (err) {
      logger.error(`[EscalationJob] Error processing request ${req._id}`, { error: err.message });
    }
  }

  logger.info(`[EscalationJob] Done`, { breached: stats.breached, escalated: stats.escalated });
  return stats;
}

/**
 * Start the periodic escalation check interval.
 * @param {number} intervalMs  default 15 minutes
 * @returns the interval handle (call clearInterval to stop)
 */
function startEscalationJob(intervalMs = 15 * 60 * 1000) {
  logger.info(`[EscalationJob] Starting`, { intervalSec: intervalMs / 1000 });
  // Delay initial run by 5 seconds to allow Mongoose connection pool to fully settle
  // (avoids "Invalid namespace" errors on cold starts before collections are registered)
  setTimeout(() => {
    runEscalationCheck().catch((err) =>
      console.error("[EscalationJob] Initial run failed:", err.message)
    );
  }, 5000);
  return setInterval(() => {
    runEscalationCheck().catch((err) =>
      console.error("[EscalationJob] Run failed:", err.message)
    );
  }, intervalMs);
}

module.exports = { runEscalationCheck, startEscalationJob };
