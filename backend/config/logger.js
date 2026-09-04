/**
 * logger.js — Structured application logger using Winston.
 *
 * Every log line includes the correlation ID of the current request
 * (when called within a request context) so a single HTTP call can be
 * traced through all log output.
 *
 * Outputs:
 *   Development: coloured, human-readable console output
 *   Production:  JSON lines (captured by container / PM2 / CloudWatch)
 *
 * SECURITY: Never log passwords, JWT tokens, cookie values, secrets or PII.
 */

const { createLogger, format, transports } = require("winston");
const { combine, timestamp, errors, json, colorize, printf } = format;

const NODE_ENV = process.env.NODE_ENV || "development";
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === "production" ? "info" : "debug");

// Inject correlation ID into every log entry
const correlationFormat = format((info) => {
  try {
    // Lazy-require to avoid circular dependency at module load time
    const { getCorrelationId } = require("../middleware/correlationId");
    const cid = getCorrelationId();
    if (cid) info.correlationId = cid;
  } catch { /* outside request context — skip */ }
  return info;
})();

// Human-readable format for development
const devFormat = combine(
  correlationFormat,
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, correlationId, ...meta }) => {
    const cidStr  = correlationId ? ` [${correlationId.slice(0, 8)}]` : "";
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${ts}${cidStr} [${level}] ${message}${metaStr}${stack ? `\n${stack}` : ""}`;
  })
);

// JSON format for production
const prodFormat = combine(
  correlationFormat,
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = createLogger({
  level:       LOG_LEVEL,
  format:      NODE_ENV === "production" ? prodFormat : devFormat,
  transports:  [new transports.Console()],
  exitOnError: false,
});

// HTTP access log middleware
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const ms    = Date.now() - start;
    const level = res.statusCode >= 500 ? "error"
                : res.statusCode >= 400 ? "warn"
                : "debug";
    logger[level]("HTTP", {
      method:        req.method,
      path:          req.path,
      status:        res.statusCode,
      durationMs:    ms,
      ip:            req.ip,
      correlationId: req.correlationId,
    });
  });
  next();
}

module.exports = logger;
module.exports.requestLogger = requestLogger;
