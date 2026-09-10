/**
 * workflow.service.js — Advanced Workflow Engine core logic.
 *
 * Features implemented:
 *   Feature 1  — Advanced Workflow Engine: full stage lifecycle management
 *   Feature 2  — Conditional Transitions: rule-based stage routing
 *   Feature 3  — Parallel Approvals: multi-voter stages with quorum
 *   Feature 4  — Workflow Versioning: version-history snapshot on save
 *   Feature 5  — SLA Monitoring: warning threshold + breach tracking
 *   Feature 9  — Concurrency Control: optimistic locking on instance save
 */
"use strict";

const WorkflowTemplate = require("../models/WorkflowTemplate");
const WorkflowInstance = require("../models/WorkflowInstance");
const User             = require("../models/User");
const logger           = require("../config/logger");

const REJECT_ACTIONS  = new Set(["reject", "close"]);
const ADVANCE_ACTIONS = new Set(["approve", "escalate"]);

// SLA warning threshold — warn when this fraction of slaHours has elapsed
const SLA_WARN_THRESHOLD = 0.75;

// ─────────────────────────────────────────────────────────────────────────────
// Feature 2: Condition evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a single condition against the entity context.
 * context is a plain object with entity fields (type, priority, department …)
 */
function evaluateCondition(condition, context) {
  const { field, operator, value } = condition;
  const actual = context[field];
  if (actual === undefined || actual === null) return false;

  switch (operator) {
    case "eq":  return String(actual) === String(value);
    case "neq": return String(actual) !== String(value);
    case "gt":  return Number(actual) > Number(value);
    case "gte": return Number(actual) >= Number(value);
    case "lt":  return Number(actual) < Number(value);
    case "lte": return Number(actual) <= Number(value);
    case "in":  return Array.isArray(value) && value.map(String).includes(String(actual));
    case "nin": return Array.isArray(value) && !value.map(String).includes(String(actual));
    default:    return false;
  }
}

/**
 * Given the current stage's conditions array and the entity context,
 * return the targetStageOrder to jump to, or null to use normal sequential flow.
 */
function resolveConditionalTarget(conditions, context) {
  if (!Array.isArray(conditions) || conditions.length === 0) return null;
  for (const cond of conditions) {
    if (evaluateCondition(cond, context) && cond.targetStageOrder > 0) {
      return cond.targetStageOrder;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

async function findActiveTemplate(entityKind, entityType) {
  return WorkflowTemplate.findOne({
    entityKind,
    isActive:       true,
    appliesToTypes: entityType,
  }).lean();
}

async function createInstance(entityId, entityType, templateId, submittedBy, conditionContext = {}) {
  const template = await WorkflowTemplate.findById(templateId);
  if (!template) throw new Error(`WorkflowTemplate ${templateId} not found`);

  const sorted = template.sortedStages();

  const stages = sorted.map((s, idx) => ({
    stageIndex:        idx,
    stageName:         s.name,
    stageType:         s.stageType || "sequential",
    assigneeRole:      s.assigneeRole,
    assigneeUserId:    s.assigneeUserId || null,
    parallelAssignees: s.parallelAssignees || [],
    parallelQuorum:    s.parallelQuorum   || 0,
    allowedActions:    s.allowedActions,
    requiresComment:   s.requiresComment,
    slaHours:          s.slaHours,
    notifyOnEnter:     s.notifyOnEnter,
    autoAdvance:       s.autoAdvance,
    autoAdvanceAction: s.autoAdvanceAction || null,
    conditions:        s.conditions || [],
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
    templateSnapshot:  { name: template.name, version: template.version },
    currentStageIndex: 0,
    overallStatus:     "in_progress",
    stages,
    submittedBy,
    conditionContext,
  });

  logger.info("[WorkflowEngine] Instance created", {
    instanceId: instance._id, entityId, entityType, template: template.name,
  });

  return instance;
}

async function getInstanceForEntity(entityId, entityType) {
  return WorkflowInstance.findOne({ entityId, entityType });
}

async function getWorkflowStatus(entityId, entityType) {
  const instance = await WorkflowInstance.findOne({ entityId, entityType })
    .populate("stages.assignedTo", "name email role")
    .populate("stages.actorId",    "name email role")
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
    conditionContext:  instance.conditionContext || {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature 3: Parallel stage resolution helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine if a parallel stage has reached its quorum.
 * Returns: { resolved: bool, outcome: "approve"|"reject"|null }
 */
function resolveParallelStage(stage) {
  const votes      = stage.parallelVotes || [];
  const quorum     = stage.parallelQuorum || stage.parallelAssignees.length || 1;
  const approvals  = votes.filter((v) => v.action === "approve").length;
  const rejections = votes.filter((v) => v.action === "reject").length;
  const required   = quorum > 0 ? quorum : 1;

  // Any rejection immediately rejects the stage (fail-fast)
  if (rejections > 0) return { resolved: true, outcome: "reject" };
  if (approvals >= required) return { resolved: true, outcome: "approve" };
  return { resolved: false, outcome: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature 9: Concurrency Control — optimistic lock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save instance with optimistic locking using Mongoose's built-in __v check.
 * We read the current __v, then do findOneAndUpdate with { __v: currentVersion }
 * in the filter. If another process already incremented __v, the filter misses
 * and we throw 409.
 */
async function saveWithLock(instance) {
  const currentVersion = instance.__v;

  // Build the update object from the Mongoose doc
  const updateData = instance.toObject();
  // Remove _id from $set to avoid immutable field error
  delete updateData._id;
  // Increment __v manually in the update
  updateData.__v = currentVersion + 1;

  const saved = await WorkflowInstance.findOneAndUpdate(
    { _id: instance._id, __v: currentVersion },
    { $set: updateData },
    { new: true }
  );

  if (!saved) {
    throw Object.assign(
      new Error("Concurrent modification detected. Please refresh and try again."),
      { status: 409 }
    );
  }
  return saved;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature 1+2+3+9: advanceStage — the heart of the engine
// ─────────────────────────────────────────────────────────────────────────────

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

  // ── Role / assignee check ──────────────────────────────────────────────────
  if (actor.role !== "admin") {
    if (stage.stageType === "parallel") {
      // For parallel stages: actor must be in parallelAssignees (if specified)
      if (stage.parallelAssignees && stage.parallelAssignees.length > 0) {
        const isAssigned = stage.parallelAssignees.some(
          (id) => id.toString() === actorId.toString()
        );
        if (!isAssigned && actor.role !== stage.assigneeRole) {
          throw Object.assign(
            new Error("You are not assigned to this parallel approval stage"),
            { status: 403 }
          );
        }
      }
    } else if (stage.assigneeRole === "specific" && stage.assigneeUserId) {
      if (actorId.toString() !== stage.assigneeUserId.toString()) {
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

  // ── Feature 3: Parallel stage voting ──────────────────────────────────────
  if (stage.stageType === "parallel") {
    // Check actor hasn't already voted
    const alreadyVoted = (stage.parallelVotes || []).some(
      (v) => v.actorId.toString() === actorId.toString()
    );
    if (alreadyVoted) {
      throw Object.assign(new Error("You have already voted on this stage"), { status: 409 });
    }

    stage.parallelVotes.push({
      actorId,
      actorName: actor.name || "",
      action,
      comment:   comment.trim(),
      votedAt:   now,
    });

    // Check if we've reached quorum
    const { resolved, outcome } = resolveParallelStage(stage);

    if (!resolved) {
      // Not yet resolved — save and return "waiting"
      stage.comment   = `Waiting for more approvals (${stage.parallelVotes.length} voted)`;
      instance.markModified("stages");
      const saved = await saveWithLock(instance);
      logger.info("[WorkflowEngine] Parallel vote recorded (not yet resolved)", {
        instanceId, actorId, action, votes: stage.parallelVotes.length,
      });
      return { instance: saved, advancedTo: `${stage.stageName} (pending ${outcome})` };
    }

    // Resolved — treat as the determined outcome
    action = outcome;
  }

  // ── Update stage state ─────────────────────────────────────────────────────
  stage.status      = "completed";
  stage.action      = action;
  stage.actorId     = actorId;
  stage.actorName   = actor.name || "";
  stage.comment     = comment.trim();
  stage.completedAt = now;

  if (stage.slaDeadline && now > stage.slaDeadline) stage.slaBreached = true;

  let advancedTo = null;

  if (REJECT_ACTIONS.has(action)) {
    // ── Terminal: rejection / close ────────────────────────────────────────
    instance.overallStatus = action === "close" ? "closed" : "rejected";
    for (let i = instance.currentStageIndex + 1; i < instance.stages.length; i++) {
      instance.stages[i].status = "skipped";
    }
    advancedTo = instance.overallStatus;

  } else if (ADVANCE_ACTIONS.has(action)) {
    // ── Feature 2: evaluate conditions for the NEXT stage ─────────────────
    const context   = instance.conditionContext || {};
    const remaining = instance.stages.slice(instance.currentStageIndex + 1);
    let   nextIndex = instance.currentStageIndex + 1;

    // Check if the current stage has a conditional target
    const condTarget = resolveConditionalTarget(stage.conditions || [], context);
    if (condTarget !== null) {
      // Find the stage with that order number
      const targetIdx = instance.stages.findIndex(
        (s) => s.stageIndex === condTarget - 1
      );
      if (targetIdx > instance.currentStageIndex) {
        // Skip stages between current and target
        for (let i = instance.currentStageIndex + 1; i < targetIdx; i++) {
          instance.stages[i].status = "skipped";
        }
        nextIndex = targetIdx;
      }
    }

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
    // Re-open the same stage for more information
    stage.status    = "in_progress";
    stage.action    = null;
    stage.actorId   = null;
    stage.actorName = "";
    advancedTo = stage.stageName;
  }

  instance.markModified("stages");

  // Feature 9: save with optimistic lock
  const saved = await saveWithLock(instance);

  logger.info("[WorkflowEngine] Stage advanced", {
    instanceId: saved._id, action, actorId,
    stageName: stage.stageName, advancedTo,
    overallStatus: saved.overallStatus,
  });

  return { instance: saved, advancedTo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature 5: SLA monitoring — warning + breach scan
// ─────────────────────────────────────────────────────────────────────────────

async function checkSLABreaches() {
  const now   = new Date();
  const stats = { checked: 0, warned: 0, breached: 0, autoAdvanced: 0 };

  const instances = await WorkflowInstance.find({
    overallStatus: "in_progress",
    "stages.status": "in_progress",
  });

  stats.checked = instances.length;

  for (const instance of instances) {
    const stage = instance.getCurrentStage();
    if (!stage || stage.status !== "in_progress") continue;

    // SLA warning (75% elapsed, not yet warned)
    if (stage.slaDeadline && !stage.slaWarned) {
      const total  = stage.slaHours * 3_600_000;
      const elapsed = now.getTime() - (stage.enteredAt?.getTime() || 0);
      if (elapsed >= total * SLA_WARN_THRESHOLD) {
        stage.slaWarned = true;
        stats.warned++;
        // Signal to escalation job to emit warning notification
        instance._slaWarnStage = stage.stageName;
      }
    }

    // SLA breach
    if (stage.slaDeadline && stage.slaDeadline < now && !stage.slaBreached) {
      stage.slaBreached = true;
      stats.breached++;

      if (stage.autoAdvance && stage.autoAdvanceAction) {
        try {
          stage.status       = "completed";
          stage.action       = stage.autoAdvanceAction;
          stage.actorName    = "System (auto-advance)";
          stage.completedAt  = now;

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
          logger.error("[WorkflowEngine] Auto-advance failed", { instanceId: instance._id, error: err.message });
        }
      }
    }

    instance.markModified("stages");
    await instance.save().catch((err) =>
      logger.error("[WorkflowEngine] SLA save failed", { instanceId: instance._id, error: err.message })
    );
  }

  if (stats.breached > 0 || stats.warned > 0) {
    logger.info("[WorkflowEngine] SLA scan complete", stats);
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature 4: Workflow versioning helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a snapshot of the current template stages into versionHistory before update.
 */
async function snapshotTemplateVersion(template, editedBy, note = "") {
  template.versionHistory.push({
    version:  template.version,
    snapshot: template.stages.toObject ? template.stages.toObject() : template.stages,
    editedBy,
    editedAt: new Date(),
    note,
  });
  template.version = (template.version || 1) + 1;
}

/**
 * Get all version history for a template (for admin view).
 */
async function getTemplateVersionHistory(templateId) {
  const template = await WorkflowTemplate.findById(templateId)
    .select("name version versionHistory")
    .populate("versionHistory.editedBy", "name email")
    .lean();
  if (!template) return null;
  return template;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function canView(instance, actorId, actorRole) {
  if (["faculty", "hod", "admin"].includes(actorRole)) return true;
  return instance.submittedBy?.toString() === actorId.toString();
}

/**
 * Get workflow analytics metrics (Feature 10).
 */
async function getWorkflowMetrics() {
  const [total, byStatus, avgStages, slaMetrics] = await Promise.all([
    WorkflowInstance.countDocuments(),
    WorkflowInstance.aggregate([{ $group: { _id: "$overallStatus", count: { $sum: 1 } } }]),
    WorkflowInstance.aggregate([
      { $project: { stageCount: { $size: "$stages" } } },
      { $group: { _id: null, avg: { $avg: "$stageCount" } } },
    ]),
    WorkflowInstance.aggregate([
      {
        $project: {
          overallStatus: 1,
          slaBreachedCount: {
            $size: {
              $filter: { input: "$stages", as: "s", cond: { $eq: ["$$s.slaBreached", true] } },
            },
          },
        },
      },
      {
        $group: {
          _id:           null,
          totalBreached: { $sum: "$slaBreachedCount" },
          totalInstances: { $sum: 1 },
        },
      },
    ]),
  ]);

  const statusMap = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));

  return {
    total,
    byStatus:         statusMap,
    avgStagesPerFlow: avgStages[0]?.avg ? Math.round(avgStages[0].avg * 10) / 10 : 0,
    slaBreachRate:    slaMetrics[0]
      ? Math.round((slaMetrics[0].totalBreached / Math.max(slaMetrics[0].totalInstances, 1)) * 100)
      : 0,
  };
}

module.exports = {
  findActiveTemplate,
  createInstance,
  getInstanceForEntity,
  getWorkflowStatus,
  advanceStage,
  checkSLABreaches,
  canView,
  snapshotTemplateVersion,
  getTemplateVersionHistory,
  getWorkflowMetrics,
  evaluateCondition,
  resolveConditionalTarget,
  saveWithLock,
};
