/**
 * department.routes.js — Department management endpoints.
 *
 * Mounted at /api/admin/departments
 * All routes require admin role.
 *
 *   GET    /                 — list all departments (active only unless ?all=true)
 *   POST   /                 — create a department
 *   PATCH  /:id              — update name / description
 *   PATCH  /:id/deactivate   — soft-delete
 *   PATCH  /:id/activate     — re-activate
 *   DELETE /:id              — hard-delete (only if no users assigned)
 */

const express    = require("express");
const mongoose   = require("mongoose");
const Department = require("../models/Department");
const User       = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ── Auth guard ────────────────────────────────────────────────────────────────

async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("role").lean();
    if (!user || user.role !== "admin")
      return res.status(403).json({ message: "Admin access required" });
    next();
  } catch (err) { next(err); }
}

const guard = [requireAuth, requireAdmin];

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const all    = req.query.all === "true";
    const query  = all ? {} : { isActive: true };
    const depts  = await Department.find(query).sort({ name: 1 }).lean();

    // Attach member count from User collection
    const names = depts.map((d) => d.name);
    const counts = await User.aggregate([
      { $match: { department: { $in: names } } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));

    res.json({
      departments: depts.map((d) => ({ ...d, memberCount: countMap[d.name] || 0 })),
    });
  } catch (err) { next(err); }
});

// ── POST / ────────────────────────────────────────────────────────────────────

router.post("/", guard, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name)
      return res.status(400).json({ message: "Department name is required" });
    if (name.length > 100)
      return res.status(400).json({ message: "Department name must be under 100 characters" });

    const description = String(req.body?.description || "").trim().slice(0, 500);

    const dept = new Department({ name, description, createdBy: req.userId });
    await dept.save();
    res.status(201).json({ message: "Department created", department: dept });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: `Department "${req.body?.name}" already exists` });
    next(err);
  }
});

// ── PATCH /:id ────────────────────────────────────────────────────────────────

router.patch("/:id", guard, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid department id" });

    const updates = {};
    if (req.body.name !== undefined) {
      const n = String(req.body.name).trim();
      if (!n) return res.status(400).json({ message: "Department name cannot be empty" });
      updates.name = n;
    }
    if (req.body.description !== undefined)
      updates.description = String(req.body.description).trim().slice(0, 500);

    if (!Object.keys(updates).length)
      return res.status(400).json({ message: "No fields provided" });

    const dept = await Department.findByIdAndUpdate(
      req.params.id, updates, { new: true, runValidators: true }
    );
    if (!dept) return res.status(404).json({ message: "Department not found" });
    res.json({ message: "Department updated", department: dept });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: `Department "${req.body?.name}" already exists` });
    next(err);
  }
});

// ── PATCH /:id/deactivate ─────────────────────────────────────────────────────

router.patch("/:id/deactivate", guard, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid department id" });
    const dept = await Department.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!dept) return res.status(404).json({ message: "Department not found" });
    res.json({ message: "Department deactivated", department: dept });
  } catch (err) { next(err); }
});

// ── PATCH /:id/activate ───────────────────────────────────────────────────────

router.patch("/:id/activate", guard, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid department id" });
    const dept = await Department.findByIdAndUpdate(
      req.params.id, { isActive: true }, { new: true }
    );
    if (!dept) return res.status(404).json({ message: "Department not found" });
    res.json({ message: "Department activated", department: dept });
  } catch (err) { next(err); }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────

router.delete("/:id", guard, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid department id" });

    const dept = await Department.findById(req.params.id).lean();
    if (!dept) return res.status(404).json({ message: "Department not found" });

    // Prevent deletion while users are assigned to it
    const memberCount = await User.countDocuments({ department: dept.name });
    if (memberCount > 0)
      return res.status(409).json({
        message: `Cannot delete "${dept.name}" — ${memberCount} user(s) are assigned to it. Deactivate instead.`,
      });

    await Department.findByIdAndDelete(req.params.id);
    res.json({ message: "Department deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
