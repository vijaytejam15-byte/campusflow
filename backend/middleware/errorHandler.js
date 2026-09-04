/**
 * errorHandler.js — Centralised error handling.
 * Uses Winston logger so all errors are structured/searchable in production.
 */
const logger = require("../config/logger");

function notFound(req, res, next) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Mongoose validation errors
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({ message: messages.join(", ") || "Validation error" });
  }

  // Invalid ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid identifier" });
  }

  // Duplicate key
  if (err.code === 11000) {
    return res.status(409).json({ message: "Duplicate value" });
  }

  // Malformed JSON
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Malformed JSON body" });
  }

  // Explicit status from upstream (e.g. upload middleware)
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;

  if (status >= 500) {
    logger.error("Unhandled server error", {
      message: err.message,
      stack:   err.stack,
      method:  req.method,
      path:    req.path,
    });
  }

  res.status(status).json({ message: err.message || "Server error" });
}

module.exports = { notFound, errorHandler };
