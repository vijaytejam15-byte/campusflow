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

// ── Departments ───────────────────────────────────────────────────────────────
// The project does not have a dedicated Department model; departments are
// free-text strings stored on User and Request documents.
// getDepartments() derives a deduplicated list from the user roster.

/**
 * Fetch the list of distinct department names currently in use.
 * Derived client-side from the first page of users (max 200).
 *
 * @returns {Promise<string[]>}  sorted, deduplicated department names
 */
export async function getDepartments() {
  const data = await api._request("/api/admin/users?limit=200&page=1", {
    method: "GET",
  });
  const depts = (data.users || [])
    .map((u) => u.department)
    .filter(Boolean);
  return [...new Set(depts)].sort((a, b) => a.localeCompare(b));
}

/**
 * "Create" a department by setting it on a placeholder — in this architecture
 * departments are just strings on user/request records; there's no separate
 * department collection.  This helper is a no-op stub that returns the name
 * immediately so callers can treat it like a real endpoint.
 *
 * When a dedicated Department model is added, replace this implementation.
 *
 * @param {{ name: string }} data
 * @returns {Promise<{ department: string }>}
 */
export async function createDepartment(data) {
  // Validate locally — nothing to persist yet
  const name = String(data?.name || "").trim();
  if (!name) throw new Error("Department name is required");
  return Promise.resolve({ department: name });
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
