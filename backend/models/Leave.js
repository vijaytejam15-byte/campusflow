/**
 * Leave — a student's leave application.
 *
 * Workflow:
 *   PENDING → APPROVED | REJECTED | CANCELLED
 *
 * Multi-level: student → assigned staff/advisor → (optional HOD escalation)
 */
const mongoose = require("mongoose");

const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"];

// Every staff action is recorded here (approval, rejection, comment)
const leaveCommentSchema = new mongoose.Schema(
  {
    user:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, trim: true, maxlength: 100, default: "" },
    role:     { type: String, enum: ["faculty", "hod", "admin", "student"], default: "faculty" },
    comment:  { type: String, required: true, trim: true, maxlength: 2000 },
    action:   {
      type: String,
      enum: ["comment", "approve", "reject", "cancel", "reopen"],
      default: "comment",
    },
    statusSnapshot: { type: String, enum: LEAVE_STATUSES, default: "pending" },
    createdAt:      { type: Date, default: Date.now },
  },
  { _id: true }
);

const leaveSchema = new mongoose.Schema(
  {
    // ── Who ────────────────────────────────────────────────────────────────
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },
    // Staff member assigned to review this leave
    reviewedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
      index:   true,
    },

    // ── What ───────────────────────────────────────────────────────────────
    leaveType: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "LeaveType",
      required: true,
    },
    // Denormalised name so history stays readable even if type is deleted
    leaveTypeName: {
      type:    String,
      trim:    true,
      maxlength: 80,
      default: "",
    },

    // ── When ───────────────────────────────────────────────────────────────
    startDate: { type: Date, required: true, index: true },
    endDate:   { type: Date, required: true },
    // Computed and stored at creation (includes start and end days)
    totalDays: { type: Number, min: 1, default: 1 },

    // ── Why ────────────────────────────────────────────────────────────────
    reason: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 2000,
    },

    // ── Documents ──────────────────────────────────────────────────────────
    // Metadata only — same pattern as existing Request attachments
    documents: [
      {
        filename:     { type: String, required: true, maxlength: 255 },
        originalName: { type: String, required: true, maxlength: 255 },
        mimeType:     { type: String, maxlength: 100, default: "" },
        size:         { type: Number, default: 0 },
        _id:          false,
      },
    ],

    // ── Status ─────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    LEAVE_STATUSES,
      default: "pending",
      index:   true,
    },

    // Staff rejection/approval note visible to student
    staffNote: {
      type:    String,
      trim:    true,
      maxlength: 2000,
      default: "",
    },

    // Full activity log
    comments: {
      type:    [leaveCommentSchema],
      default: [],
    },

    // When a reviewer last acted
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Compound indexes ───────────────────────────────────────────────────────────
// Student "my leaves" page sorted by date
leaveSchema.index({ student: 1, startDate: 1, endDate: 1 });
leaveSchema.index({ student: 1, status: 1 });
// Staff queue: pending leaves, newest first
leaveSchema.index({ status: 1, createdAt: 1 });
// Admin all-leaves filtered by status
leaveSchema.index({ status: 1, createdAt: -1 });
// Leave type stats aggregation
leaveSchema.index({ leaveTypeName: 1 });

const Leave = mongoose.model("Leave", leaveSchema);

module.exports = Leave;
module.exports.LEAVE_STATUSES = LEAVE_STATUSES;
