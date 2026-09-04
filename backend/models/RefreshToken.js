/**
 * RefreshToken — persisted refresh token for rotation + revocation.
 *
 * Each login issues a unique refresh token stored here.
 * On refresh: old token is deleted, new one inserted (rotation).
 * On logout-all: all tokens for the user are deleted.
 *
 * Tokens are SHA-256 hashed before storage so the DB doesn't hold
 * raw secret values.
 */
const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },
    // SHA-256 hash of the raw token value
    tokenHash: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },
    // When this token expires (30 days)
    expiresAt: {
      type:     Date,
      required: true,
    },
    // Device/client hint for the UI (optional)
    userAgent: {
      type:    String,
      default: "",
      maxlength: 200,
    },
    ip: {
      type:    String,
      default: "",
      maxlength: 50,
    },
  },
  { timestamps: true }
);

// TTL index — MongoDB auto-deletes expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
