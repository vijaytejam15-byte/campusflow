/**
 * LeaveType — configurable leave categories managed by admin.
 *
 * Examples: Medical Leave, Casual Leave, Academic Leave,
 *           Emergency Leave, Study Leave
 */
const mongoose = require("mongoose");

const leaveTypeSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: true,
      trim:     true,
      unique:   true,
      maxlength: 80,
    },
    description: {
      type:     String,
      trim:     true,
      maxlength: 500,
      default:  "",
    },
    // Maximum leave days allowed per academic year (0 = unlimited)
    maxDaysPerYear: {
      type:    Number,
      min:     0,
      max:     365,
      default: 0,
    },
    // Whether supporting documents are required for this leave type
    requiresDocument: {
      type:    Boolean,
      default: false,
    },
    // Soft delete — deactivated types no longer appear in student form
    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LeaveType", leaveTypeSchema);
