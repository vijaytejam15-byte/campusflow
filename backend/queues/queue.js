/**
 * queue.js — BullMQ queue/worker factory with in-process fallback.
 *
 * When REDIS_ENABLED=true   → jobs are enqueued in Redis via BullMQ,
 *                             processed by a Worker with retry handling.
 * When REDIS_ENABLED=false  → jobs run in-process synchronously
 *                             (safe for dev/test, no Redis needed).
 *
 * Usage:
 *   const { enqueue } = require('./queues/queue');
 *   await enqueue('email', { type: 'requestSubmitted', payload: {...} });
 */

const { REDIS_ENABLED, getRedisConnection } = require("../config/redis");
const logger = require("../config/logger");

// Registry of handler functions: queueName → async (job) => void
const _handlers = {};

// BullMQ Queue + Worker instances (only when Redis enabled)
const _queues  = {};
const _workers = {};

/**
 * Register a handler for a named queue.
 * Must be called before enqueue() is used for that queue name.
 */
function registerHandler(queueName, handlerFn) {
  _handlers[queueName] = handlerFn;

  if (!REDIS_ENABLED) return; // direct execution — no BullMQ needed

  const { Queue, Worker } = require("bullmq");
  const connection        = getRedisConnection();

  // Create queue
  _queues[queueName] = new Queue(queueName, { connection });

  // Create worker with retry configuration
  _workers[queueName] = new Worker(
    queueName,
    async (job) => {
      logger.debug(`[Queue:${queueName}] Processing job`, { jobId: job.id, name: job.name });
      await handlerFn(job.data);
      logger.debug(`[Queue:${queueName}] Job done`, { jobId: job.id });
    },
    {
      connection,
      concurrency: 3,
      defaultJobOptions: {
        attempts:  3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail:     { count: 200 },
      },
    }
  );

  _workers[queueName].on("failed", (job, err) => {
    logger.error(`[Queue:${queueName}] Job failed`, {
      jobId:    job?.id,
      attempt:  job?.attemptsMade,
      error:    err.message,
    });
  });

  _workers[queueName].on("error", (err) => {
    logger.error(`[Queue:${queueName}] Worker error`, { error: err.message });
  });
}

/**
 * Enqueue a job.
 * @param {string} queueName
 * @param {object} data
 * @param {object} [opts]  BullMQ job options (only used when Redis enabled)
 */
async function enqueue(queueName, data, opts = {}) {
  const handler = _handlers[queueName];

  if (!REDIS_ENABLED) {
    // Direct in-process execution
    if (!handler) {
      logger.warn(`[Queue] No handler for "${queueName}" — skipping`);
      return;
    }
    try {
      await handler(data);
    } catch (err) {
      logger.error(`[Queue:${queueName}] Direct execution failed`, { error: err.message });
    }
    return;
  }

  // BullMQ enqueue
  const queue = _queues[queueName];
  if (!queue) {
    logger.warn(`[Queue] Queue "${queueName}" not initialized — skipping`);
    return;
  }
  await queue.add(queueName, data, {
    attempts: 3,
    backoff:  { type: "exponential", delay: 2000 },
    ...opts,
  });
}

/**
 * Graceful shutdown — close all workers and queues.
 */
async function closeQueues() {
  if (!REDIS_ENABLED) return;
  await Promise.allSettled([
    ...Object.values(_workers).map((w) => w.close()),
    ...Object.values(_queues).map((q)  => q.close()),
  ]);
}

module.exports = { registerHandler, enqueue, closeQueues };
