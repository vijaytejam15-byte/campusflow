const mongoose = require("mongoose");

// ── Enum constants ─────────────────────────────────────────────────────────────

const REQUEST_TYPES = [
  "transcript",
  "enrollment_verification",
  "leave_of_absence",
  "grade_appeal",
  "financial_aid",
  "course_withdrawal",
  "general",
];

const PRIORITIES = ["low", "normal", "high", "urgent"];

// SLA hours per priority (how long before a request is considered overdue)
const SLA_HOURS = {
  low:    72,   // 3 days
  normal: 48,   // 2 days
  high:   24,   // 1 day
  urgent: 4,    // 4 hours
};

// Full lifecycle:
//   pending    → submitted by student, awaiting faculty pick-up
//   in_review  → faculty opened / is reviewing
//   approved   → faculty/HOD approved
//   rejected   → faculty/HOD rejected
//   escalated  → faculty escalated to HOD for decision
//   closed     → administratively closed
const STATUSES = [
  "pending",
  "in_review",
  "approved",
  "rejected",
  "escalated",
  "closed",
];

// Reviewer roles that can appear in the comments log
const REVIEWER_ROLES = ["faculty", "hod", "admin"];

// ── Sub-schemas ────────────────────────────────────────────────────────────────

const attachmentSchema = new mongoose.Schema(
  {
    filename:     { type: String, required: true, maxlength: 255 },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType:     { type: String, maxlength: 100, default: "" },
    size:         { type: Number, default: 0 },
  },
  { _id: false }
);

// Each entry in the comments/history log records who did what and when.
const commentSchema = new mongoose.Schema(
  {
    // The User ObjectId of the reviewer who added this entry
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
      required: true,
    },
    // Denormalised name so the log stays readable even if the user is deleted
    userName: { type: String, trim: true, maxlength: 100, default: "" },
    // Role at the time the comment was made
    role: {
      type: String,
      enum: [...REVIEWER_ROLES, "student"],
      default: "faculty",
    },
    // The free-text remark
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    // The action taken when this comment was added
    action: {
      type: String,
      enum: ["comment", "approve", "reject", "escalate", "reopen", "close"],
      default: "comment",
    },
    // Status the request was transitioned TO by this action
    statusSnapshot: {
      type: String,
      enum: STATUSES,
      default: "pending",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ── Main schema ────────────────────────────────────────────────────────────────

const requestSchema = new mongoose.Schema(
  {
    // Submitting student
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },

    type: {
      type:     String,
      required: true,
      enum:     REQUEST_TYPES,
      default:  "general",
    },

    description: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 3000,
    },

    department: {
      type:      String,
      trim:      true,
      maxlength: 100,
      default:   "",
    },

    priority: {
      type:    String,
      enum:    PRIORITIES,
      default: "normal",
    },

    status: {
      type:    String,
      enum:    STATUSES,
      default: "pending",
      index:   true,
    },

    // The reviewer (faculty/HOD user) currently handling this request.
    // Null until a reviewer picks it up.
    assignedTo: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
      index:   true,
    },

    // Most-recent staff-facing note surfaced to the student
    staffNote: {
      type:      String,
      trim:      true,
      maxlength: 2000,
      default:   "",
    },

    // Full audit log — every status change and remark appended here
    comments: {
      type:    [commentSchema],
      default: [],
    },

    attachments: {
      type:    [attachmentSchema],
      default: [],
    },

    // When the reviewer last acted on this request
    reviewedAt: {
      type:    Date,
      default: null,
    },

    // ── SLA fields ────────────────────────────────────────────────────────────
    // Deadline computed from priority at creation time
    slaDeadline: {
      type:    Date,
      default: null,
      index:   true,
    },
    // True once the SLA deadline has passed without resolution
    slaBreached: {
      type:    Boolean,
      default: false,
      index:   true,
    },
    // True if this request was escalated automatically by the scheduler
    autoEscalated: {
      type:    Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ── Compound indexes (performance-critical queries) ────────────────────────────
// Student dashboard: own requests sorted by date
requestSchema.index({ student: 1, createdAt: -1 });
// Reviewer queue: by assignedTo + active status
requestSchema.index({ assignedTo: 1, status: 1 });
// Department-scoped queue
requestSchema.index({ department: 1, status: 1 });
// SLA escalation job: finds open + past-deadline requests efficiently
requestSchema.index({ status: 1, slaDeadline: 1, slaBreached: 1 });
// Admin analytics: count by status (covered by { status: 1 })
// Admin monthly trend: createdAt range scan
requestSchema.index({ createdAt: -1 });
// Admin type breakdown
requestSchema.index({ type: 1, status: 1 });

const Request = mongoose.model("Request", requestSchema);

module.exports = Request;
module.exports.REQUEST_TYPES   = REQUEST_TYPES;
module.exports.PRIORITIES      = PRIORITIES;
module.exports.STATUSES        = STATUSES;
module.exports.REVIEWER_ROLES  = REVIEWER_ROLES;
module.exports.SLA_HOURS       = SLA_HOURS;
