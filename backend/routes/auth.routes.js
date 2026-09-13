/**
 * auth.routes.js — Authentication endpoints.
 *
 * Existing endpoints (unchanged behaviour):
 *   POST /api/register
 *   POST /api/login
 *   GET  /api/me
 *   GET  /api/me/session
 *   POST /api/logout
 *
 * New endpoints:
 *   POST /api/refresh        — exchange refresh token for new access token
 *   POST /api/logout-all     — revoke all sessions for the current user
 */

const express  = require("express");
const bcrypt   = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const User         = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const { requireAuth }          = require("../middleware/auth");
const {
  signAccessToken,
  signToken,
  signRefreshToken,
  hashToken,
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  REFRESH_MS,
}                              = require("../utils/token");
const { EMAIL_REGEX }          = require("../utils/validators");
const publicUser               = require("../utils/publicUser");
const logger                   = require("../config/logger");
const { sendEmail }            = require("../services/email.service");

const router = express.Router();

// ── Auth-specific rate limiter (login / register / refresh only) ──────────────
const NODE_ENV = process.env.NODE_ENV || "development";
const AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX
  ? Number(process.env.AUTH_RATE_LIMIT_MAX)
  : (process.env.LOCAL_DOCKER === "true" ? 200 : 20);

const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { message: "Too many login attempts. Please try again in 15 minutes." },
  skip: () => NODE_ENV === "test" || process.env.LOCAL_DOCKER === "true",
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function issueTokenPair(user, res, req) {
  const access  = signAccessToken(user);
  const rawRef  = signRefreshToken(user._id);
  const expiry  = new Date(Date.now() + REFRESH_MS);

  // Persist hashed refresh token
  await RefreshToken.create({
    userId:    user._id,
    tokenHash: hashToken(rawRef),
    expiresAt: expiry,
    userAgent: (req?.headers?.["user-agent"] || "").slice(0, 200),
    ip:        req?.ip || "",
  });

  setAuthCookie(res, access);
  setRefreshCookie(res, rawRef);
}

// ── REGISTER ─────────────────────────────────────────────────────────────────

router.post("/register", authLimiter, async (req, res, next) => {
  try {
    let { name, email, password, phoneNumber } = req.body || {};

    if (!name || !email || !password)
      return res.status(400).json({ message: "Name, email and password are required" });

    email = String(email).trim().toLowerCase();
    name  = String(name).trim();

    if (name.length > 100)
      return res.status(400).json({ message: "Name must be under 100 characters" });
    if (!EMAIL_REGEX.test(email))
      return res.status(400).json({ message: "Please enter a valid email" });
    if (String(password).length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 12);
    const user   = new User({
      name,
      email,
      password: hashed,
      phoneNumber: phoneNumber ? String(phoneNumber).trim().slice(0, 30) : "",
    });
    await user.save();

    await issueTokenPair(user, res, req);

    logger.info("User registered", { userId: user._id, email });

    res.status(201).json({ message: "Registration successful", user: publicUser(user) });
  } catch (err) { next(err); }
});

// ── LOGIN ────────────────────────────────────────────────────────────────────

router.post("/login", authLimiter, async (req, res, next) => {
  try {
    let { email, password } = req.body || {};

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    email = String(email).trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ message: "Invalid email or password" });

    await issueTokenPair(user, res, req);

    logger.info("User logged in", { userId: user._id });

    res.json({ message: "Login successful", user: publicUser(user) });
  } catch (err) { next(err); }
});

// ── REFRESH TOKEN ─────────────────────────────────────────────────────────────

router.post("/refresh", authLimiter, async (req, res, next) => {
  try {
    const raw = req.cookies?.refreshToken;
    if (!raw)
      return res.status(401).json({ message: "No refresh token" });

    const hash   = hashToken(raw);
    const stored = await RefreshToken.findOne({
      tokenHash: hash,
      expiresAt: { $gt: new Date() },
    });

    if (!stored) {
      // Possible token reuse — clear cookies
      clearAuthCookie(res);
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const user = await User.findById(stored.userId);
    if (!user) {
      await RefreshToken.deleteOne({ _id: stored._id });
      clearAuthCookie(res);
      return res.status(401).json({ message: "User not found" });
    }

    // Rotate — delete old, issue new pair
    await RefreshToken.deleteOne({ _id: stored._id });
    await issueTokenPair(user, res, req);

    logger.debug("Token refreshed", { userId: user._id });

    res.json({ message: "Token refreshed", user: publicUser(user) });
  } catch (err) { next(err); }
});

// ── CURRENT USER ──────────────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(401).json({ message: "Not authenticated" });
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

// Alias for older clients
router.get("/me/session", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

// ── LOGOUT (current session) ──────────────────────────────────────────────────

router.post("/logout", async (req, res) => {
  // Revoke the current refresh token if present
  const raw = req.cookies?.refreshToken;
  if (raw) {
    await RefreshToken.deleteOne({ tokenHash: hashToken(raw) }).catch(() => {});
  }
  clearAuthCookie(res);
  res.json({ message: "Logout successful" });
});

// ── LOGOUT ALL SESSIONS ───────────────────────────────────────────────────────

router.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await RefreshToken.deleteMany({ userId: req.userId });
    clearAuthCookie(res);
    logger.info("All sessions revoked", { userId: req.userId });
    res.json({ message: "All sessions logged out" });
  } catch (err) { next(err); }
});

// ── CHANGE PASSWORD ────────────────────────────────────────────────────────────

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "currentPassword and newPassword are required" });

    if (String(newPassword).length < 6)
      return res.status(400).json({ message: "New password must be at least 6 characters" });

    if (String(newPassword).length > 128)
      return res.status(400).json({ message: "New password must be under 128 characters" });

    if (currentPassword === newPassword)
      return res.status(400).json({ message: "New password must differ from the current password" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const match = await bcrypt.compare(String(currentPassword), user.password);
    if (!match)
      return res.status(401).json({ message: "Current password is incorrect" });

    user.password = await bcrypt.hash(String(newPassword), 12);
    await user.save();

    // Invalidate all existing refresh tokens (force re-login on other devices)
    await RefreshToken.deleteMany({ userId: req.userId });

    // Issue a fresh token pair for the current session so the user isn't logged out here
    await issueTokenPair(user, res, req);

    logger.info("Password changed", { userId: user._id });
    res.json({ message: "Password changed successfully. Other sessions have been logged out." });
  } catch (err) { next(err); }
});

module.exports = router;
