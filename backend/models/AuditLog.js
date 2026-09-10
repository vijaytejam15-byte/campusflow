/**
 * AuditLog — Feature 7: Unified Audit Trail
 *
 * Records every significant mutation across the system:
 *   - Workflow stage advances
 *   - Request status changes
 *   - Leave decisions
 *   - User management actions
 *   - Template changes
 *
 * Written by the auditLog middleware helper (see services/audit.service.js).
 * Never deleted — append-only.
 */
"use strict";
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    // Who performed the action
    actorId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    actorName:  { type: String, default: "" },
    actorRole:  { type: String, default: "" },

    // What was done
    action: {
      type:     String,
      required: true,
      trim:     true,
      maxlength: 120,
      index:    true,
    },

    // What entity was affected
    entityKind: {
      type:  String,
      enum:  ["request","leave","workflow_instance","workflow_template","user","department","leave_type","system"],
      index: true,
    },
    entityId:   { type: mongoose.Schema.Types.ObjectId, index: true },
    entityRef:  { type: String, default: "" },  // human-readable (e.g. request type)

    // State snapshots (optional — omit for performance on high-frequency writes)
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after:  { type: mongoose.Schema.Types.Mixed, default: null },

    // Request metadata
    ip:         { type: String, default: "" },
    userAgent:  { type: String, default: "" },

    // Any extra structured context
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    // No updates — insert-only
    versionKey: false,
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ entityKind: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
