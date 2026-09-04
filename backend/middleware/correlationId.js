/**
 * correlationId.js — Attaches a unique request ID to every request.
 *
 * The ID is:
 *   1. Taken from the incoming X-Request-ID header (if set by a proxy/client)
 *   2. Or generated as a UUID v4
 *
 * It is:
 *   - Attached to req.correlationId
 *   - Sent back in the X-Request-ID response header
 *   - Added to every Winston log entry for that request via AsyncLocalStorage
 *
 * This allows you to trace a single API call through all log lines.
 *
 * Usage: app.use(correlationMiddleware); — must be first middleware.
 */

const { AsyncLocalStorage } = require("async_hooks");
const { v4: uuidv4 }        = require("uuid");

// Storage: each request gets its own context
const als = new AsyncLocalStorage();

/**
 * Express middleware.
 */
function correlationMiddleware(req, res, next) {
  const id = (req.headers["x-request-id"] || uuidv4()).slice(0, 36);
  req.correlationId = id;
  res.setHeader("X-Request-ID", id);
  // Run the rest of the request chain inside the ALS context
  als.run({ correlationId: id }, next);
}

/**
 * Get the correlation ID for the current async context.
 * Returns undefined outside of a request.
 */
function getCorrelationId() {
  return als.getStore()?.correlationId;
}

module.exports = { correlationMiddleware, getCorrelationId };
