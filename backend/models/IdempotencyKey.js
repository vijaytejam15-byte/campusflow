/**
 * IdempotencyKey — Feature 8: Idempotency
 *
 * Stores the result of a completed mutating request keyed by
 * (userId + idempotency-key header value).  On a duplicate request,
 * the stored response is returned immediately without re-processing.
 *
 * Keys expire after 24 hours (TTL index).
 */
"use strict";
const mongoose = require("mongoose");

const idempotencyKeySchema = new mongoose.Schema(
  {
    // SHA-256(userId + ":" + raw key header value)
    keyHash: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    path:       { type: String, required: true },       // request path
    method:     { type: String, required: true },       // HTTP method
    statusCode: { type: Number, required: true },
    response:   { type: mongoose.Schema.Types.Mixed },  // stored response body
    expiresAt:  { type: Date,   required: true },
  },
  {
    timestamps:  true,
    versionKey:  false,
  }
);

// TTL index — auto-expire
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("IdempotencyKey", idempotencyKeySchema);
