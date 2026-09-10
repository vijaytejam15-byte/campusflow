/**
 * auditTrail.routes.js — Feature 7: Unified Audit Trail
 *
 * GET /api/admin/audit-trail   — paginated, filterable audit log (admin only)
 *   query params: page, limit, action, entityKind, actorId, from, to
 *
 * Supplements the existing /api/admin/audit-logs (which only covers Request
 * comments). This endpoint covers ALL system mutations.
 */
"use strict";

const express   = require("express");
const mongoose  = require("mongoose");
const AuditLog  = require("../models/AuditLog");
const User      = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("role").lean();
    if (!user || user.role !== "admin")
      return res.status(403).json({ message: "Admin access required" });
    next();
  } catch (err) { next(err); }
}

router.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const {
      page = "1", limit = "30",
      action, entityKind, actorId,
      from, to,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const skip     = (pageNum - 1) * limitNum;

    const filter = {};
    if (action)     filter.action     = { $regex: action, $options: "i" };
    if (entityKind) filter.entityKind = entityKind;
    if (actorId && mongoose.Types.ObjectId.isValid(actorId)) filter.actorId = actorId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("actorId", "name email role")
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      logs,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) { next(err); }
});

module.exports = router;
