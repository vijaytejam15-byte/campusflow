/**
 * config.routes.js — Dynamic configuration endpoint.
 * Mounted at /api/config
 *
 * Returns runtime configuration values (request types, priorities, statuses,
 * workflow templates) so the frontend doesn't need hardcoded constants.
 * All endpoints require authentication.
 */
"use strict";

const express          = require("express");
const { requireAuth }  = require("../middleware/auth");
const WorkflowTemplate = require("../models/WorkflowTemplate");
const { REQUEST_TYPES, PRIORITIES, STATUSES, SLA_HOURS } = require("../models/Request");

const router = express.Router();

// GET /api/config/request-types
router.get("/request-types", requireAuth, (_req, res) => {
  res.json({
    requestTypes: REQUEST_TYPES.map((v) => ({
      value: v,
      label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    })),
  });
});

// GET /api/config/priorities
router.get("/priorities", requireAuth, (_req, res) => {
  res.json({
    priorities: PRIORITIES.map((v) => ({
      value:    v,
      label:    v.charAt(0).toUpperCase() + v.slice(1),
      slaHours: SLA_HOURS[v] || 48,
    })),
  });
});

// GET /api/config/statuses
router.get("/statuses", requireAuth, (_req, res) => {
  res.json({ statuses: STATUSES });
});

// GET /api/config/workflow-templates — active templates visible to all auth users
router.get("/workflow-templates", requireAuth, async (_req, res, next) => {
  try {
    const templates = await WorkflowTemplate.find({ isActive: true })
      .select("name description appliesToTypes entityKind stages version")
      .lean();
    res.json({ templates });
  } catch (err) { next(err); }
});

module.exports = router;
