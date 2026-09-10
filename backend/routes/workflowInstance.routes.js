/**
 * workflowInstance.routes.js
 *
 * GET  /api/requests/:id/workflow          — workflow status
 * POST /api/requests/:id/workflow/advance  — advance stage (idempotent)
 * GET  /api/leave/:id/workflow             — workflow status
 * POST /api/leave/:id/workflow/advance     — advance stage (idempotent)
 *
 * Features wired:
 *   Feature 1  — Advanced Workflow Engine (advanceStage)
 *   Feature 2  — Conditional Transitions (conditionContext passed at creation)
 *   Feature 3  — Parallel Approvals (advanceStage handles voting)
 *   Feature 6  — Notifications (createNotification on advance)
 *   Feature 7  — Audit Trail (writeAudit on advance)
 *   Feature 8  — Idempotency (Idempotency-Key header)
 *   Feature 9  — Concurrency Control (409 on stale __v)
 */
"use strict";

const express   = require("express");
const mongoose  = require("mongoose");
const Request   = require("../models/Request");
const Leave     = require("../models/Leave");
const User      = require("../models/User");
const { requireAuth }               = require("../middleware/auth");
const idempotency                   = require("../middleware/idempotency");
const workflowSvc                   = require("../services/workflow.service");
const notifSvc                      = require("../services/notification.service");
const { auditWorkflowAdvance }      = require("../services/audit.service");
const { emitRequestStatusUpdated }  = require("../socket/socketHandler");
const { queueEmail }                = require("../queues/workers");
const logger                        = require("../config/logger");

const router = express.Router({ mergeParams: true });

function isValidId(id) { return mongoose.Types.ObjectId.isValid(id); }

// ── IDOR + entity loader ──────────────────────────────────────────────────────
async function loadEntity(entityId, entityType, userId, userRole) {
  if (!isValidId(entityId)) return { err: { status: 400, message: "Invalid id" } };
  const isReviewer = ["faculty", "hod", "admin"].includes(userRole);

  let entity;
  if (entityType === "request") {
    entity = await Request.findOne(
      isReviewer ? { _id: entityId } : { _id: entityId, student: userId }
    ).lean();
  } else {
    entity = await Leave.findOne(
      isReviewer ? { _id: entityId } : { _id: entityId, student: userId }
    ).lean();
  }

  if (!entity) return { err: { status: 404, message: `${entityType} not found` } };
  return { entity };
}

// ── Sync legacy status after terminal workflow outcome ────────────────────────
async function syncEntityStatus(entityId, entityType, overallStatus, actorName, studentId) {
  const statusMap = { approved: "approved", rejected: "rejected", closed: "closed" };
  const legacyStatus = statusMap[overallStatus];
  if (!legacyStatus) return;

  if (entityType === "request") {
    await Request.findByIdAndUpdate(entityId, { status: legacyStatus, reviewedAt: new Date() });
  } else {
    await Leave.findByIdAndUpdate(entityId, { status: legacyStatus, reviewedAt: new Date() });
  }

  try {
    emitRequestStatusUpdated(studentId, { requestId: entityId, newStatus: legacyStatus, reviewerName: actorName || "Reviewer" });
  } catch { /* non-fatal */ }

  try {
    if (entityType === "request") {
      const student = await User.findById(studentId).select("email name").lean();
      if (student) queueEmail("requestStatusChanged", { to: student.email, name: student.name, newStatus: legacyStatus }).catch(() => {});
    }
  } catch { /* non-fatal */ }
}

// ── shared advance handler factory ───────────────────────────────────────────
function makeAdvanceHandler(entityType) {
  return async function advanceHandler(req, res, next) {
    try {
      const entityId = entityType === "request" ? req.params.requestId : req.params.leaveId;

      const caller = await User.findById(req.userId).select("role name").lean();
      if (!caller) return res.status(401).json({ message: "Not authenticated" });
      if (!["faculty", "hod", "admin"].includes(caller.role))
        return res.status(403).json({ message: "Only reviewers can advance workflow stages" });

      const { err, entity } = await loadEntity(entityId, entityType, req.userId, caller.role);
      if (err) return res.status(err.status).json({ message: err.message });

      const { action, comment } = req.body || {};
      if (!action) return res.status(400).json({ message: "action is required" });

      const instance = await workflowSvc.getInstanceForEntity(entityId, entityType);
      if (!instance) return res.status(404).json({ message: `No workflow instance for this ${entityType}` });

      const { instance: updated, advancedTo } = await workflowSvc.advanceStage(
        instance._id, action, req.userId, comment || ""
      );

      // Sync legacy status if terminal
      await syncEntityStatus(entityId, entityType, updated.overallStatus, caller.name, entity.student);

      // Feature 7: Audit
      await auditWorkflowAdvance(updated, action, req.userId, caller.name, caller.role, req);

      // Feature 6: Notification to student
      try {
        const studentId = entity.student;
        const isTerminal = updated.overallStatus !== "in_progress";
        if (isTerminal) {
          await notifSvc.createNotification({
            userId:     studentId,
            type:       updated.overallStatus === "approved" ? "workflow_approved" : "workflow_rejected",
            title:      `Your ${entityType} has been ${updated.overallStatus}`,
            body:       comment ? `Comment: ${comment}` : "",
            entityKind: entityType,
            entityId:   entityId,
            actionUrl:  entityType === "request" ? `/student/requests/${entityId}` : `/leave/${entityId}`,
          });
        } else {
          await notifSvc.createNotification({
            userId:     studentId,
            type:       "workflow_stage_advanced",
            title:      `Your ${entityType} moved to: ${advancedTo}`,
            body:       comment ? `Reviewer comment: ${comment}` : "",
            entityKind: entityType,
            entityId:   entityId,
            actionUrl:  entityType === "request" ? `/student/requests/${entityId}` : `/leave/${entityId}`,
          });
        }
      } catch { /* non-fatal */ }

      logger.info("[WorkflowRoute] Stage advanced", { entityId, entityType, action, advancedTo, actorId: req.userId });

      return res.json({
        message:       `Stage action "${action}" recorded`,
        advancedTo,
        overallStatus: updated.overallStatus,
        workflow:      await workflowSvc.getWorkflowStatus(entityId, entityType),
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ message: err.message });
      next(err);
    }
  };
}

// ── shared status handler factory ─────────────────────────────────────────────
function makeStatusHandler(entityType) {
  return async function statusHandler(req, res, next) {
    try {
      const entityId = entityType === "request" ? req.params.requestId : req.params.leaveId;
      const caller = await User.findById(req.userId).select("role").lean();
      if (!caller) return res.status(401).json({ message: "Not authenticated" });

      const { err } = await loadEntity(entityId, entityType, req.userId, caller.role);
      if (err) return res.status(err.status).json({ message: err.message });

      const status = await workflowSvc.getWorkflowStatus(entityId, entityType);
      if (!status) return res.status(404).json({ message: `No workflow instance for this ${entityType}` });

      res.json({ workflow: status });
    } catch (err) { next(err); }
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────
router.get("/requests/:requestId/workflow",         requireAuth, makeStatusHandler("request"));
router.post("/requests/:requestId/workflow/advance",requireAuth, idempotency(), makeAdvanceHandler("request"));
router.get("/leave/:leaveId/workflow",              requireAuth, makeStatusHandler("leave"));
router.post("/leave/:leaveId/workflow/advance",     requireAuth, idempotency(), makeAdvanceHandler("leave"));

module.exports = router;
