/**
 * WorkflowTemplate — admin-configured multi-stage approval template.
 *
 * Upgraded with:
 *   - stageType: "sequential" | "parallel"  (Feature 3: Parallel Approvals)
 *   - conditions: rule-based routing rules  (Feature 2: Conditional Transitions)
 *   - parallelQuorum: min approvals needed  (Feature 3)
 *   - version history tracking             (Feature 4: Workflow Versioning)
 */
"use strict";
const mongoose = require("mongoose");

// ── Condition schema (Feature 2: Conditional Transitions) ────────────────────
// Evaluates entity fields to decide which stage to route to next.
const conditionSchema = new mongoose.Schema(
  {
    field:    { type: String, trim: true, maxlength: 100 },   // e.g. "priority", "type", "department"
    operator: { type: String, enum: ["eq","neq","gt","gte","lt","lte","in","nin"], default: "eq" },
    value:    { type: mongoose.Schema.Types.Mixed },           // comparison value
    // If condition matches, jump to this stage order number (0 = continue normal flow)
    targetStageOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Stage sub-schema ──────────────────────────────────────────────────────────
const stageSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true, min: 1 },
    name:  { type: String, required: true, trim: true, maxlength: 100 },

    // "sequential" = one actor acts; "parallel" = multiple actors must act
    stageType: {
      type:    String,
      enum:    ["sequential", "parallel"],
      default: "sequential",
    },

    assigneeRole: {
      type:    String,
      enum:    ["faculty", "hod", "admin", "specific"],
      default: "faculty",
    },
    assigneeUserId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // For parallel stages: list of specific user IDs who must all act
    parallelAssignees: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    // Minimum approvals needed to advance (0 = all assignees)
    parallelQuorum: { type: Number, min: 0, default: 0 },

    allowedActions: {
      type:    [String],
      enum:    ["approve", "reject", "escalate", "close", "request_info"],
      default: ["approve", "reject"],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message:   "At least one allowed action is required per stage",
      },
    },
    requiresComment: { type: Boolean, default: false },
    slaHours:        { type: Number, min: 0, default: 48 },
    notifyOnEnter:   { type: [String], default: ["student"] },
    autoAdvance:        { type: Boolean, default: false },
    autoAdvanceAction:  { type: String, enum: ["approve","reject","escalate","close","request_info",null], default: null },

    // Feature 2: conditional routing rules evaluated BEFORE entering this stage
    conditions: { type: [conditionSchema], default: [] },
  },
  { _id: true }
);

// ── Template schema ───────────────────────────────────────────────────────────
const workflowTemplateSchema = new mongoose.Schema(
  {
    name:           { type: String, required: true, trim: true, maxlength: 120 },
    description:    { type: String, trim: true, maxlength: 500, default: "" },
    appliesToTypes: { type: [String], default: [] },
    entityKind:     { type: String, enum: ["request","leave"], default: "request" },
    isActive:       { type: Boolean, default: true, index: true },
    stages: {
      type: [stageSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message:   "A workflow template must have at least one stage",
      },
    },
    version:   { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Feature 4: track previous versions (array of version snapshots)
    versionHistory: {
      type: [{
        version:   Number,
        snapshot:  mongoose.Schema.Types.Mixed,  // full stages array at that version
        editedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        editedAt:  { type: Date, default: Date.now },
        note:      { type: String, default: "" },
      }],
      default: [],
    },
  },
  { timestamps: true }
);

workflowTemplateSchema.index({ entityKind: 1, isActive: 1 });
workflowTemplateSchema.index({ appliesToTypes: 1, isActive: 1 });

workflowTemplateSchema.methods.sortedStages = function () {
  return [...this.stages].sort((a, b) => a.order - b.order);
};

module.exports = mongoose.model("WorkflowTemplate", workflowTemplateSchema);
