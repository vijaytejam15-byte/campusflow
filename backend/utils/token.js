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

// Cookie name defined here to break circular dependency with auth.js
// (auth.js imports token.js; token.js must NOT import auth.js)
const COOKIE_NAME    = "token";
const REFRESH_COOKIE = "refreshToken";

// ── Token lifetimes ───────────────────────────────────────────────────────────
const ACCESS_EXPIRES_IN  = process.env.JWT_EXPIRES_IN  || "15m";
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_IN  || "30d";

function parseExpiry(str) {
  const match = String(str).match(/^(\d+)([smhd])$/);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
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

const signToken = signAccessToken; // backward-compat alias

function signRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function cookieOpts(maxAgeMs) {
  const NODE_ENV     = process.env.NODE_ENV     || "development";
  const LOCAL_DOCKER = process.env.LOCAL_DOCKER === "true";
  const isProd       = NODE_ENV === "production" && !LOCAL_DOCKER;
  return {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge:   maxAgeMs,
    path:     "/",
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOpts(15 * 60 * 1000));
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
  signToken,
  signAccessToken,
  signRefreshToken,
  hashToken,
  verifyAccessToken,
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  COOKIE_NAME,
  REFRESH_COOKIE,
  REFRESH_MS,
};
