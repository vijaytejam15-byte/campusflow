/**
 * redis.js — Shared Redis/IORedis connection for BullMQ.
 *
 * REDIS_URL env var controls the connection (defaults to localhost:6379).
 * When REDIS_ENABLED=false (the default in development), all queue operations
 * fall back to in-process direct execution so the app works without Redis.
 *
 * SECURITY: Connection string may contain credentials — never log it.
 */
const logger = require("./logger");

const REDIS_ENABLED = process.env.REDIS_ENABLED === "true";
const REDIS_URL     = process.env.REDIS_URL || "redis://localhost:6379";

let _connection = null;

/**
 * Get the shared IORedis connection.
 * Returns null when Redis is disabled (dev mode).
 */
function getRedisConnection() {
  if (!REDIS_ENABLED) return null;
  if (_connection) return _connection;

  const IORedis = require("ioredis");
  _connection   = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck:     false,
    lazyConnect:          true,
  });

  _connection.on("connect",        () => logger.info("[Redis] Connected"));
  _connection.on("reconnecting",   () => logger.warn("[Redis] Reconnecting…"));
  _connection.on("error",  (err) => logger.error("[Redis] Connection error", { error: err.message }));

  return _connection;
}

async function closeRedis() {
  if (_connection) {
    await _connection.quit().catch(() => {});
    _connection = null;
  }
}

module.exports = { getRedisConnection, closeRedis, REDIS_ENABLED };
