const mongoose = require("mongoose");

// ── Role constants ─────────────────────────────────────────────────────────────
const ROLES = ["student", "faculty", "hod", "admin"];

// Phase 1 fields (name, email, password, phoneNumber) are unchanged.
// Phase 2 adds department, semester, avatar, and role.
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ROLES,
      default: "student",
      index: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    semester: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },
    avatar: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
    },

    // ── Leave management fields ───────────────────────────────────────────
    // For students: remaining leave days this academic year (per type)
    // Stored as a Map<leaveTypeId, remainingDays>
    leaveBalance: {
      type:    Map,
      of:      Number,
      default: {},
    },
    // For students: the faculty member assigned as their class advisor
    advisorId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
      index:   true,
    },
    // Student roll number / registration number
    rollNumber: {
      type:    String,
      trim:    true,
      maxlength: 30,
      default: "",
    },
    // Student year / semester (e.g. "3rd Year", "Sem 5")
    year: {
      type:    String,
      trim:    true,
      maxlength: 20,
      default: "",
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
// Additional indexes beyond the inline ones:
// email is already unique (indexed). role is indexed inline.
// Compound for admin user list: role + createdAt sort
userSchema.index({ role: 1, createdAt: -1 });
// Department lookup for leave/request scoping
userSchema.index({ department: 1, role: 1 });
// Advisor assignment lookup
// advisorId is indexed inline
module.exports = User;
module.exports.ROLES = ROLES;
