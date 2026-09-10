/**
 * idempotency.js — Feature 8: Idempotency
 *
 * When the client sends an `Idempotency-Key` header on a POST/PATCH request,
 * we store the response under a SHA-256 hash of (userId + ":" + key).
 * On a duplicate request with the same key, we return the cached response.
 *
 * TTL: 24 hours. Only applied to routes that use this middleware.
 */
"use strict";

const crypto         = require("crypto");
const IdempotencyKey = require("../models/IdempotencyKey");
const logger         = require("../config/logger");

const TTL_MS = 24 * 60 * 60 * 1000;

function hashKey(userId, rawKey) {
  return crypto.createHash("sha256")
    .update(`${userId}:${rawKey}`)
    .digest("hex");
}

function idempotency() {
  return async function idempotencyMiddleware(req, res, next) {
    const rawKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"];
    if (!rawKey || !req.userId) return next();

    const keyHash = hashKey(req.userId, rawKey);

    try {
      // Check for existing cached response
      const existing = await IdempotencyKey.findOne({ keyHash });
      if (existing) {
        logger.debug("[Idempotency] Returning cached response", { keyHash });
        return res.status(existing.statusCode).json({
          ...existing.response,
          _idempotent: true,
        });
      }

      // Intercept res.json to capture and store the response BEFORE sending
      const originalJson = res.json.bind(res);
      res.json = async function interceptedJson(body) {
        const statusCode = res.statusCode || 200;

        // Store first — only cache successful responses (2xx)
        if (statusCode >= 200 && statusCode < 300) {
          try {
            await IdempotencyKey.create({
              keyHash,
              userId:     req.userId,
              path:       req.path,
              method:     req.method,
              statusCode,
              response:   body,
              expiresAt:  new Date(Date.now() + TTL_MS),
            });
          } catch (err) {
            if (err.code !== 11000) {
              logger.warn("[Idempotency] Store failed", { error: err.message });
            }
          }
        }

        // Then send the response
        return originalJson(body);
      };

      next();
    } catch (err) {
      logger.warn("[Idempotency] Check failed (non-fatal)", { error: err.message });
      next();
    }
  };
}

module.exports = idempotency;
