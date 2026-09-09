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
// ── Workflow engine routes (additive) ─────────────────────────────────────────
const workflowInstanceRoutes = require("./routes/workflowInstance.routes");
const configRoutes           = require("./routes/config.routes");
const departmentRoutes       = require("./routes/department.routes");

const { initSocket }     = require("./socket/socketHandler");
const { startEscalationJob } = require("./jobs/escalation.job");
const { initWorkers, closeQueues } = require("./queues/workers");
const { notFound, errorHandler }   = require("./middleware/errorHandler");
const { requireAuth }    = require("./middleware/auth");
const storageSvc         = require("./services/storage.service");
const { uploadDocuments } = require("./middleware/upload");

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

// ── File upload endpoint ──────────────────────────────────────────────────────
// POST /api/upload — authenticated users upload 1-5 files, get back metadata.
// The returned filename array is then included in the JSON body of the
// request/leave submission so the main routes stay JSON-only.
app.post("/api/upload", requireAuth, uploadDocuments, async (req, res) => {
  try {
    const files = req.uploadedFiles || [];
    if (files.length === 0)
      return res.status(400).json({ message: "No files uploaded" });

    // For local driver files are already on disk (multer wrote them).
    // For S3 driver we would stream them to S3 here — left as future work;
    // local is the default and the one tested.
    const result = files.map(({ filename, originalName, mimeType, size }) => ({
      filename,
      originalName,
      mimeType,
      size,
    }));

    logger.debug("[Upload] Files received", { count: files.length });
    res.status(201).json({ message: "Files uploaded", files: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Secure file download ───────────────────────────────────────────────────────
// Only the file owner (student who submitted) or a reviewer/admin may download.
app.get("/api/files/:key", requireAuth, async (req, res) => {
  const key = req.params.key;

  // Authorisation: file must exist in a request or leave owned by this user,
  // or the caller must be a reviewer/admin.
  try {
    const caller = await require("./models/User").findById(req.userId).select("role").lean();
    const isReviewer = caller && ["faculty", "hod", "admin"].includes(caller.role);

    if (!isReviewer) {
      const Request = require("./models/Request");
      const Leave   = require("./models/Leave");
      const [inReq, inLeave] = await Promise.all([
        Request.exists({ student: req.userId, "attachments.filename": key }),
        Leave.exists({ student: req.userId, "documents.filename": key }),
      ]);
      if (!inReq && !inLeave)
        return res.status(403).json({ message: "Access denied" });
    }
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }

  if (storageSvc.DRIVER !== "local") {
    return res.status(400).json({ message: "Use signed URL for cloud storage downloads" });
  }
  try {
    const stream = storageSvc.getLocalReadStream(key);
    res.setHeader("Content-Disposition", `attachment; filename="${key}"`);
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
// ── Workflow engine (additive) ────────────────────────────────────────────────
app.use("/api",             workflowInstanceRoutes);
app.use("/api/config",      configRoutes);
app.use("/api/admin/departments", departmentRoutes);

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
