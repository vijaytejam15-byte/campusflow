/**
 * permissions.js — Fine-grained permission definitions and role mapping.
 *
 * Each permission string represents one specific action.
 * ROLE_PERMISSIONS maps each role to its allowed set.
 *
 * Usage:
 *   const { requirePermission } = require('../config/permissions');
 *   router.patch('/:id/status', requireAuth, requirePermission('REQUEST_APPROVE'), handler);
 *
 * Adding a new permission:
 *   1. Add the constant to PERMISSIONS below.
 *   2. Add it to the appropriate role(s) in ROLE_PERMISSIONS.
 *   3. Use requirePermission() in the route.
 */

// ── Permission constants ──────────────────────────────────────────────────────
const PERMISSIONS = {
  // Requests
  REQUEST_VIEW:      "REQUEST_VIEW",
  REQUEST_SUBMIT:    "REQUEST_SUBMIT",
  REQUEST_CANCEL:    "REQUEST_CANCEL",
  REQUEST_APPROVE:   "REQUEST_APPROVE",
  REQUEST_REJECT:    "REQUEST_REJECT",
  REQUEST_ESCALATE:  "REQUEST_ESCALATE",
  REQUEST_CLOSE:     "REQUEST_CLOSE",
  REQUEST_VIEW_ALL:  "REQUEST_VIEW_ALL",   // admin/staff see all

  // Leave
  LEAVE_VIEW:        "LEAVE_VIEW",
  LEAVE_SUBMIT:      "LEAVE_SUBMIT",
  LEAVE_CANCEL:      "LEAVE_CANCEL",
  LEAVE_APPROVE:     "LEAVE_APPROVE",
  LEAVE_REJECT:      "LEAVE_REJECT",
  LEAVE_VIEW_ALL:    "LEAVE_VIEW_ALL",

  // Users
  USER_MANAGE:       "USER_MANAGE",        // create/delete/change roles
  USER_VIEW_ALL:     "USER_VIEW_ALL",

  // Analytics & reporting
  ANALYTICS_VIEW:    "ANALYTICS_VIEW",
  AUDIT_VIEW:        "AUDIT_VIEW",

  // Leave types (admin config)
  LEAVE_TYPE_MANAGE: "LEAVE_TYPE_MANAGE",
};

// ── Role → permissions mapping ────────────────────────────────────────────────
const ROLE_PERMISSIONS = {
  student: new Set([
    PERMISSIONS.REQUEST_VIEW,
    PERMISSIONS.REQUEST_SUBMIT,
    PERMISSIONS.REQUEST_CANCEL,
    PERMISSIONS.LEAVE_VIEW,
    PERMISSIONS.LEAVE_SUBMIT,
    PERMISSIONS.LEAVE_CANCEL,
  ]),

  faculty: new Set([
    PERMISSIONS.REQUEST_VIEW,
    PERMISSIONS.REQUEST_VIEW_ALL,
    PERMISSIONS.REQUEST_APPROVE,
    PERMISSIONS.REQUEST_REJECT,
    PERMISSIONS.REQUEST_ESCALATE,
    PERMISSIONS.LEAVE_VIEW,
    PERMISSIONS.LEAVE_VIEW_ALL,
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.LEAVE_REJECT,
  ]),

  hod: new Set([
    PERMISSIONS.REQUEST_VIEW,
    PERMISSIONS.REQUEST_VIEW_ALL,
    PERMISSIONS.REQUEST_APPROVE,
    PERMISSIONS.REQUEST_REJECT,
    PERMISSIONS.REQUEST_ESCALATE,
    PERMISSIONS.REQUEST_CLOSE,
    PERMISSIONS.LEAVE_VIEW,
    PERMISSIONS.LEAVE_VIEW_ALL,
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.LEAVE_REJECT,
    PERMISSIONS.ANALYTICS_VIEW,
  ]),

  admin: new Set(Object.values(PERMISSIONS)), // admin has ALL permissions
};

/**
 * Check whether a role has a specific permission.
 */
function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.has(permission) : false;
}

/**
 * Express middleware factory.
 * Requires the user to have the given permission (role checked in DB).
 * Must be used after requireAuth.
 *
 * @param {string} permission  one of PERMISSIONS values
 */
function requirePermission(permission) {
  return async function permissionGuard(req, res, next) {
    try {
      const User = require("../models/User");
      const user = await User.findById(req.userId).select("role").lean();
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      if (!hasPermission(user.role, permission)) {
        return res.status(403).json({
          message: `Permission denied: "${permission}" required`,
          required: permission,
        });
      }

      req.userRole = user.role; // cache for downstream use
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, hasPermission, requirePermission };
