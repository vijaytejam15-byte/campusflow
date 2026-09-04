/**
 * leave.routes.js — Leave Management endpoints
 *
 * Mounted at /api/leave
 *
 * Student endpoints:
 *   POST   /api/leave                  — apply for leave
 *   GET    /api/leave                  — my leave applications
 *   GET    /api/leave/:id              — single application
 *   PATCH  /api/leave/:id/cancel       — cancel pending application
 *   POST   /api/leave/:id/comment      — add a comment
 *
 * Staff / HOD endpoints:
 *   GET    /api/leave/staff/queue      — review queue
 *   PATCH  /api/leave/:id/review       — approve or reject
 *
 * Admin endpoints:
 *   GET    /api/leave/admin/all        — all applications
 *   GET    /api/leave/admin/stats      — leave statistics
 */

const express   = require("express");
const mongoose  = require("mongoose");

const Leave     = require("../models/Leave");
const LeaveType = require("../models/LeaveType");
const User      = require("../models/User");
const { LEAVE_STATUSES } = require("../models/Leave");
const { requireAuth }    = require("../middleware/auth");
const { emitRequestStatusUpdated, emitRequestCreated } = require("../socket/socketHandler");
const { queueEmail }     = require("../queues/workers");
const logger             = require("../config/logger");

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/** Calculate working days between two dates (inclusive, excludes weekends) */
function calcLeaveDays(startDate, endDate) {
  let count = 0;
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++; // skip Sunday(0) and Saturday(6)
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
}

/** Require a reviewer (faculty / hod / admin) */
async function requireStaff(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("role name department").lean();
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    if (!["faculty", "hod", "admin"].includes(user.role))
      return res.status(403).json({ message: "Staff access required" });
    req.staffUser = user;
    next();
  } catch (err) { next(err); }
}

/** Require admin */
async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("role").lean();
    if (!user || user.role !== "admin")
      return res.status(403).json({ message: "Admin access required" });
    next();
  } catch (err) { next(err); }
}

// ── STUDENT: Apply for leave ──────────────────────────────────────────────────

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { leaveTypeId, startDate, endDate, reason, documents } = req.body || {};

    // ── Validation ──────────────────────────────────────────────────────────
    if (!leaveTypeId) return res.status(400).json({ message: "Leave type is required" });
    if (!isValidId(leaveTypeId))
      return res.status(400).json({ message: "Invalid leave type" });
    if (!startDate || !endDate)
      return res.status(400).json({ message: "Start date and end date are required" });
    if (!reason || !String(reason).trim())
      return res.status(400).json({ message: "Reason is required" });
    if (String(reason).trim().length < 10)
      return res.status(400).json({ message: "Reason must be at least 10 characters" });

    const start = new Date(startDate);
    const end   = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      return res.status(400).json({ message: "Invalid date format" });
    if (end < start)
      return res.status(400).json({ message: "End date cannot be before start date" });
    if (start < new Date(new Date().setHours(0, 0, 0, 0)))
      return res.status(400).json({ message: "Leave cannot start in the past" });

    // Check leave type exists
    const leaveType = await LeaveType.findById(leaveTypeId).lean();
    if (!leaveType || !leaveType.isActive)
      return res.status(404).json({ message: "Leave type not found or inactive" });

    // Document required check
    if (leaveType.requiresDocument && (!documents || documents.length === 0))
      return res.status(400).json({
        message: `Supporting document is required for "${leaveType.name}"`,
      });

    // Validate documents array
    let cleanDocs = [];
    if (Array.isArray(documents) && documents.length > 0) {
      if (documents.length > 5)
        return res.status(400).json({ message: "Maximum 5 documents allowed" });
      cleanDocs = documents.map((d, i) => {
        if (!d.filename || !d.originalName)
          throw Object.assign(new Error(`Document ${i + 1} missing filename`), { status: 400 });
        return {
          filename:     String(d.filename).slice(0, 255),
          originalName: String(d.originalName).slice(0, 255),
          mimeType:     d.mimeType ? String(d.mimeType).slice(0, 100) : "",
          size:         Number(d.size) || 0,
        };
      });
    }

    // Check for overlapping approved/pending leave
    const overlap = await Leave.findOne({
      student: req.userId,
      status:  { $in: ["pending", "approved"] },
      $or: [
        { startDate: { $lte: end },   endDate: { $gte: start } },
      ],
    }).lean();
    if (overlap)
      return res.status(409).json({
        message: "You already have a leave application that overlaps with these dates",
      });

    // Compute days
    const totalDays = calcLeaveDays(start, end);

    // Find student's advisor (if assigned) to auto-assign
    const student = await User.findById(req.userId).select("name advisorId department").lean();

    const leave = new Leave({
      student:       req.userId,
      leaveType:     leaveTypeId,
      leaveTypeName: leaveType.name,
      startDate:     start,
      endDate:       end,
      totalDays,
      reason:        String(reason).trim(),
      documents:     cleanDocs,
      reviewedBy:    student?.advisorId || null,
    });

    await leave.save();

    // Notify staff/reviewers
    try {
      emitRequestCreated({
        request:     leave,
        studentName: student?.name || "A student",
      });

      // Email student confirmation
      queueEmail("leaveSubmitted", {
        to:        student?.email,
        name:      student?.name || "Student",
        leaveType: leaveType.name,
        startDate: start.toLocaleDateString(),
        endDate:   end.toLocaleDateString(),
        leaveId:   leave._id,
      }).catch(() => {});
    } catch { /* non-fatal */ }

    res.status(201).json({ message: "Leave application submitted", leave });
  } catch (err) { next(err); }
});

// ── STUDENT: My leave applications ───────────────────────────────────────────

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { status, page = "1", limit = "10" } = req.query;

    // Only students see this — staff use /staff/queue
    const caller = await User.findById(req.userId).select("role").lean();
    if (caller && ["faculty", "hod", "admin"].includes(caller.role)) {
      return res.status(403).json({ message: "Use /staff/queue for staff applications" });
    }

    const query = { student: req.userId };
    if (status && LEAVE_STATUSES.includes(status)) query.status = status;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip     = (pageNum - 1) * limitNum;

    const [leaves, total] = await Promise.all([
      Leave.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("leaveType", "name requiresDocument")
        .lean(),
      Leave.countDocuments(query),
    ]);

    res.json({
      leaves,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) { next(err); }
});

// ── STAFF/ADMIN: Queue — MUST come before /:id ────────────────────────────────

router.get("/staff/queue", requireAuth, requireStaff, async (req, res, next) => {
  try {
    const { status, search, page = "1", limit = "20" } = req.query;
    const { role, department, _id: staffId } = req.staffUser;

    const query = {};

    // Status filter (default: pending)
    const statusFilter = status && LEAVE_STATUSES.includes(status) ? status : "pending";
    query.status = statusFilter;

    // Scope: faculty/hod see leaves of students in their department OR assigned to them
    if (role !== "admin") {
      if (department) query["$or"] = [
        { reviewedBy: staffId },
        { reviewedBy: null },   // unassigned — visible to all staff in dept
      ];
    }

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip     = (pageNum - 1) * limitNum;

    let leaves = await Leave.find(query)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limitNum)
      .populate("student",   "name email department rollNumber year semester")
      .populate("leaveType", "name requiresDocument")
      .populate("reviewedBy","name role")
      .lean();

    let total = await Leave.countDocuments(query);

    // Client-side name search
    if (search && String(search).trim()) {
      const term = String(search).trim().toLowerCase();
      leaves = leaves.filter((l) =>
        (l.student?.name || "").toLowerCase().includes(term) ||
        (l.student?.rollNumber || "").toLowerCase().includes(term)
      );
      total = leaves.length;
    }

    res.json({
      leaves,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) { next(err); }
});

// ── ADMIN: All applications ───────────────────────────────────────────────────

router.get("/admin/all", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status, department, page = "1", limit = "20" } = req.query;

    const query = {};
    if (status && LEAVE_STATUSES.includes(status)) query.status = status;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip     = (pageNum - 1) * limitNum;

    let pipeline = [
      ...(Object.keys(query).length ? [{ $match: query }] : []),
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from:         "users",
          localField:   "student",
          foreignField: "_id",
          as:           "student",
        },
      },
      { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
    ];

    if (department) {
      pipeline.push({ $match: { "student.department": department } });
    }

    const [countResult] = await Leave.aggregate([...pipeline, { $count: "total" }]);
    const total = countResult?.total || 0;

    pipeline.push({ $skip: skip }, { $limit: limitNum });

    const leaves = await Leave.aggregate(pipeline);

    res.json({
      leaves,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) { next(err); }
});

// ── ADMIN: Leave statistics ───────────────────────────────────────────────────

router.get("/admin/stats", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [
      totalLeaves,
      statusBreakdown,
      byLeaveType,
      monthlyTrend,
      byDepartment,
    ] = await Promise.all([
      Leave.countDocuments(),

      Leave.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),

      Leave.aggregate([
        { $group: { _id: "$leaveTypeName", count: { $sum: 1 }, totalDays: { $sum: "$totalDays" } } },
        { $sort: { count: -1 } },
      ]),

      Leave.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id:      { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            count:    { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
            days:     { $sum: "$totalDays" },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),

      Leave.aggregate([
        {
          $lookup: {
            from: "users", localField: "student", foreignField: "_id", as: "studentDoc",
          },
        },
        { $unwind: { path: "$studentDoc", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id:   "$studentDoc.department",
            count: { $sum: 1 },
            days:  { $sum: "$totalDays" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const statusMap = Object.fromEntries(statusBreakdown.map((s) => [s._id, s.count]));
    const MONTHS    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    res.json({
      stats: {
        totalLeaves,
        byStatus:    statusMap,
        byLeaveType: byLeaveType.map((t) => ({
          name:      t._id || "Unknown",
          count:     t.count,
          totalDays: t.totalDays,
        })),
        monthlyTrend: monthlyTrend.map((m) => ({
          label:    `${MONTHS[m._id.month - 1]} ${m._id.year}`,
          total:    m.count,
          approved: m.approved,
          rejected: m.rejected,
          days:     m.days,
        })),
        byDepartment: byDepartment.map((d) => ({
          department: d._id || "Unknown",
          count:      d.count,
          days:       d.days,
        })),
      },
    });
  } catch (err) { next(err); }
});

// ── SINGLE APPLICATION (student own / staff any) ─── must come AFTER named routes

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid leave id" });

    const caller = await User.findById(req.userId).select("role").lean();
    const isStaff = caller && ["faculty", "hod", "admin"].includes(caller.role);

    const query = isStaff
      ? { _id: req.params.id }
      : { _id: req.params.id, student: req.userId };

    const leave = await Leave.findOne(query)
      .populate("student",   "name email department rollNumber year semester")
      .populate("leaveType", "name description requiresDocument maxDaysPerYear")
      .populate("reviewedBy","name email role")
      .lean();

    if (!leave) return res.status(404).json({ message: "Leave application not found" });
    res.json({ leave });
  } catch (err) { next(err); }
});

// ── STUDENT: Cancel pending application ───────────────────────────────────────

router.patch("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid leave id" });

    const leave = await Leave.findOne({ _id: req.params.id, student: req.userId });
    if (!leave) return res.status(404).json({ message: "Leave application not found" });
    if (leave.status !== "pending")
      return res.status(409).json({ message: "Only pending applications can be cancelled" });

    const caller = await User.findById(req.userId).select("name role").lean();

    leave.status = "cancelled";
    leave.comments.push({
      user:           req.userId,
      userName:       caller?.name || "",
      role:           "student",
      comment:        "Application cancelled by student",
      action:         "cancel",
      statusSnapshot: "cancelled",
      createdAt:      new Date(),
    });
    await leave.save();

    res.json({ message: "Application cancelled", leave });
  } catch (err) { next(err); }
});

// ── ADD COMMENT ───────────────────────────────────────────────────────────────

router.post("/:id/comment", requireAuth, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid leave id" });

    const { comment } = req.body || {};
    const trimmed = comment ? String(comment).trim() : "";
    if (!trimmed) return res.status(400).json({ message: "Comment cannot be empty" });
    if (trimmed.length > 2000) return res.status(400).json({ message: "Comment too long" });

    const caller = await User.findById(req.userId).select("role name").lean();
    if (!caller) return res.status(401).json({ message: "Not authenticated" });

    const isStaff = ["faculty", "hod", "admin"].includes(caller.role);
    const query   = isStaff
      ? { _id: req.params.id }
      : { _id: req.params.id, student: req.userId };

    const leave = await Leave.findOne(query);
    if (!leave) return res.status(404).json({ message: "Leave application not found" });

    leave.comments.push({
      user:           req.userId,
      userName:       caller.name || "",
      role:           caller.role,
      comment:        trimmed,
      action:         "comment",
      statusSnapshot: leave.status,
      createdAt:      new Date(),
    });
    await leave.save();

    const newComment = leave.comments[leave.comments.length - 1];
    res.status(201).json({ message: "Comment added", comment: newComment });
  } catch (err) { next(err); }
});

// ── STAFF: Approve or Reject ──────────────────────────────────────────────────

router.patch("/:id/review", requireAuth, requireStaff, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid leave id" });

    const { decision, comment } = req.body || {};
    if (!decision || !["approved", "rejected"].includes(decision))
      return res.status(400).json({ message: "Decision must be 'approved' or 'rejected'" });

    const trimmedComment = comment ? String(comment).trim() : "";
    if (decision === "rejected" && !trimmedComment)
      return res.status(400).json({ message: "A reason is required when rejecting" });
    if (trimmedComment.length > 2000)
      return res.status(400).json({ message: "Comment too long" });

    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: "Leave application not found" });
    if (leave.status !== "pending")
      return res.status(409).json({
        message: `Application is already ${leave.status}`,
      });

    const { _id: staffId, name: staffName, role } = req.staffUser;

    leave.status     = decision;
    leave.reviewedBy = staffId;
    leave.reviewedAt = new Date();
    if (trimmedComment) leave.staffNote = trimmedComment;

    leave.comments.push({
      user:           staffId,
      userName:       staffName || "",
      role,
      comment:        trimmedComment || `Leave ${decision}`,
      action:         decision === "approved" ? "approve" : "reject",
      statusSnapshot: decision,
      createdAt:      new Date(),
    });

    await leave.save();

    // Populate for response
    await leave.populate("student",   "name email department");
    await leave.populate("leaveType", "name");
    await leave.populate("reviewedBy","name role");

    // Notify student
    try {
      emitRequestStatusUpdated(leave.student._id || leave.student, {
        request:      leave,
        reviewerName: staffName,
        newStatus:    decision,
      });

      // Email student
      const studentDoc = await User.findById(leave.student._id || leave.student)
        .select("email name").lean();
      if (studentDoc) {
        queueEmail("leaveStatusChanged", {
          to:        studentDoc.email,
          name:      studentDoc.name,
          leaveType: leave.leaveTypeName || leave.leaveType?.name || "Leave",
          newStatus: decision,
          comment:   trimmedComment,
          leaveId:   leave._id,
        }).catch(() => {});
      }
    } catch { /* non-fatal */ }

    res.json({ message: `Leave application ${decision}`, leave });
  } catch (err) { next(err); }
});

module.exports = router;
