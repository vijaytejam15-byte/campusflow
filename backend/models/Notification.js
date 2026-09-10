/**
 * Notification — Feature 6: Notification Center
 *
 * Persistent in-app notifications. One document per user per event.
 * Separate from Socket.io (which is ephemeral) — these survive page reloads.
 */
"use strict";
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },
    type: {
      type: String,
      enum: [
        "request_submitted",
        "request_status_changed",
        "request_assigned",
        "leave_submitted",
        "leave_status_changed",
        "workflow_stage_advanced",
        "workflow_approved",
        "workflow_rejected",
        "sla_warning",
        "sla_breached",
        "system",
      ],
      required: true,
    },
    title:   { type: String, required: true, trim: true, maxlength: 200 },
    body:    { type: String, trim: true, maxlength: 1000, default: "" },
    read:    { type: Boolean, default: false, index: true },
    // Link to the related entity
    entityKind: { type: String, enum: ["request","leave","workflow_instance","system"], default: "system" },
    entityId:   { type: mongoose.Schema.Types.ObjectId, default: null },
    // Optional action URL for the frontend to navigate to
    actionUrl:  { type: String, default: "" },
  },
  {
    timestamps:  true,
    versionKey:  false,
  }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

// Auto-delete notifications older than 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model("Notification", notificationSchema);
