/**
 * audit.service.js — Feature 7: Unified Audit Trail
 *
 * Lightweight helpers to write AuditLog entries from anywhere in the app.
 * All writes are fire-and-forget (non-fatal) so they never block requests.
 */
"use strict";

const AuditLog = require("../models/AuditLog");
const logger   = require("../config/logger");

/**
 * Write an audit log entry.
 * @param {object} opts
 * @param {object} req        - Express request (for ip / userAgent extraction)
 */
async function writeAudit(opts, req = null) {
  try {
    await AuditLog.create({
      actorId:    opts.actorId    || null,
      actorName:  opts.actorName  || "",
      actorRole:  opts.actorRole  || "",
      action:     opts.action,
      entityKind: opts.entityKind || "system",
      entityId:   opts.entityId   || null,
      entityRef:  opts.entityRef  || "",
      before:     opts.before     || null,
      after:      opts.after      || null,
      ip:         req?.ip         || opts.ip || "",
      userAgent:  (req?.headers?.["user-agent"] || "").slice(0, 200),
      meta:       opts.meta       || null,
    });
  } catch (err) {
    // Never crash the request — audit failure is logged but not propagated
    logger.warn("[Audit] Write failed", { error: err.message, action: opts.action });
  }
}

/**
 * Convenience: audit a workflow stage advance.
 */
async function auditWorkflowAdvance(instance, action, actorId, actorName, actorRole, req) {
  await writeAudit({
    actorId,
    actorName,
    actorRole,
    action:     `workflow.${action}`,
    entityKind: "workflow_instance",
    entityId:   instance._id,
    entityRef:  instance.templateSnapshot?.name || "",
    after:      {
      overallStatus:     instance.overallStatus,
      currentStageIndex: instance.currentStageIndex,
      stageAction:       action,
    },
  }, req);
}

/**
 * Convenience: audit a request status change.
 */
async function auditRequestStatus(requestId, fromStatus, toStatus, actorId, actorName, actorRole, req) {
  await writeAudit({
    actorId, actorName, actorRole,
    action:     "request.status_changed",
    entityKind: "request",
    entityId:   requestId,
    before:     { status: fromStatus },
    after:      { status: toStatus },
  }, req);
}

/**
 * Convenience: audit a leave decision.
 */
async function auditLeaveDecision(leaveId, decision, actorId, actorName, actorRole, req) {
  await writeAudit({
    actorId, actorName, actorRole,
    action:     `leave.${decision}`,
    entityKind: "leave",
    entityId:   leaveId,
    after:      { decision },
  }, req);
}

module.exports = { writeAudit, auditWorkflowAdvance, auditRequestStatus, auditLeaveDecision };
