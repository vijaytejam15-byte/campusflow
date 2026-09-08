/**
 * WorkflowInstance — per-entity runtime state for a configured workflow.
 *
 * Created when a Request or Leave is submitted and a matching active
 * WorkflowTemplate exists. The template stages are snapshotted at creation
 * time so future template edits don't affect in-flight instances.
 *
 * One instance per entity. entityId + entityType forms a unique pair.
 */
const mongoose = require("mongoose");

// ── Stage runtime schema (snapshot + runtime state) ───────────────────────────

const instanceStageSchema = new mongoose.Schema(
  {
    // Mirrors the template stage definition (snapshot at instance creation)
    stageIndex:         { type: Number, required: true },
    stageName:          { type: String, required: true, trim: true, maxlength: 100 },
    assigneeRole:       { type: String, required: true },
    assigneeUserId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    allowedActions:     { type: [String], default: ["approve", "reject"] },
    requiresComment:    { type: Boolean, default: false },
    slaHours:           { type: Number, default: 48 },
    notifyOnEnter:      { type: [String], default: ["student"] },
    autoAdvance:        { type: Boolean, default: false },
    autoAdvanceAction:  { type: String, default: null },

    // Runtime state
    assignedTo:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: {
      type:    String,
      enum:    ["pending", "in_progress", "completed", "skipped"],
      default: "pending",
    },
    // Action taken to complete this stage
    action:       { type: String, default: null },
    actorId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorName:    { type: String, default: "" },
    comment:      { type: String, trim: true, maxlength: 2000, default: "" },

    enteredAt:    { type: Date, default: null },
    completedAt:  { type: Date, default: null },
    slaDeadline:  { type: Date, default: null },
    slaBreached:  { type: Boolean, default: false },
    slaWarned:    { type: Boolean, default: false },
  },
  { _id: true }
);

// ── Instance schema ───────────────────────────────────────────────────────────

const workflowInstanceSchema = new mongoose.Schema(
  {
    entityId: {
      type:     mongoose.Schema.Types.ObjectId,
      required: true,
      index:    true,
    },
    entityType: {
      type:    String,
      enum:    ["request", "leave"],
      required: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "WorkflowTemplate",
      required: true,
    },
    // Snapshot of template metadata at creation time (for audit immutability)
    templateSnapshot: {
      name:    { type: String, default: "" },
      version: { type: Number, default: 1 },
    },
    // 0-based index into the stages array pointing to the current active stage.
    // -1 = not started, stages.length = completed.
    currentStageIndex: {
      type:    Number,
      default: 0,
    },
    // Aggregate status of the entire workflow
    overallStatus: {
      type:    String,
      enum:    ["in_progress", "approved", "rejected", "closed"],
      default: "in_progress",
      index:   true,
    },
    // Immutable snapshot of stages from the template
    stages: {
      type: [instanceStageSchema],
    },
    // Submitting user — used for notifications and IDOR checks
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
    },
  },
  { timestamps: true }
);

// ── Compound indexes ──────────────────────────────────────────────────────────
workflowInstanceSchema.index({ entityId: 1, entityType: 1 }, { unique: true });
workflowInstanceSchema.index({ overallStatus: 1, createdAt: -1 });
// For SLA breach scanning
workflowInstanceSchema.index({ "stages.slaDeadline": 1, "stages.status": 1 });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return the current active stage object or null if completed/not started. */
workflowInstanceSchema.methods.getCurrentStage = function () {
  if (this.currentStageIndex >= this.stages.length) return null;
  return this.stages[this.currentStageIndex];
};

/** Return whether the workflow has reached a terminal overall status. */
workflowInstanceSchema.methods.isTerminal = function () {
  return this.overallStatus !== "in_progress";
};

module.exports = mongoose.model("WorkflowInstance", workflowInstanceSchema);
