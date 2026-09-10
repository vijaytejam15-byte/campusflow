/**
 * socketHandler.js — Socket.io initialisation and event wiring.
 *
 * Architecture
 * ────────────
 * • Each authenticated user joins a private room:  "user:<userId>"
 * • Each role joins a shared role room:            "role:faculty", "role:hod", "role:admin"
 * • The same JWT cookie used by HTTP is verified on the socket handshake,
 *   so no separate token is needed.
 *
 * Emitted events (server → client)
 * ──────────────────────────────────
 * REQUEST_CREATED        → emitted to relevant role rooms when a student submits
 * REQUEST_STATUS_UPDATED → emitted to the student's user room + role rooms
 *
 * This module exports:
 *   initSocket(httpServer)  — call once in server.js after creating the http server
 *   getIO()                 — returns the io instance for use in route handlers
 */

const { Server } = require("socket.io");
const jwt        = require("jsonwebtoken");
const cookie     = require("cookie");

let io = null;
// Lazy-require to avoid circular deps at module load
let _notifSvc = null;
function getNotifSvc() {
  if (!_notifSvc) _notifSvc = require("../services/notification.service");
  return _notifSvc;
}

function initSocket(httpServer, { frontendUrl, jwtSecret }) {
  io = new Server(httpServer, {
    cors: {
      origin:      frontendUrl || "http://localhost:3000",
      credentials: true,
    },
  });

  // ── Auth middleware ────────────────────────────────────────────────────────
  io.use((socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie || "";
      const cookies   = cookie.parse(rawCookie);
      const token     = cookies["token"];
      if (!token) return next(new Error("Not authenticated"));
      const payload   = jwt.verify(token, jwtSecret);
      socket.userId   = payload.id;
      next();
    } catch {
      next(new Error("Invalid or expired session"));
    }
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on("connection", async (socket) => {
    socket.join(`user:${socket.userId}`);

    socket.on("JOIN_ROLE_ROOM", (role) => {
      const validRoles = ["student", "faculty", "hod", "admin"];
      if (validRoles.includes(role)) socket.join(`role:${role}`);
    });

    socket.on("disconnect", () => {});
  });

  // Wire io into notification service so it can push real-time events
  getNotifSvc().setIO(io);

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.io has not been initialised. Call initSocket() first.");
  return io;
}

// ── Emitter helpers (called from route handlers) ──────────────────────────────

/**
 * Notify reviewers that a new request was created.
 * @param {{ request, studentName }} payload
 */
function emitRequestCreated(payload) {
  if (!io) return;
  // Notify faculty, hod, admin role rooms
  ["faculty", "hod", "admin"].forEach((role) => {
    io.to(`role:${role}`).emit("REQUEST_CREATED", payload);
  });
}

/**
 * Notify the student (and optionally admins) that their request was updated.
 * @param {{ request, reviewerName, newStatus }} payload
 */
function emitRequestStatusUpdated(studentId, payload) {
  if (!io) return;
  // Notify the student's private room
  io.to(`user:${studentId}`).emit("REQUEST_STATUS_UPDATED", payload);
  // Also notify admin room so dashboards can update counts
  io.to("role:admin").emit("REQUEST_STATUS_UPDATED", payload);
}

module.exports = { initSocket, getIO, emitRequestCreated, emitRequestStatusUpdated };
