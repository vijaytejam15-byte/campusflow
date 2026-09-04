/**
 * workers.js — Register all BullMQ job handlers.
 *
 * Call initWorkers() once at server startup (after DB connected).
 * All heavy/async work (email, escalation) is processed here,
 * keeping the API request handlers fast.
 */

const { registerHandler, enqueue } = require("./queue");
const emailSvc = require("../services/email.service");
const logger   = require("../config/logger");

// ── Queue names (exported for use in route handlers) ─────────────────────────
const QUEUES = {
  EMAIL:      "email",
  ESCALATION: "escalation",
};

// ── Email worker ──────────────────────────────────────────────────────────────
// job.data = { type: string, payload: object }
async function emailHandler(data) {
  const { type, payload } = data;
  switch (type) {
    case "requestSubmitted":
      await emailSvc.sendRequestSubmitted(payload); break;
    case "requestStatusChanged":
      await emailSvc.sendRequestStatusChanged(payload); break;
    case "newRequestNotification":
      await emailSvc.sendNewRequestNotification(payload); break;
    case "slaWarning":
      await emailSvc.sendSLAWarning(payload); break;
    case "slaBreached":
      await emailSvc.sendSLABreached(payload); break;
    case "leaveSubmitted":
      await emailSvc.sendLeaveSubmitted(payload); break;
    case "leaveStatusChanged":
      await emailSvc.sendLeaveStatusChanged(payload); break;
    default:
      logger.warn("[EmailWorker] Unknown email type", { type });
  }
}

// ── Escalation worker ─────────────────────────────────────────────────────────
// data = {} (no payload needed — job reads DB itself)
async function escalationHandler(_data) {
  const { runEscalationCheck } = require("../jobs/escalation.job");
  const stats = await runEscalationCheck();
  logger.info("[EscalationWorker] Check complete", stats);
}

// ── Init ─────────────────────────────────────────────────────────────────────
function initWorkers() {
  registerHandler(QUEUES.EMAIL,      emailHandler);
  registerHandler(QUEUES.ESCALATION, escalationHandler);
  logger.info("[Workers] All handlers registered");
}

/**
 * Enqueue an email job (non-blocking for callers).
 * @param {string} type    one of the switch cases above
 * @param {object} payload matching the emailSvc function's argument
 */
async function queueEmail(type, payload) {
  await enqueue(QUEUES.EMAIL, { type, payload });
}

/**
 * Trigger the escalation check via the queue (non-blocking).
 */
async function queueEscalationCheck() {
  await enqueue(QUEUES.ESCALATION, {});
}

module.exports = { initWorkers, queueEmail, queueEscalationCheck, QUEUES, closeQueues };

async function closeQueues() {
  const { closeQueues: _close } = require("./queue");
  await _close();
}
