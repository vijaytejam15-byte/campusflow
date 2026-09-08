/**
 * workflowInstance.routes.js
 *
 * GET  /api/requests/:id/workflow  — get workflow status for a request
 * POST /api/requests/:id/workflow/advance — reviewer advances a stage
 * GET  /api/leave/:id/workflow     — get workflow status for a leave
 * POST /api/leave/:id/workflow/advance — reviewer advances a leave stage
 *
 * Mounted in server.js directly on the /api router.
 * Authorization: students may only view their own; reviewers may view any.
 * IDOR: entityId is validated against the authenticated user before returning.
 */
"use strict";

const express  = require("express");
const mongoose = require("mongoose");
const Request  = require("../models/Request");
const Leave    = require("../models/Leave");
const User     = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const workflowSvc     = require("../services/workflow.service");
const { emitRequestStatusUpdated } = require("../socket/socketHandler");
const { queueEmail }               = require("../queues/workers");
const logger                       = require("../config/logger");

const router = express.Router({ mergeParams: true });

function isValidId(id) { return mongoose.Types.ObjectId.isValid(id); }

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load and IDOR-check the entity (request or leave).
 * Students can only access their own. Reviewers can access any.
 */
async function loadEntity(entityId, entityType, userId, userRole) {
  if (!isValidId(entityId)) return { err: { status: 400, message: "Invalid id" } };

  const isReviewer = ["faculty", "hod", "admin"].includes(userRole);
  let entity;

  if (entityType === "request") {
    const query = isReviewer ? { _id: entityId } : { _id: entityId, student: userId };
    entity = await Request.findOne(query).lean();
  } else {
    const query = isReviewer ? { _id: entityId } : { _id: entityId, student: userId };
    entity = await Leave.findOne(query).lean();
  }

  if (!entity) return { err: { status: 404, message: `${entityType} not found` } };
  return { entity };
}

/**
 * Post-advance: sync the entity's legacy status field and emit notifications.
 */
async function syncEntityStatus(entityId, entityType, overallStatus, actorName, studentId) {
  // Map workflow overall status → legacy status string
  const statusMap = { approved: "approved", rejected: "rejected", closed: "closed" };
  const legacyStatus = statusMap[overallStatus];
  if (!legacyStatus) return; // still in_progress — no sync needed

  if (entityType === "request") {
    await Request.findByIdAndUpdate(entityId, { status: legacyStatus, reviewedAt: new Date() });
  } else {
    await Leave.findByIdAndUpdate(entityId, { status: legacyStatus, reviewedAt: new Date() });
  }

  // Emit socket notification
  try {
    emitRequestStatusUpdated(studentId, {
      requestId:    entityId,
      newStatus:    legacyStatus,
      reviewerName: actorName || "Reviewer",
    });
  } catch { /* non-fatal */ }

  // Queue email
  try {
    if (entityType === "request") {
      const student = await User.findById(studentId).select("email name").lean();
      if (student) {
        queueEmail("requestStatusChanged", {
          to:        student.email,
          name:      student.name,
          newStatus: legacyStatus,
        }).catch(() => {});
      }
    }
  } catch { /* non-fatal */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST workflow routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/requests/:requestId/workflow
router.get("/requests/:requestId/workflow", requireAuth, async (req, res, next) => {
  try {
    const caller = await User.findById(req.userId).select("role").lean();
    if (!caller) return res.status(401).json({ message: "Not authenticated" });

    const { err } = await loadEntity(req.params.requestId, "request", req.userId, caller.role);
    if (err) return res.status(err.status).json({ message: err.message });

    const status = await workflowSvc.getWorkflowStatus(req.params.requestId, "request");
    if (!status) return res.status(404).json({ message: "No workflow instance for this request" });

    res.json({ workflow: status });
  } catch (err) { next(err); }
});

// POST /api/requests/:requestId/workflow/advance
router.post("/requests/:requestId/workflow/advance", requireAuth, async (req, res, next) => {
  try {
    const caller = await User.findById(req.userId).select("role name").lean();
    if (!caller) return res.status(401).json({ message: "Not authenticated" });
    if (!["faculty", "hod", "admin"].includes(caller.role)) {
      return res.status(403).json({ message: "Only reviewers can advance workflow stages" });
    }

    const { err, entity } = await loadEntity(req.params.requestId, "request", req.userId, caller.role);
    if (err) return res.status(err.status).json({ message: err.message });

    const { action, comment } = req.body || {};
    if (!action) return res.status(400).json({ message: "action is required" });

    const instance = await workflowSvc.getInstanceForEntity(req.params.requestId, "request");
    if (!instance) return res.status(404).json({ message: "No workflow instance for this request" });

    const { instance: updated, advancedTo } = await workflowSvc.advanceStage(
      instance._id,
      action,
      req.userId,
      comment || ""
    );

    // Sync legacy status if terminal
    await syncEntityStatus(
      req.params.requestId,
      "request",
      updated.overallStatus,
      caller.name,
      entity.student
    );

    logger.info("[WorkflowRoute] Request stage advanced", {
      requestId: req.params.requestId,
      action,
      advancedTo,
      actorId: req.userId,
    });

    res.json({
      message:       `Stage action "${action}" recorded`,
      advancedTo,
      overallStatus: updated.overallStatus,
      workflow:      await workflowSvc.getWorkflowStatus(req.params.requestId, "request"),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE workflow routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/leave/:leaveId/workflow
router.get("/leave/:leaveId/workflow", requireAuth, async (req, res, next) => {
  try {
    const caller = await User.findById(req.userId).select("role").lean();
    if (!caller) return res.status(401).json({ message: "Not authenticated" });

    const { err } = await loadEntity(req.params.leaveId, "leave", req.userId, caller.role);
    if (err) return res.status(err.status).json({ message: err.message });

    const status = await workflowSvc.getWorkflowStatus(req.params.leaveId, "leave");
    if (!status) return res.status(404).json({ message: "No workflow instance for this leave" });

    res.json({ workflow: status });
  } catch (err) { next(err); }
});

// POST /api/leave/:leaveId/workflow/advance
router.post("/leave/:leaveId/workflow/advance", requireAuth, async (req, res, next) => {
  try {
    const caller = await User.findById(req.userId).select("role name").lean();
    if (!caller) return res.status(401).json({ message: "Not authenticated" });
    if (!["faculty", "hod", "admin"].includes(caller.role)) {
      return res.status(403).json({ message: "Only reviewers can advance workflow stages" });
    }

    const { err, entity } = await loadEntity(req.params.leaveId, "leave", req.userId, caller.role);
    if (err) return res.status(err.status).json({ message: err.message });

    const { action, comment } = req.body || {};
    if (!action) return res.status(400).json({ message: "action is required" });

    const instance = await workflowSvc.getInstanceForEntity(req.params.leaveId, "leave");
    if (!instance) return res.status(404).json({ message: "No workflow instance for this leave" });

    const { instance: updated, advancedTo } = await workflowSvc.advanceStage(
      instance._id,
      action,
      req.userId,
      comment || ""
    );

    await syncEntityStatus(
      req.params.leaveId,
      "leave",
      updated.overallStatus,
      caller.name,
      entity.student
    );

    res.json({
      message:       `Stage action "${action}" recorded`,
      advancedTo,
      overallStatus: updated.overallStatus,
      workflow:      await workflowSvc.getWorkflowStatus(req.params.leaveId, "leave"),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

module.exports = router;
