/**
 * token.js — JWT access token + refresh token utilities.
 *
 * Access token:  short-lived (15 min), stored in HTTP-only cookie "token"
 * Refresh token: long-lived (30 days), stored in HTTP-only cookie "refreshToken"
 *                also persisted (hashed) in RefreshToken collection for rotation.
 *
 * Backward compatible: existing "token" cookie name is preserved.
 */

const jwt    = require("jsonwebtoken");
const crypto = require("crypto");

const { COOKIE_NAME } = require("../middleware/auth");
const REFRESH_COOKIE  = "refreshToken";

// ── Token lifetimes ───────────────────────────────────────────────────────────
const ACCESS_EXPIRES_IN  = process.env.JWT_EXPIRES_IN  || "15m";
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_IN  || "30d";

// Convert REFRESH_EXPIRES_IN string to milliseconds for cookie maxAge
function parseExpiry(str) {
  const match = String(str).match(/^(\d+)([smhd])$/);
  if (!match) return 30 * 24 * 60 * 60 * 1000; // fallback 30d
  const [, n, unit] = match;
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return Number(n) * (multipliers[unit] || 86400000);
}

const REFRESH_MS = parseExpiry(REFRESH_EXPIRES_IN);

function signAccessToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role || "student" },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

// Legacy alias kept for any callers that use signToken
const signToken = signAccessToken;

function signRefreshToken(userId) {
  // Raw token is a random 64-char hex string — NOT a JWT
  // (avoids needing a second secret, and the DB row IS the validity check)
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

// ── Cookie setters ────────────────────────────────────────────────────────────

function cookieOpts(maxAgeMs) {
  const NODE_ENV    = process.env.NODE_ENV    || "development";
  const LOCAL_DOCKER = process.env.LOCAL_DOCKER === "true";

  // In production over HTTPS: secure=true, sameSite=none (cross-origin cookies work)
  // In local Docker (http://localhost): secure=false, sameSite=lax (cookies work over HTTP)
  // In development: secure=false, sameSite=lax
  const isProd = NODE_ENV === "production" && !LOCAL_DOCKER;

  return {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge:   maxAgeMs,
    path:     "/",
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOpts(15 * 60 * 1000)); // 15 min
}

function setRefreshCookie(res, raw) {
  res.cookie(REFRESH_COOKIE, raw, cookieOpts(REFRESH_MS));
}

function clearAuthCookie(res) {
  const opts = cookieOpts(0);
  res.clearCookie(COOKIE_NAME,    { ...opts, maxAge: undefined });
  res.clearCookie(REFRESH_COOKIE, { ...opts, maxAge: undefined });
}

module.exports = {
  signToken,           // backward-compat alias
  signAccessToken,
  signRefreshToken,
  hashToken,
  verifyAccessToken,
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  REFRESH_COOKIE,
  REFRESH_MS,
};
