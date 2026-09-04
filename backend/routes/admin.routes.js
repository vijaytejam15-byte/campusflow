/**
 * admin.routes.js — endpoints restricted to the admin role.
 *
 * All routes are mounted at /api/admin and require:
 *   1. requireAuth  — valid JWT cookie
 *   2. requireAdmin — user.role === "admin"
 */
const express  = require("express");
const mongoose = require("mongoose");

const User     = require("../models/User");
const Request  = require("../models/Request");
const { ROLES }    = require("../models/User");
const { STATUSES } = require("../models/Request");
const { requireAuth } = require("../middleware/auth");
const publicUser      = require("../utils/publicUser");

const router = express.Router();

// ── Middleware ────────────────────────────────────────────────────────────────

async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("role").lean();
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  } catch (err) { next(err); }
}

const guard = [requireAuth, requireAdmin];

// ── GET /api/admin/metrics ────────────────────────────────────────────────────
router.get("/metrics", guard, async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      usersByRole,
    ] = await Promise.all([
      User.countDocuments(),
      Request.countDocuments(),
      Request.countDocuments({ status: "pending" }),
      Request.countDocuments({ status: "approved" }),
      Request.countDocuments({ status: "rejected" }),
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    ]);

    res.json({
      metrics: {
        totalUsers,
        totalRequests,
        pendingRequests,
        approvedRequests,
        rejectedRequests,
        usersByRole: Object.fromEntries(usersByRole.map((r) => [r._id, r.count])),
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get("/users", guard, async (req, res, next) => {
  try {
    const { search, role, page = "1", limit = "20" } = req.query;

    const query = {};
    if (role && ROLES.includes(role)) query.role = role;
    if (search && String(search).trim()) {
      const term  = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(term, "i");
      query.$or   = [{ name: regex }, { email: regex }];
    }

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip     = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(query).select("-password").sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      User.countDocuments(query),
    ]);

    res.json({
      users: users.map(publicUser),
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) { next(err); }
});

// ── POST /api/admin/users — create a user ─────────────────────────────────────
router.post("/users", guard, async (req, res, next) => {
  try {
    const bcrypt   = require("bcryptjs");
    const { EMAIL_REGEX } = require("../utils/validators");

    let { name, email, password, role, department, phoneNumber } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    email = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(email))
      return res.status(400).json({ message: "Invalid email address" });
    if (String(password).length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    if (role && !ROLES.includes(role))
      return res.status(400).json({ message: `Role must be one of: ${ROLES.join(", ")}` });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: "Email already registered" });

    const hashed = await bcrypt.hash(password, 12);
    const user   = new User({
      name:        String(name).trim().slice(0, 100),
      email,
      password:    hashed,
      role:        role || "student",
      department:  department ? String(department).trim().slice(0, 100) : "",
      phoneNumber: phoneNumber ? String(phoneNumber).trim().slice(0, 30) : "",
    });
    await user.save();
    res.status(201).json({ message: "User created", user: publicUser(user) });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/users/:id/role — change a user's role ────────────────────
router.patch("/users/:id/role", guard, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid user id" });

    const { role } = req.body || {};
    if (!role || !ROLES.includes(role))
      return res.status(400).json({ message: `Role must be one of: ${ROLES.join(", ")}` });

    // Prevent an admin from demoting themselves
    if (req.params.id === req.userId.toString() && role !== "admin")
      return res.status(409).json({ message: "Cannot change your own admin role" });

    const user = await User.findByIdAndUpdate(
      req.params.id, { role }, { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Role updated", user: publicUser(user) });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete("/users/:id", guard, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid user id" });

    if (req.params.id === req.userId.toString())
      return res.status(409).json({ message: "Cannot delete your own account" });

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User deleted" });
  } catch (err) { next(err); }
});

// ── GET /api/admin/audit-logs ─────────────────────────────────────────────────
// Returns the comment/audit log across all requests — newest first, paginated.
router.get("/audit-logs", guard, async (req, res, next) => {
  try {
    const { page = "1", limit = "30", action, role } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const skip     = (pageNum - 1) * limitNum;

    // Match filter on embedded comments
    const matchStage = {};
    if (action) matchStage["comments.action"] = action;
    if (role)   matchStage["comments.role"]   = role;

    // Unwind comments into individual audit entries
    const pipeline = [
      { $unwind: { path: "$comments", preserveNullAndEmptyArrays: false } },
      ...(Object.keys(matchStage).length
        ? [{ $match: matchStage }]
        : []),
      { $sort:  { "comments.createdAt": -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limitNum },
            {
              $project: {
                _id:          "$_id",
                requestType:  "$type",
                department:   "$department",
                requestStatus:"$status",
                studentId:    "$student",
                comment:      "$comments.comment",
                action:       "$comments.action",
                role:         "$comments.role",
                userName:     "$comments.userName",
                userId:       "$comments.user",
                statusSnapshot:"$comments.statusSnapshot",
                createdAt:    "$comments.createdAt",
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await Request.aggregate(pipeline);
    const logs  = result?.data  || [];
    const total = result?.total?.[0]?.count || 0;

    res.json({
      logs,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/analytics — detailed analytics ─────────────────────────────
router.get("/analytics", guard, async (req, res, next) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [
      totalRequests,
      statusCounts,
      byDepartment,
      byType,
      monthlyTrend,
      slaMetrics,
      avgProcessingPipeline,
    ] = await Promise.all([
      // Total
      Request.countDocuments(),

      // Status breakdown
      Request.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),

      // By department
      Request.aggregate([
        { $match: { department: { $ne: "" } } },
        { $group: { _id: "$department", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // By request type
      Request.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Monthly trend (last 6 months)
      Request.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: {
              year:  { $year:  "$createdAt" },
              month: { $month: "$createdAt" },
            },
            count:    { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),

      // SLA metrics
      Promise.all([
        Request.countDocuments({ slaBreached: true }),
        Request.countDocuments({ slaBreached: true, status: { $in: ["approved","rejected","closed"] } }),
        Request.countDocuments({ slaDeadline: { $gte: now }, status: { $in: ["pending","in_review"] } }),
        Request.countDocuments({ autoEscalated: true }),
      ]),

      // Avg processing time for resolved requests (ms → hours)
      Request.aggregate([
        {
          $match: {
            status:     { $in: ["approved", "rejected", "closed"] },
            reviewedAt: { $ne: null },
          },
        },
        {
          $project: {
            processingMs: { $subtract: ["$reviewedAt", "$createdAt"] },
          },
        },
        {
          $group: {
            _id: null,
            avgMs: { $avg: "$processingMs" },
          },
        },
      ]),
    ]);

    // Shape status counts into a map
    const statusMap = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));

    // Approval/rejection rate
    const resolved = (statusMap.approved || 0) + (statusMap.rejected || 0);
    const approvalRate  = resolved > 0 ? Math.round((statusMap.approved || 0) / resolved * 100) : null;
    const rejectionRate = resolved > 0 ? Math.round((statusMap.rejected || 0) / resolved * 100) : null;

    // Average processing time in hours
    const avgProcessingHours = avgProcessingPipeline[0]
      ? Math.round(avgProcessingPipeline[0].avgMs / (1000 * 60 * 60) * 10) / 10
      : null;

    // Monthly trend labels
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const formattedTrend = monthlyTrend.map((m) => ({
      label:    `${MONTHS[m._id.month - 1]} ${m._id.year}`,
      total:    m.count,
      approved: m.approved,
      rejected: m.rejected,
    }));

    const [slaBreachedTotal, slaBreachedResolved, slaOnTime, autoEscalatedCount] = slaMetrics;

    res.json({
      analytics: {
        totalRequests,
        byStatus:           statusMap,
        byDepartment:       byDepartment.map((d) => ({ department: d._id || "Unknown", count: d.count })),
        byType:             byType.map((t) => ({ type: t._id, count: t.count })),
        monthlyTrend:       formattedTrend,
        approvalRate,
        rejectionRate,
        avgProcessingHours,
        sla: {
          breachedTotal:    slaBreachedTotal,
          breachedResolved: slaBreachedResolved,
          onTimeActive:     slaOnTime,
          autoEscalated:    autoEscalatedCount,
        },
      },
    });
  } catch (err) { next(err); }
});
router.get("/requests", guard, async (req, res, next) => {
  try {
    const { status, type, page = "1", limit = "20" } = req.query;
    const { STATUSES: S, REQUEST_TYPES: T } = require("../models/Request");

    const query = {};
    if (status && S.includes(status)) query.status = status;
    if (type   && T.includes(type))   query.type   = type;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip     = (pageNum - 1) * limitNum;

    const [requests, total] = await Promise.all([
      Request.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("student",    "name email department")
        .populate("assignedTo", "name role")
        .lean(),
      Request.countDocuments(query),
    ]);

    res.json({
      requests,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) { next(err); }
});

module.exports = router;
