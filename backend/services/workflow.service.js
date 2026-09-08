/**
 * workflow.service.js — Configurable Workflow Engine core logic.
 *
 * All workflow state mutations go through this service.
 * Routes, jobs, and tests call these functions; they never
 * manipulate WorkflowInstance or WorkflowTemplate directly.
 */
"use strict";

const WorkflowTemplate = require("../models/WorkflowTemplate");
const WorkflowInstance = require("../models/WorkflowInstance");
const User             = require("../models/User");
const logger           = require("../config/logger");

const REJECT_ACTIONS  = new Set(["reject", "close"]);
const ADVANCE_ACTIONS = new Set(["approve", "escalate"]);

// ─────────────────────────────────────────────────────────────────────────────

async function findActiveTemplate(entityKind, entityType) {
  return WorkflowTemplate.findOne({
    entityKind,
    isActive:       true,
    appliesToTypes: entityType,
  }).lean();
}

async function createInstance(entityId, entityType, templateId, submittedBy) {
  const template = await WorkflowTemplate.findById(templateId);
  if (!template) throw new Error(`WorkflowTemplate ${templateId} not found`);

  const sorted = template.sortedStages();

  const stages = sorted.map((s, idx) => ({
    stageIndex:        idx,
    stageName:         s.name,
    assigneeRole:      s.assigneeRole,
    assigneeUserId:    s.assigneeUserId || null,
    allowedActions:    s.allowedActions,
    requiresComment:   s.requiresComment,
    slaHours:          s.slaHours,
    notifyOnEnter:     s.notifyOnEnter,
    autoAdvance:       s.autoAdvance,
    autoAdvanceAction: s.autoAdvanceAction || null,
    status:            idx === 0 ? "in_progress" : "pending",
    enteredAt:         idx === 0 ? new Date() : null,
    slaDeadline:       idx === 0 && s.slaHours > 0
                         ? new Date(Date.now() + s.slaHours * 3_600_000)
                         : null,
  }));

  const instance = await WorkflowInstance.create({
    entityId,
    entityType,
    templateId,
    templateSnapshot: { name: template.name, version: template.version },
    currentStageIndex: 0,
    overallStatus:     "in_progress",
    stages,
    submittedBy,
  });

  logger.info("[WorkflowEngine] Instance created", {
    instanceId: instance._id,
    entityId,
    entityType,
    template: template.name,
  });

  return instance;
}

async function getInstanceForEntity(entityId, entityType) {
  return WorkflowInstance.findOne({ entityId, entityType });
}

async function getWorkflowStatus(entityId, entityType) {
  const instance = await WorkflowInstance.findOne({ entityId, entityType })
    .populate("stages.assignedTo", "name email role")
    .populate("stages.actorId",   "name email role")
    .lean();

  if (!instance) return null;

  return {
    instanceId:        instance._id,
    templateName:      instance.templateSnapshot?.name || "",
    currentStageIndex: instance.currentStageIndex,
    overallStatus:     instance.overallStatus,
    stages:            instance.stages,
    currentStage:      instance.stages[instance.currentStageIndex] || null,
    isTerminal:        instance.overallStatus !== "in_progress",
  };
}

async function advanceStage(instanceId, action, actorId, comment = "") {
  const instance = await WorkflowInstance.findById(instanceId);
  if (!instance) throw Object.assign(new Error("Workflow instance not found"), { status: 404 });
  if (instance.isTerminal()) {
    throw Object.assign(new Error("Workflow is already complete"), { status: 409 });
  }

  const stage = instance.getCurrentStage();
  if (!stage) throw Object.assign(new Error("No active stage found"), { status: 409 });

  if (!stage.allowedActions.includes(action)) {
    throw Object.assign(
      new Error(`Action "${action}" is not allowed at stage "${stage.stageName}"`),
      { status: 400 }
    );
  }

  if (stage.requiresComment && !comment.trim()) {
    throw Object.assign(
      new Error(`A comment is required at stage "${stage.stageName}"`),
      { status: 400 }
    );
  }

  const actor = await User.findById(actorId).select("name role").lean();
  if (!actor) throw Object.assign(new Error("Actor not found"), { status: 401 });

  // Role check — admin can always act
  if (actor.role !== "admin") {
    if (stage.assigneeRole === "specific" && stage.assigneeUserId) {
      if (actor._id.toString() !== stage.assigneeUserId.toString()) {
        throw Object.assign(
          new Error("Only the designated assignee or an admin can act at this stage"),
          { status: 403 }
        );
      }
    } else if (stage.assigneeRole !== "specific") {
      if (actor.role !== stage.assigneeRole) {
        throw Object.assign(
          new Error(`Role "${actor.role}" cannot act at stage "${stage.stageName}" (requires "${stage.assigneeRole}")`),
          { status: 403 }
        );
      }
    }
  }

  const now = new Date();
  stage.status      = "completed";
  stage.action      = action;
  stage.actorId     = actorId;
  stage.actorName   = actor.name || "";
  stage.comment     = comment.trim();
  stage.completedAt = now;

  if (stage.slaDeadline && now > stage.slaDeadline) {
    stage.slaBreached = true;
  }

  let advancedTo = null;

  if (REJECT_ACTIONS.has(action)) {
    instance.overallStatus = action === "close" ? "closed" : "rejected";
    for (let i = instance.currentStageIndex + 1; i < instance.stages.length; i++) {
      instance.stages[i].status = "skipped";
    }
    advancedTo = instance.overallStatus;
  } else if (ADVANCE_ACTIONS.has(action)) {
    const nextIndex = instance.currentStageIndex + 1;
    if (nextIndex >= instance.stages.length) {
      instance.overallStatus = "approved";
      advancedTo = "approved";
    } else {
      const nextStage = instance.stages[nextIndex];
      nextStage.status    = "in_progress";
      nextStage.enteredAt = now;
      if (nextStage.slaHours > 0) {
        nextStage.slaDeadline = new Date(now.getTime() + nextStage.slaHours * 3_600_000);
      }
      instance.currentStageIndex = nextIndex;
      advancedTo = nextStage.stageName;
    }
  } else if (action === "request_info") {
    stage.status    = "in_progress";
    stage.action    = null;
    stage.actorId   = null;
    stage.actorName = "";
    advancedTo = stage.stageName;
  }

  instance.markModified("stages");
  await instance.save();

  logger.info("[WorkflowEngine] Stage advanced", {
    instanceId: instance._id, action, actorId,
    stageName: stage.stageName, advancedTo,
    overallStatus: instance.overallStatus,
  });

  return { instance, advancedTo };
}

async function checkSLABreaches() {
  const now   = new Date();
  const stats = { checked: 0, breached: 0, autoAdvanced: 0 };

  const instances = await WorkflowInstance.find({
    overallStatus:       "in_progress",
    "stages.status":     "in_progress",
    "stages.slaDeadline": { $lt: now },
    "stages.slaBreached": false,
  });

  stats.checked = instances.length;

  for (const instance of instances) {
    const stage = instance.getCurrentStage();
    if (!stage || stage.status !== "in_progress") continue;
    if (!stage.slaDeadline || stage.slaDeadline > now) continue;
    if (stage.slaBreached) continue;

    stage.slaBreached = true;
    stats.breached++;

    if (stage.autoAdvance && stage.autoAdvanceAction) {
      try {
        stage.status      = "completed";
        stage.action      = stage.autoAdvanceAction;
        stage.actorName   = "System (auto-advance)";
        stage.completedAt = now;

        if (REJECT_ACTIONS.has(stage.autoAdvanceAction)) {
          instance.overallStatus = stage.autoAdvanceAction === "close" ? "closed" : "rejected";
          for (let i = instance.currentStageIndex + 1; i < instance.stages.length; i++) {
            instance.stages[i].status = "skipped";
          }
        } else {
          const nextIndex = instance.currentStageIndex + 1;
          if (nextIndex >= instance.stages.length) {
            instance.overallStatus = "approved";
          } else {
            const next = instance.stages[nextIndex];
            next.status    = "in_progress";
            next.enteredAt = now;
            if (next.slaHours > 0) {
              next.slaDeadline = new Date(now.getTime() + next.slaHours * 3_600_000);
            }
            instance.currentStageIndex = nextIndex;
          }
        }
        stats.autoAdvanced++;
      } catch (err) {
        logger.error("[WorkflowEngine] Auto-advance failed", {
          instanceId: instance._id, error: err.message,
        });
      }
    }

    instance.markModified("stages");
    await instance.save().catch((err) =>
      logger.error("[WorkflowEngine] SLA save failed", { instanceId: instance._id, error: err.message })
    );
  }

  if (stats.breached > 0) {
    logger.info("[WorkflowEngine] SLA breach scan complete", stats);
  }

  return stats;
}

function canView(instance, actorId, actorRole) {
  if (["faculty", "hod", "admin"].includes(actorRole)) return true;
  return instance.submittedBy?.toString() === actorId.toString();
}

module.exports = {
  findActiveTemplate,
  createInstance,
  getInstanceForEntity,
  getWorkflowStatus,
  advanceStage,
  checkSLABreaches,
  canView,
};
