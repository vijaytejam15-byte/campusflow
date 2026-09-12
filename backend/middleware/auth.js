/**
 * auth.js — Authentication middleware.
 *
 * requireAuth checks the "token" HTTP-only cookie (short-lived JWT).
 * If the access token is expired, it transparently tries the refresh cookie,
 * issues a new access token, and continues — so frontend code never has to
 * handle token rotation manually.
 */

const { verifyAccessToken, signAccessToken, hashToken, setAuthCookie, COOKIE_NAME } = require("../utils/token");
const RefreshToken = require("../models/RefreshToken");
const User         = require("../models/User");

async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return _tryRefresh(req, res, next);
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.id;
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return _tryRefresh(req, res, next);
    }
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

async function _tryRefresh(req, res, next) {
  const raw = req.cookies?.refreshToken;
  if (!raw) return res.status(401).json({ message: "Not authenticated" });

  try {
    const hash   = hashToken(raw);
    const stored = await RefreshToken.findOne({
      tokenHash: hash,
      expiresAt: { $gt: new Date() },
    });

    if (!stored) return res.status(401).json({ message: "Session expired, please log in again" });

    const user = await User.findById(stored.userId).select("_id role").lean();
    if (!user) return res.status(401).json({ message: "User not found" });

    const newAccess = signAccessToken(user);
    setAuthCookie(res, newAccess);

    req.userId = user._id.toString();
    return next();
  } catch {
    return res.status(401).json({ message: "Session expired, please log in again" });
  }
}

module.exports = { requireAuth, COOKIE_NAME };
