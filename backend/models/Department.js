/**
 * Department — persistent department registry.
 *
 * Previously departments were free-text strings on User/Request documents
 * with no central list.  This model adds persistence while remaining
 * backward-compatible:  the `department` field on User/Request stays a plain
 * string; this collection is the authoritative master list.
 */
const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  true,
      trim:      true,
      unique:    true,
      maxlength: 100,
    },
    description: {
      type:      String,
      trim:      true,
      maxlength: 500,
      default:   "",
    },
    // Soft-delete — deactivated departments no longer appear in dropdowns
    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Case-insensitive unique index (MongoDB collation)
departmentSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("Department", departmentSchema);
