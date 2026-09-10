/**
 * workflowTemplate.routes.js — Admin CRUD for workflow templates.
 * Mounted at /api/admin/workflow-templates
 *
 * Feature 4: Workflow Versioning — PUT now snapshots old stages into
 * versionHistory before overwriting, and GET /:id/history returns history.
 */
"use strict";

const express          = require("express");
const mongoose         = require("mongoose");
const WorkflowTemplate = require("../models/WorkflowTemplate");
const WorkflowInstance = require("../models/WorkflowInstance");
const { requireAuth }  = require("../middleware/auth");
const User             = require("../models/User");
const workflowSvc      = require("../services/workflow.service");
const { writeAudit }   = require("../services/audit.service");

const router = express.Router();

// ── Auth guard ────────────────────────────────────────────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("role").lean();
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  } catch (err) { next(err); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function validateStages(stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    return "At least one stage is required";
  }
  const validRoles    = ["faculty", "hod", "admin", "specific"];
  const validActions  = ["approve", "reject", "escalate", "close", "request_info"];
  const validTypes    = ["sequential", "parallel"];
  for (const [i, s] of stages.entries()) {
    if (!s.name || !String(s.name).trim()) return `Stage ${i + 1}: name is required`;
    if (!validRoles.includes(s.assigneeRole))
      return `Stage ${i + 1}: invalid assigneeRole "${s.assigneeRole}"`;
    if (s.stageType && !validTypes.includes(s.stageType))
      return `Stage ${i + 1}: stageType must be "sequential" or "parallel"`;
    if (!Array.isArray(s.allowedActions) || s.allowedActions.length === 0)
      return `Stage ${i + 1}: allowedActions must be a non-empty array`;
    for (const a of s.allowedActions) {
      if (!validActions.includes(a))
        return `Stage ${i + 1}: invalid action "${a}"`;
    }
    if (s.slaHours !== undefined && (typeof s.slaHours !== "number" || s.slaHours < 0))
      return `Stage ${i + 1}: slaHours must be a non-negative number`;
    if (s.parallelQuorum !== undefined && (typeof s.parallelQuorum !== "number" || s.parallelQuorum < 0))
      return `Stage ${i + 1}: parallelQuorum must be a non-negative number`;
  }
  return null;
}

// ── GET /api/admin/workflow-templates ─────────────────────────────────────────
router.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { entityKind, active } = req.query;
    const query = {};
    if (entityKind) query.entityKind = entityKind;
    if (active !== undefined) query.isActive = active === "true";

    const templates = await WorkflowTemplate.find(query)
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email")
      .lean();

    res.json({ templates });
  } catch (err) { next(err); }
});

// ── GET /api/admin/workflow-templates/:id ─────────────────────────────────────
router.get("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid template id" });

    const template = await WorkflowTemplate.findById(req.params.id)
      .populate("createdBy", "name email")
      .lean();
    if (!template) return res.status(404).json({ message: "Template not found" });

    // Count active instances using this template
    const activeInstances = await WorkflowInstance.countDocuments({
      templateId:    template._id,
      overallStatus: "in_progress",
    });

    res.json({ template, activeInstances });
  } catch (err) { next(err); }
});

// ── POST /api/admin/workflow-templates ────────────────────────────────────────
router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, description, appliesToTypes, entityKind, isActive, stages } = req.body || {};

    if (!name || !String(name).trim())
      return res.status(400).json({ message: "Template name is required" });

    const stageError = validateStages(stages);
    if (stageError) return res.status(400).json({ message: stageError });

    // Normalise stages — assign order based on array position
    const normStages = stages.map((s, i) => ({
      order:              i + 1,
      name:               String(s.name).trim(),
      stageType:          s.stageType || "sequential",
      assigneeRole:       s.assigneeRole || "faculty",
      assigneeUserId:     s.assigneeUserId || null,
      parallelAssignees:  Array.isArray(s.parallelAssignees) ? s.parallelAssignees : [],
      parallelQuorum:     typeof s.parallelQuorum === "number" ? s.parallelQuorum : 0,
      allowedActions:     s.allowedActions,
      requiresComment:    !!s.requiresComment,
      slaHours:           typeof s.slaHours === "number" ? s.slaHours : 48,
      notifyOnEnter:      Array.isArray(s.notifyOnEnter) ? s.notifyOnEnter : ["student"],
      autoAdvance:        !!s.autoAdvance,
      autoAdvanceAction:  s.autoAdvanceAction || null,
      conditions:         Array.isArray(s.conditions) ? s.conditions : [],
    }));

    const template = await WorkflowTemplate.create({
      name:           String(name).trim(),
      description:    description ? String(description).trim() : "",
      appliesToTypes: Array.isArray(appliesToTypes) ? appliesToTypes : [],
      entityKind:     entityKind || "request",
      isActive:       isActive !== false,
      stages:         normStages,
      version:        1,
      createdBy:      req.userId,
    });

    res.status(201).json({ message: "Workflow template created", template });
  } catch (err) { next(err); }
});

// ── PUT /api/admin/workflow-templates/:id — Update (bumps version) ────────────
router.put("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid template id" });

    const template = await WorkflowTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });

    const { name, description, appliesToTypes, isActive, stages } = req.body || {};

    if (stages !== undefined) {
      const stageError = validateStages(stages);
      if (stageError) return res.status(400).json({ message: stageError });
    }

    // Check if active instances exist — warn but allow update (version bump protects them)
    const activeCount = await WorkflowInstance.countDocuments({
      templateId:    template._id,
      overallStatus: "in_progress",
    });

    if (name !== undefined)           template.name           = String(name).trim();
    if (description !== undefined)    template.description    = String(description).trim();
    if (appliesToTypes !== undefined) template.appliesToTypes = Array.isArray(appliesToTypes) ? appliesToTypes : [];
    if (isActive !== undefined)       template.isActive       = !!isActive;

    if (stages !== undefined) {
      template.stages = stages.map((s, i) => ({
        order:              i + 1,
        name:               String(s.name).trim(),
        stageType:          s.stageType || "sequential",
        assigneeRole:       s.assigneeRole || "faculty",
        assigneeUserId:     s.assigneeUserId || null,
        parallelAssignees:  Array.isArray(s.parallelAssignees) ? s.parallelAssignees : [],
        parallelQuorum:     typeof s.parallelQuorum === "number" ? s.parallelQuorum : 0,
        allowedActions:     s.allowedActions,
        requiresComment:    !!s.requiresComment,
        slaHours:           typeof s.slaHours === "number" ? s.slaHours : 48,
        notifyOnEnter:      Array.isArray(s.notifyOnEnter) ? s.notifyOnEnter : ["student"],
        autoAdvance:        !!s.autoAdvance,
        autoAdvanceAction:  s.autoAdvanceAction || null,
        conditions:         Array.isArray(s.conditions) ? s.conditions : [],
      }));
      // Feature 4: snapshot old version before bumping
      await workflowSvc.snapshotTemplateVersion(template, req.userId, req.body.versionNote || "");
    }

    await template.save();
    res.json({
      message:         "Workflow template updated",
      template,
      activeInstances: activeCount,
      note:            activeCount > 0
        ? `${activeCount} in-progress instance(s) continue using the previous version snapshot`
        : undefined,
    });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/workflow-templates/:id/activate ─────────────────────────
router.patch("/:id/activate", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid template id" });

    const template = await WorkflowTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });

    template.isActive = true;
    await template.save();
    res.json({ message: "Template activated", template });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/workflow-templates/:id/deactivate ───────────────────────
router.patch("/:id/deactivate", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid template id" });

    const template = await WorkflowTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });

    template.isActive = false;
    await template.save();
    res.json({ message: "Template deactivated", template });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/workflow-templates/:id — soft delete ───────────────────
router.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid template id" });

    const template = await WorkflowTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });

    const activeCount = await WorkflowInstance.countDocuments({
      templateId: template._id, overallStatus: "in_progress",
    });
    if (activeCount > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${activeCount} active instance(s) are using this template`,
      });
    }

    template.isActive = false;
    template.name     = `[DELETED] ${template.name}`;
    await template.save();
    res.json({ message: "Template deleted (soft)" });
  } catch (err) { next(err); }
});

// ── GET /api/admin/workflow-templates/:id/history — Feature 4 ────────────────
router.get("/:id/history", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ message: "Invalid template id" });
    const data = await workflowSvc.getTemplateVersionHistory(req.params.id);
    if (!data) return res.status(404).json({ message: "Template not found" });
    res.json({ template: data });
  } catch (err) { next(err); }
});

module.exports = router;
