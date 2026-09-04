require("dotenv").config();

const http         = require("http");
const express      = require("express");
const cors         = require("cors");
const cookieParser = require("cookie-parser");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");

const connectDatabase           = require("./config/db");
const swagger                   = require("./config/swagger");
const logger                    = require("./config/logger");
const { requestLogger }         = require("./config/logger");
const { correlationMiddleware } = require("./middleware/correlationId");

const authRoutes      = require("./routes/auth.routes");
const profileRoutes   = require("./routes/profile.routes");
const courseRoutes    = require("./routes/courses.routes");
const requestRoutes   = require("./routes/requests.routes");
const adminRoutes     = require("./routes/admin.routes");
const leaveRoutes     = require("./routes/leave.routes");
const leaveTypeRoutes = require("./routes/leaveType.routes");

const { initSocket }     = require("./socket/socketHandler");
const { startEscalationJob } = require("./jobs/escalation.job");
const { initWorkers, closeQueues } = require("./queues/workers");
const { notFound, errorHandler }   = require("./middleware/errorHandler");
const { requireAuth }    = require("./middleware/auth");
const storageSvc         = require("./services/storage.service");

const app    = express();
const server = http.createServer(app);

// ── Configuration ─────────────────────────────────────────────────────────────
const PORT         = process.env.PORT         || 5000;
const JWT_SECRET   = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const NODE_ENV     = process.env.NODE_ENV     || "development";

if (!JWT_SECRET) {
  logger.error("FATAL: JWT_SECRET is not set.");
  process.exit(1);
}

// ── Trust proxy (required when behind nginx/load-balancer for rate limiting + IP) ──
// Set to 1 when there is exactly one trusted reverse proxy (nginx container).
// Adjust the number to match how many proxies sit in front of Node.
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      styleSrc:   ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      imgSrc:     ["'self'", "data:", "cdn.jsdelivr.net"],
      fontSrc:    ["'self'", "fonts.gstatic.com"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// AUTH_RATE_LIMIT_MAX — override max attempts (useful for local dev/Docker Desktop).
// Defaults: 20 in production, 200 in local Docker, unlimited in test.
// Production is protected because LOCAL_DOCKER is never set outside Docker Desktop.
const AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX
  ? Number(process.env.AUTH_RATE_LIMIT_MAX)
  : (process.env.LOCAL_DOCKER === "true" ? 200 : 20);

const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { message: "Too many login attempts. Please try again in 15 minutes." },
  // Skip entirely in test (jest) and local Docker Desktop environments
  skip: () => NODE_ENV === "test" || process.env.LOCAL_DOCKER === "true",
});

const apiLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { message: "Too many requests. Please slow down." },
  skip: () => NODE_ENV === "test",
});

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(correlationMiddleware);
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use("/api", apiLimiter);
app.use(requestLogger);

// ── API Documentation ─────────────────────────────────────────────────────────
app.use("/api/docs", swagger.serve, swagger.setup);

// ── Health / Readiness ────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({ status: "ok", uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() })
);

app.get("/ready", async (_req, res) => {
  const mongoose = require("mongoose");
  const dbOk     = mongoose.connection.readyState === 1;
  if (dbOk) return res.json({ status: "ready", db: "connected" });
  return res.status(503).json({ status: "not ready", db: "disconnected" });
});

app.get("/", (_req, res) =>
  res.json({ message: "CampusFlow API", docs: "/api/docs", health: "/health" })
);

// ── Secure file download ───────────────────────────────────────────────────────
app.get("/api/files/:key", requireAuth, (req, res) => {
  if (storageSvc.DRIVER !== "local") {
    return res.status(400).json({ message: "Use signed URL for cloud storage downloads" });
  }
  try {
    const stream = storageSvc.getLocalReadStream(req.params.key);
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.key}"`);
    stream.pipe(res);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api",             authLimiter, authRoutes);
app.use("/api/profile",     profileRoutes);
app.use("/api/courses",     courseRoutes);
app.use("/api/requests",    requestRoutes);
app.use("/api/admin",       adminRoutes);
app.use("/api/leave",       leaveRoutes);
app.use("/api/leave-types", leaveTypeRoutes);

app.use(notFound);
app.use(errorHandler);

// ── Socket.io ─────────────────────────────────────────────────────────────────
initSocket(server, { frontendUrl: FRONTEND_URL, jwtSecret: JWT_SECRET });

// ── Graceful shutdown ───────────────────────────────────────────────────────── 
let _shuttingDown = false;

async function gracefulShutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  logger.info(`[Shutdown] ${signal} received — shutting down gracefully`);

  // Stop accepting new connections
  server.close(async () => {
    try {
      await closeQueues();
      logger.info("[Shutdown] BullMQ workers closed");

      const { closeRedis } = require("./config/redis");
      await closeRedis();
      logger.info("[Shutdown] Redis connection closed");

      const mongoose = require("mongoose");
      await mongoose.connection.close();
      logger.info("[Shutdown] MongoDB connection closed");

      logger.info("[Shutdown] Clean exit");
      process.exit(0);
    } catch (err) {
      logger.error("[Shutdown] Error during shutdown", { error: err.message });
      process.exit(1);
    }
  });

  // Force exit after 15s if connections hang
  setTimeout(() => {
    logger.error("[Shutdown] Forced exit after timeout");
    process.exit(1);
  }, 15000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

// Catch unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason: String(reason) });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  connectDatabase({ mongoUri: process.env.MONGO_URI, nodeEnv: NODE_ENV }).then(() => {
    initWorkers();

    // Verify SMTP connectivity at startup (non-blocking — server starts regardless)
    require("./services/email.service").verifyEmailConnection();

    server.listen(PORT, () => {
      logger.info("CampusFlow backend running", { port: PORT, env: NODE_ENV });
      logger.info(`API docs: http://localhost:${PORT}/api/docs`);
    });

    const { REDIS_ENABLED, getRedisConnection } = require("./config/redis");
    if (REDIS_ENABLED) {
      const { Queue } = require("bullmq");
      const scheduleQ = new Queue("escalation", { connection: getRedisConnection() });
      scheduleQ.add("scheduled-escalation", {}, {
        repeat:   { every: 15 * 60 * 1000 },
        jobId:    "sla-escalation-repeat",
        attempts: 3,
        backoff:  { type: "exponential", delay: 5000 },
      }).catch((err) => logger.error("Failed to schedule escalation job", { error: err.message }));
    } else {
      startEscalationJob(15 * 60 * 1000);
    }
  });
}

module.exports = app;
