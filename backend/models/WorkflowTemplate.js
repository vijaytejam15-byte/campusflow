/**
 * WorkflowTemplate — admin-configured multi-stage approval template.
 *
 * A template defines an ordered sequence of stages. When a Request or Leave
 * is submitted and a matching active template exists for its type, a
 * WorkflowInstance is created from this template (snapshot).
 *
 * Backward compatibility: existing requests with no workflowInstanceId
 * continue to use the legacy flat status workflow unaffected.
 */
const mongoose = require("mongoose");

// ── Stage sub-schema ──────────────────────────────────────────────────────────

const stageSchema = new mongoose.Schema(
  {
    order: {
      type:     Number,
      required: true,
      min:      1,
    },
    name: {
      type:     String,
      required: true,
      trim:     true,
      maxlength: 100,
    },
    // Role that is responsible for acting on this stage.
    // "specific" means a particular userId is assigned (see assigneeUserId).
    assigneeRole: {
      type:    String,
      enum:    ["faculty", "hod", "admin", "specific"],
      default: "faculty",
    },
    // Only used when assigneeRole === "specific"
    assigneeUserId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },
    // Actions the assignee may take at this stage
    allowedActions: {
      type:    [String],
      enum:    ["approve", "reject", "escalate", "close", "request_info"],
      default: ["approve", "reject"],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message:   "At least one allowed action is required per stage",
      },
    },
    // Whether the actor must provide a comment for any action
    requiresComment: {
      type:    Boolean,
      default: false,
    },
    // Per-stage SLA in hours (0 = no SLA for this stage)
    slaHours: {
      type:    Number,
      min:     0,
      default: 48,
    },
    // Roles to notify when this stage becomes active
    notifyOnEnter: {
      type:    [String],
      default: ["student"],
    },
    // If true, when slaHours elapses with no action, automatically apply autoAdvanceAction
    autoAdvance: {
      type:    Boolean,
      default: false,
    },
    autoAdvanceAction: {
      type:    String,
      enum:    ["approve", "reject", "escalate", "close", "request_info", null],
      default: null,
    },
  },
  { _id: true }
);

// ── Template schema ───────────────────────────────────────────────────────────

const workflowTemplateSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: true,
      trim:     true,
      maxlength: 120,
    },
    description: {
      type:     String,
      trim:     true,
      maxlength: 500,
      default:  "",
    },
    // Which request types this template automatically applies to.
    // Empty array = manual assignment only (no auto-apply).
    appliesToTypes: {
      type:    [String],
      default: [],
    },
    // "request" or "leave" — which entity kind this template is for
    entityKind: {
      type:    String,
      enum:    ["request", "leave"],
      default: "request",
    },
    // Only one template can be active per (entityKind, requestType) combination.
    // Enforced at the application layer (not a unique index — types are an array).
    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },
    stages: {
      type: [stageSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message:   "A workflow template must have at least one stage",
      },
    },
    // Schema version for future migrations
    version: {
      type:    Number,
      default: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
workflowTemplateSchema.index({ entityKind: 1, isActive: 1 });
workflowTemplateSchema.index({ appliesToTypes: 1, isActive: 1 });

// ── Virtuals / helpers ────────────────────────────────────────────────────────

/**
 * Return stages sorted by order ascending (defensive — they should already be sorted).
 */
workflowTemplateSchema.methods.sortedStages = function () {
  return [...this.stages].sort((a, b) => a.order - b.order);
};

module.exports = mongoose.model("WorkflowTemplate", workflowTemplateSchema);
