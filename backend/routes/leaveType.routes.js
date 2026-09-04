/**
 * leaveType.routes.js — Leave type CRUD (admin only, public GET)
 * Mounted at /api/leave-types
 */
const express   = require("express");
const LeaveType = require("../models/LeaveType");
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

// GET /api/leave-types — all active types (authenticated users)
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { all } = req.query; // admin can pass ?all=true to see inactive
    const caller = await User.findById(req.userId).select("role").lean();
    const showAll = all === "true" && caller?.role === "admin";

    const query = showAll ? {} : { isActive: true };
    const types = await LeaveType.find(query).sort({ name: 1 }).lean();
    res.json({ leaveTypes: types });
  } catch (err) { next(err); }
});

// POST /api/leave-types — create (admin)
router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, description, maxDaysPerYear, requiresDocument } = req.body || {};
    if (!name || !String(name).trim())
      return res.status(400).json({ message: "Leave type name is required" });

    const existing = await LeaveType.findOne({ name: String(name).trim() });
    if (existing)
      return res.status(409).json({ message: "A leave type with this name already exists" });

    const leaveType = new LeaveType({
      name:             String(name).trim(),
      description:      description ? String(description).trim() : "",
      maxDaysPerYear:   maxDaysPerYear != null ? Number(maxDaysPerYear) : 0,
      requiresDocument: !!requiresDocument,
      createdBy:        req.userId,
    });
    await leaveType.save();
    res.status(201).json({ message: "Leave type created", leaveType });
  } catch (err) { next(err); }
});

// PATCH /api/leave-types/:id — update (admin)
router.patch("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const leaveType = await LeaveType.findById(req.params.id);
    if (!leaveType) return res.status(404).json({ message: "Leave type not found" });

    const { name, description, maxDaysPerYear, requiresDocument, isActive } = req.body || {};
    if (name !== undefined)             leaveType.name             = String(name).trim();
    if (description !== undefined)      leaveType.description      = String(description).trim();
    if (maxDaysPerYear !== undefined)    leaveType.maxDaysPerYear   = Number(maxDaysPerYear);
    if (requiresDocument !== undefined) leaveType.requiresDocument = !!requiresDocument;
    if (isActive !== undefined)         leaveType.isActive         = !!isActive;

    await leaveType.save();
    res.json({ message: "Leave type updated", leaveType });
  } catch (err) { next(err); }
});

// DELETE /api/leave-types/:id — soft delete (admin)
router.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const leaveType = await LeaveType.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!leaveType) return res.status(404).json({ message: "Leave type not found" });
    res.json({ message: "Leave type deactivated", leaveType });
  } catch (err) { next(err); }
});

module.exports = router;
