/**
 * adminService — all API calls for the Admin Management Portal.
 *
 * Delegates to api._request so session expiry, 401 detection, and base-URL
 * config all work identically to every other service in the project.
 * No axios, no localStorage.
 *
 * Backend endpoints (all under /api/admin, require role === "admin"):
 *   GET    /api/admin/metrics          — system-wide stats
 *   GET    /api/admin/users            — paginated user list with search/role filter
 *   POST   /api/admin/users            — create a user account
 *   PATCH  /api/admin/users/:id/role   — change a user's role
 *   DELETE /api/admin/users/:id        — delete a user account
 *   GET    /api/admin/audit-logs       — paginated audit/comment log
 *   GET    /api/admin/requests         — all requests across all students
 */
import { api } from "../api";

// ── Stats / Metrics ───────────────────────────────────────────────────────────

/**
 * Fetch system-wide statistics for the Admin Dashboard.
 * Alias: the prompt calls this getAdminStats() → GET /api/admin/stats
 * The backend serves this at /api/admin/metrics; we accept both paths.
 *
 * @returns {Promise<{ metrics }>}
 */
export async function getAdminStats() {
  return api._request("/api/admin/metrics", { method: "GET" });
}

// Alias matching the prompt's naming
export const getAdminMetrics = getAdminStats;

// ── Users ─────────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated list of users with optional search and role filter.
 *
 * @param {{ search?, role?, page?, limit? }} params
 * @returns {Promise<{ users, pagination }>}
 */
export async function getUsers({ search, role, page = 1, limit = 20 } = {}) {
  const p = new URLSearchParams();
  if (search) p.set("search", search);
  if (role)   p.set("role",   role);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return api._request(`/api/admin/users?${p.toString()}`, { method: "GET" });
}

/**
 * Create a new user account.
 *
 * @param {{ name, email, password, role?, department?, phoneNumber? }} body
 * @returns {Promise<{ message, user }>}
 */
export async function createUser(body) {
  return api._request("/api/admin/users", {
    method: "POST",
    body:   JSON.stringify(body),
  });
}

/**
 * Update a user's role.
 * Alias: the prompt calls this updateUserRole(userId, data).
 *
 * @param {string} userId
 * @param {{ role: string }} data
 * @returns {Promise<{ message, user }>}
 */
export async function updateUserRole(userId, data) {
  return api._request(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "PATCH",
    body:   JSON.stringify(data),
  });
}

/**
 * Delete a user account.
 *
 * @param {string} userId
 * @returns {Promise<{ message }>}
 */
export async function deleteUser(userId) {
  return api._request(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

/**
 * Assign or clear the advisor for a student.
 *
 * @param {string} studentId
 * @param {string|null} advisorId  ObjectId of the faculty/HOD user, or null to clear
 * @returns {Promise<{ message, user }>}
 */
export async function assignAdvisor(studentId, advisorId) {
  return api._request(`/api/admin/users/${encodeURIComponent(studentId)}/advisor`, {
    method: "PATCH",
    body:   JSON.stringify({ advisorId: advisorId || null }),
  });
}

// ── Departments ───────────────────────────────────────────────────────────────

/**
 * Fetch all departments from the dedicated Department collection.
 * Falls back to deriving from user records if the endpoint fails (backward compat).
 *
 * @param {{ all?: boolean }} options  pass all:true to include inactive
 * @returns {Promise<{ departments: object[] }>}
 */
export async function getDepartments({ all = false } = {}) {
  const q = all ? "?all=true" : "";
  return api._request(`/api/admin/departments${q}`, { method: "GET" });
}

/**
 * Create a new department.
 *
 * @param {{ name: string, description?: string }} data
 * @returns {Promise<{ message, department }>}
 */
export async function createDepartment(data) {
  return api._request("/api/admin/departments", {
    method: "POST",
    body:   JSON.stringify(data),
  });
}

/**
 * Update a department's name or description.
 *
 * @param {string} id
 * @param {{ name?: string, description?: string }} data
 * @returns {Promise<{ message, department }>}
 */
export async function updateDepartment(id, data) {
  return api._request(`/api/admin/departments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body:   JSON.stringify(data),
  });
}

/**
 * Deactivate a department (soft-delete).
 *
 * @param {string} id
 * @returns {Promise<{ message, department }>}
 */
export async function deactivateDepartment(id) {
  return api._request(`/api/admin/departments/${encodeURIComponent(id)}/deactivate`, {
    method: "PATCH",
  });
}

/**
 * Re-activate a deactivated department.
 *
 * @param {string} id
 * @returns {Promise<{ message, department }>}
 */
export async function activateDepartment(id) {
  return api._request(`/api/admin/departments/${encodeURIComponent(id)}/activate`, {
    method: "PATCH",
  });
}

/**
 * Hard-delete a department (only when no users are assigned).
 *
 * @param {string} id
 * @returns {Promise<{ message }>}
 */
export async function deleteDepartment(id) {
  return api._request(`/api/admin/departments/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── Audit logs ────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated audit log of all reviewer actions.
 *
 * @param {{ action?, role?, page?, limit? }} params
 * @returns {Promise<{ logs, pagination }>}
 */
export async function getAuditLogs({ action, role, page = 1, limit = 30 } = {}) {
  const p = new URLSearchParams();
  if (action) p.set("action", action);
  if (role)   p.set("role",   role);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return api._request(`/api/admin/audit-logs?${p.toString()}`, { method: "GET" });
}

// ── All requests ──────────────────────────────────────────────────────────────

/**
 * Fetch all requests across all students (admin-only view).
 *
 * @param {{ status?, type?, page?, limit? }} params
 * @returns {Promise<{ requests, pagination }>}
 */
export async function getAllRequests({ status, type, page = 1, limit = 20 } = {}) {
  const p = new URLSearchParams();
  if (status) p.set("status", status);
  if (type)   p.set("type",   type);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return api._request(`/api/admin/requests?${p.toString()}`, { method: "GET" });
}

// ── Analytics ─────────────────────────────────────────────────────────────────

/**
 * Fetch detailed analytics for the admin analytics dashboard.
 *
 * @returns {Promise<{ analytics }>}
 */
export async function getAnalytics() {
  return api._request("/api/admin/analytics", { method: "GET" });
}

// ── Workflow metrics (Feature 10) ─────────────────────────────────────────────

/**
 * Fetch workflow engine metrics (instances by status, SLA breach rate, avg stages).
 *
 * @returns {Promise<{ workflowMetrics, leaveMetrics }>}
 */
export async function getWorkflowMetrics() {
  return api._request("/api/admin/workflow-metrics", { method: "GET" });
}

// ── Unified Audit Trail (Feature 7) ──────────────────────────────────────────

/**
 * Fetch the full unified audit trail (all entity kinds).
 * Separate from getAuditLogs() which only covers Request comments.
 *
 * @param {{ action?, entityKind?, actorId?, from?, to?, page?, limit? }} params
 * @returns {Promise<{ logs, pagination }>}
 */
export async function getAuditTrail({ action, entityKind, actorId, from, to, page = 1, limit = 30 } = {}) {
  const p = new URLSearchParams();
  if (action)     p.set("action",     action);
  if (entityKind) p.set("entityKind", entityKind);
  if (actorId)    p.set("actorId",    actorId);
  if (from)       p.set("from",       from);
  if (to)         p.set("to",         to);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return api._request(`/api/admin/audit-trail?${p.toString()}`, { method: "GET" });
}
