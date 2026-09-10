/**
 * WorkflowInstance — per-entity runtime state for a configured workflow.
 *
 * Upgraded with:
 *   - parallelVotes: track individual parallel-stage votes  (Feature 3)
 *   - conditionContext: entity fields for condition eval    (Feature 2)
 *   - __v used as optimistic lock counter                  (Feature 9)
 */
"use strict";
const mongoose = require("mongoose");

// ── Parallel vote sub-schema (Feature 3) ─────────────────────────────────────
const parallelVoteSchema = new mongoose.Schema(
  {
    actorId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    actorName:  { type: String, default: "" },
    action:     { type: String, required: true },   // "approve" | "reject"
    comment:    { type: String, default: "" },
    votedAt:    { type: Date, default: Date.now },
  },
  { _id: true }
);

// ── Stage runtime schema ───────────────────────────────────────────────────────
const instanceStageSchema = new mongoose.Schema(
  {
    stageIndex:         { type: Number, required: true },
    stageName:          { type: String, required: true, trim: true, maxlength: 100 },
    stageType:          { type: String, enum: ["sequential","parallel"], default: "sequential" },
    assigneeRole:       { type: String, required: true },
    assigneeUserId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    parallelAssignees:  { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    parallelQuorum:     { type: Number, default: 0 },
    allowedActions:     { type: [String], default: ["approve","reject"] },
    requiresComment:    { type: Boolean, default: false },
    slaHours:           { type: Number, default: 48 },
    notifyOnEnter:      { type: [String], default: ["student"] },
    autoAdvance:        { type: Boolean, default: false },
    autoAdvanceAction:  { type: String, default: null },
    conditions:         { type: mongoose.Schema.Types.Mixed, default: [] },

    // Runtime state
    assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: {
      type:    String,
      enum:    ["pending","in_progress","completed","skipped"],
      default: "pending",
    },
    action:       { type: String, default: null },
    actorId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorName:    { type: String, default: "" },
    comment:      { type: String, trim: true, maxlength: 2000, default: "" },

    // Feature 3: parallel vote tracking
    parallelVotes: { type: [parallelVoteSchema], default: [] },

    enteredAt:    { type: Date, default: null },
    completedAt:  { type: Date, default: null },
    slaDeadline:  { type: Date, default: null },
    slaBreached:  { type: Boolean, default: false },
    slaWarned:    { type: Boolean, default: false },   // Feature 5: SLA warning sent flag
  },
  { _id: true }
);

// ── Instance schema ───────────────────────────────────────────────────────────
const workflowInstanceSchema = new mongoose.Schema(
  {
    entityId:   { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    entityType: { type: String, enum: ["request","leave"], required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkflowTemplate", required: true },
    templateSnapshot: {
      name:    { type: String, default: "" },
      version: { type: Number, default: 1 },
    },
    currentStageIndex: { type: Number, default: 0 },
    overallStatus: {
      type:    String,
      enum:    ["in_progress","approved","rejected","closed"],
      default: "in_progress",
      index:   true,
    },
    stages:      { type: [instanceStageSchema] },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Feature 2: entity field snapshot for condition evaluation
    conditionContext: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps:   true,
    // Feature 9: mongoose uses __v as optimistic lock; versionKey is "__v" by default
    // We keep this enabled so advanceStage can do optimistic updates
  }
);

workflowInstanceSchema.index({ entityId: 1, entityType: 1 }, { unique: true });
workflowInstanceSchema.index({ overallStatus: 1, createdAt: -1 });
workflowInstanceSchema.index({ "stages.slaDeadline": 1, "stages.status": 1 });

workflowInstanceSchema.methods.getCurrentStage = function () {
  if (this.currentStageIndex >= this.stages.length) return null;
  return this.stages[this.currentStageIndex];
};

workflowInstanceSchema.methods.isTerminal = function () {
  return this.overallStatus !== "in_progress";
};

module.exports = mongoose.model("WorkflowInstance", workflowInstanceSchema);
