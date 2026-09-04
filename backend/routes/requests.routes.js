const express   = require("express");
const mongoose  = require("mongoose");

const Request = require("../models/Request");
const {
  REQUEST_TYPES,
  PRIORITIES,
  STATUSES,
  SLA_HOURS,
} = require("../models/Request");
const { requireAuth }       = require("../middleware/auth");
const { requirePermission } = require("../config/permissions");
const User                  = require("../models/User");
const { emitRequestCreated, emitRequestStatusUpdated } = require("../socket/socketHandler");
const emailSvc              = require("../services/email.service");
const logger                = require("../config/logger");
const { queueEmail }        = require("../queues/workers");

const router = express.Router();

// ── Shared helpers ────────────────────────────────────────────────────────────

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Which statuses a reviewer can transition TO via PATCH /:id/status
const REVIEWER_TRANSITIONS = {
  faculty: ["in_review", "approved", "rejected", "escalated"],
  hod:     ["in_review", "approved", "rejected", "closed"],
  admin:   STATUSES,
};

// ── Student input validation ──────────────────────────────────────────────────

function validateRequestInput(body, { partial = false } = {}) {
  const errors = [];
  const fields = {};
  const has    = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has("type")) {
    const v = has("type") ? String(body.type).trim() : "";
    if (!v)                           errors.push("Request type is required");
    else if (!REQUEST_TYPES.includes(v)) errors.push(`Invalid request type`);
    else                              fields.type = v;
  }

  if (!partial || has("description")) {
    const v = has("description") ? String(body.description).trim() : "";
    if (!v)             errors.push("Description is required");
    else if (v.length > 3000) errors.push("Description must be under 3000 characters");
    else                fields.description = v;
  }

  if (has("department")) {
    const v = String(body.department).trim();
    if (v.length > 100) errors.push("Department must be under 100 characters");
    else                fields.department = v;
  }

  if (has("priority")) {
    const v = String(body.priority).trim();
    if (!PRIORITIES.includes(v)) errors.push(`Invalid priority`);
    else                         fields.priority = v;
  }

  if (has("attachments")) {
    if (!Array.isArray(body.attachments)) {
      errors.push("Attachments must be an array");
    } else if (body.attachments.length > 10) {
      errors.push("Maximum 10 attachments per request");
    } else {
      const cleaned = body.attachments.map((a, i) => {
        if (!a.filename || !a.originalName) {
          errors.push(`Attachment ${i + 1} missing filename or originalName`);
          return null;
        }
        return {
          filename:     String(a.filename).slice(0, 255),
          originalName: String(a.originalName).slice(0, 255),
          mimeType:     a.mimeType ? String(a.mimeType).slice(0, 100) : "",
          size:         Number(a.size) || 0,
        };
      });
      if (!errors.length) fields.attachments = cleaned.filter(Boolean);
    }
  }

  return { errors, fields };
}

// ── Middleware: require a reviewer role (faculty / hod / admin) ───────────────

async function requireReviewer(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("role name department").lean();
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const reviewerRoles = ["faculty", "hod", "admin"];
    if (!reviewerRoles.includes(user.role)) {
      return res.status(403).json({ message: "Access denied: reviewer role required" });
    }
    req.reviewer = user;   // attach for downstream use
    next();
  } catch (err) {
    next(err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STUDENT ENDPOINTS (unchanged behaviour)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/requests — student's own requests (paginated, filterable)
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { status, type, page = "1", limit = "10" } = req.query;
    const query = { student: req.userId };

    if (status && STATUSES.includes(status)) query.status = status;
    if (type   && REQUEST_TYPES.includes(type))   query.type   = type;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip     = (pageNum - 1) * limitNum;

    const [requests, total] = await Promise.all([
      Request.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Request.countDocuments(query),
    ]);

    res.json({
      requests,
      pagination: {
        total,
        page:       pageNum,
        limit:      limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════════════════════
// REVIEWER ENDPOINTS (faculty / HOD / admin)
// NOTE: /pending MUST be registered before /:id to avoid Express matching
// "pending" as an :id parameter.
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/requests/pending
 *
 * Returns requests queued for review.
 * Scoping rules:
 *   faculty → sees pending/in_review requests for their department
 *             (or all departments when department is empty)
 *   hod     → same as faculty + also sees escalated requests in their dept
 *   admin   → sees everything
 *
 * Supports ?type=, ?priority=, ?search=, ?page=, ?limit=
 */
router.get("/pending", requireAuth, requireReviewer, async (req, res, next) => {
  try {
    const { type, priority, search, page = "1", limit = "20" } = req.query;
    const { role, department } = req.reviewer;

    // Base status filter per role
    let statusFilter;
    if (role === "hod") {
      statusFilter = { $in: ["pending", "in_review", "escalated"] };
    } else if (role === "admin") {
      statusFilter = { $in: STATUSES };
    } else {
      // faculty
      statusFilter = { $in: ["pending", "in_review"] };
    }

    const query = { status: statusFilter };

    // Scope to department when the reviewer has one set
    if (department && role !== "admin") {
      query.department = department;
    }

    if (type     && REQUEST_TYPES.includes(type))   query.type     = type;
    if (priority && PRIORITIES.includes(priority))  query.priority = priority;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip     = (pageNum - 1) * limitNum;

    let queryBuilder = Request.find(query)
      .sort({ priority: -1, createdAt: 1 })
      .skip(skip)
      .limit(limitNum)
      .populate("student",    "name email department")
      .populate("assignedTo", "name role");

    let [requests, total] = await Promise.all([
      queryBuilder.lean(),
      Request.countDocuments(query),
    ]);

    // Client-side name search (avoid regex index miss on populated field)
    if (search && String(search).trim()) {
      const term = String(search).trim().toLowerCase();
      requests = requests.filter((r) => {
        const studentName = (r.student?.name || "").toLowerCase();
        return studentName.includes(term);
      });
      total = requests.length;
    }

    res.json({
      requests,
      pagination: {
        total,
        page:       pageNum,
        limit:      limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════════════════════
// STUDENT SINGLE-RESOURCE ENDPOINTS (after /pending to avoid :id collision)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/requests/:id — single request
// Students see only their own. Reviewers (faculty/hod/admin) can see any.
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid request id" });

    // Determine the caller's role so we can decide scope
    const caller = await User.findById(req.userId).select("role").lean();
    const isReviewer = caller && ["faculty", "hod", "admin"].includes(caller.role);

    // Build the query — reviewers can see any request; students only their own
    const query = isReviewer
      ? { _id: req.params.id }
      : { _id: req.params.id, student: req.userId };

    const request = await Request.findOne(query)
      .populate("student",    "name email department semester phoneNumber")
      .populate("assignedTo", "name email role department")
      .lean();

    if (!request) return res.status(404).json({ message: "Request not found" });
    res.json({ request });
  } catch (err) { next(err); }
});

// POST /api/requests — student creates a new request
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { errors, fields } = validateRequestInput(req.body || {});
    if (errors.length)
      return res.status(400).json({ message: errors.join(", ") });

    const request = new Request({ ...fields, student: req.userId });

    // Compute SLA deadline from priority
    const hours = SLA_HOURS[fields.priority || "normal"] || 48;
    request.slaDeadline = new Date(Date.now() + hours * 60 * 60 * 1000);

    await request.save();

    // Notify reviewers in real-time
    try {
      const student = await User.findById(req.userId).select("name email").lean();
      emitRequestCreated({ request, studentName: student?.name || "A student" });

      // Email student confirmation
      queueEmail("requestSubmitted", {
        to:          student?.email,
        name:        student?.name || "Student",
        requestType: request.type.replace(/_/g, " "),
        requestId:   request._id,
      }).catch(() => {});

      // Email reviewers (faculty in same department)
      const reviewers = await User.find({
        role:       { $in: ["faculty", "hod"] },
        department: request.department || { $exists: true },
      }).select("email name").limit(5).lean();
      reviewers.forEach((rv) => {
        queueEmail("newRequestNotification", {
          to:          rv.email,
          reviewerName:rv.name,
          studentName: student?.name || "A student",
          requestType: request.type.replace(/_/g, " "),
          requestId:   request._id,
        }).catch(() => {});
      });
    } catch { /* non-fatal */ }

    res.status(201).json({ message: "Request submitted", request });
  } catch (err) { next(err); }
});

// PUT /api/requests/:id — student edits a pending request
router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid request id" });

    const existing = await Request.findOne({ _id: req.params.id, student: req.userId });
    if (!existing) return res.status(404).json({ message: "Request not found" });
    if (existing.status !== "pending")
      return res.status(409).json({ message: "Only pending requests can be edited" });

    const { errors, fields } = validateRequestInput(req.body || {}, { partial: true });
    if (errors.length) return res.status(400).json({ message: errors.join(", ") });
    if (!Object.keys(fields).length)
      return res.status(400).json({ message: "No fields provided" });

    Object.assign(existing, fields);
    await existing.save();
    res.json({ message: "Request updated", request: existing });
  } catch (err) { next(err); }
});

// DELETE /api/requests/:id — student cancels a pending request
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid request id" });

    const request = await Request.findOne({ _id: req.params.id, student: req.userId });
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "pending")
      return res.status(409).json({ message: "Only pending requests can be cancelled" });

    await request.deleteOne();
    res.json({ message: "Request cancelled" });
  } catch (err) { next(err); }
});

/**
 * POST /api/requests/:id/comment
 *
 * Any authenticated reviewer or the owning student can add a standalone
 * comment without changing status.
 */
router.post("/:id/comment", requireAuth, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid request id" });

    const { comment } = req.body || {};
    const trimmed = comment ? String(comment).trim() : "";
    if (!trimmed)
      return res.status(400).json({ message: "Comment cannot be empty" });
    if (trimmed.length > 2000)
      return res.status(400).json({ message: "Comment must be under 2000 characters" });

    // Determine caller's role and name
    const caller = await User.findById(req.userId).select("role name").lean();
    if (!caller) return res.status(401).json({ message: "Not authenticated" });

    const isReviewer = ["faculty", "hod", "admin"].includes(caller.role);

    // Scope: reviewers can comment on any request; students only their own
    const query = isReviewer
      ? { _id: req.params.id }
      : { _id: req.params.id, student: req.userId };

    const request = await Request.findOne(query);
    if (!request) return res.status(404).json({ message: "Request not found" });

    request.comments.push({
      user:           req.userId,
      userName:       caller.name || "",
      role:           caller.role,
      comment:        trimmed,
      action:         "comment",
      statusSnapshot: request.status,
      createdAt:      new Date(),
    });

    await request.save();

    // Return the new comment
    const newComment = request.comments[request.comments.length - 1];
    res.status(201).json({ message: "Comment added", comment: newComment });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/requests/:id/status
 *
 * Reviewer updates the status of a request and appends a comment.
 *
 * Body: { status, comment }
 *   status  — one of the allowed transitions for the reviewer's role
 *   comment — required for reject / escalate; optional for others
 */
router.patch("/:id/status", requireAuth, requireReviewer, async (req, res, next) => {  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid request id" });

    const { status, comment } = req.body || {};
    const { role, name: reviewerName } = req.reviewer;

    // Validate incoming status
    if (!status)
      return res.status(400).json({ message: "Status is required" });

    const allowed = REVIEWER_TRANSITIONS[role] || [];
    if (!allowed.includes(status))
      return res.status(400).json({
        message: `Role "${role}" cannot set status to "${status}". Allowed: ${allowed.join(", ")}`,
      });

    // Comment is mandatory for rejections and escalations
    const commentRequired = ["rejected", "escalated"].includes(status);
    const trimmedComment  = comment ? String(comment).trim() : "";
    if (commentRequired && !trimmedComment)
      return res.status(400).json({
        message: `A comment is required when ${status === "rejected" ? "rejecting" : "escalating"} a request`,
      });
    if (trimmedComment && trimmedComment.length > 2000)
      return res.status(400).json({ message: "Comment must be under 2000 characters" });

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    // Prevent re-processing already terminal statuses (unless admin)
    const terminalStatuses = ["approved", "rejected", "closed"];
    if (terminalStatuses.includes(request.status) && role !== "admin") {
      return res.status(409).json({
        message: `Request is already ${request.status} and cannot be modified`,
      });
    }

    // Map status → action label for the audit log
    const ACTION_MAP = {
      in_review: "comment",
      approved:  "approve",
      rejected:  "reject",
      escalated: "escalate",
      closed:    "close",
    };

    // Apply updates
    request.status     = status;
    request.reviewedAt = new Date();

    // Auto-assign to this reviewer if not yet assigned
    if (!request.assignedTo) {
      request.assignedTo = req.userId;
    }

    // Update the public-facing staff note on meaningful actions
    if (trimmedComment && ["approved", "rejected", "escalated"].includes(status)) {
      request.staffNote = trimmedComment;
    }

    // Append to audit log
    if (trimmedComment || ["approved", "rejected", "escalated", "closed"].includes(status)) {
      request.comments.push({
        user:           req.userId,
        userName:       reviewerName || "",
        role,
        comment:        trimmedComment || `Status changed to ${status}`,
        action:         ACTION_MAP[status] || "comment",
        statusSnapshot: status,
        createdAt:      new Date(),
      });
    }

    await request.save();

    // Return populated version for the frontend to use directly
    await request.populate("student",    "name email department");
    await request.populate("assignedTo", "name role");

    // Notify the student in real-time
    try {
      emitRequestStatusUpdated(request.student._id || request.student, {
        request,
        reviewerName: reviewerName,
        newStatus:    status,
      });

      // Email student about the status change
      const studentDoc = await User.findById(request.student._id || request.student)
        .select("email name").lean();
      if (studentDoc) {
        queueEmail("requestStatusChanged", {
          to:          studentDoc.email,
          name:        studentDoc.name,
          requestType: request.type.replace(/_/g, " "),
          newStatus:   status,
          comment:     trimmedComment,
          requestId:   request._id,
        }).catch(() => {});
      }
    } catch { /* non-fatal */ }

    res.json({ message: "Request updated", request });
  } catch (err) { next(err); }
});

module.exports = router;
