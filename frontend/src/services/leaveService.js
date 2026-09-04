/**
 * leaveService — all API calls for the Leave Management module.
 * Uses api._request — HTTP-only cookie auth, no axios.
 */
import { api } from "../api";

// ── Leave Types ────────────────────────────────────────────────────────────────

export async function getLeaveTypes(all = false) {
  const q = all ? "?all=true" : "";
  return api._request(`/api/leave-types${q}`, { method: "GET" });
}

export async function createLeaveType(body) {
  return api._request("/api/leave-types", {
    method: "POST",
    body:   JSON.stringify(body),
  });
}

export async function updateLeaveType(id, body) {
  return api._request(`/api/leave-types/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body:   JSON.stringify(body),
  });
}

export async function deleteLeaveType(id) {
  return api._request(`/api/leave-types/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── Student: Apply & view own leaves ──────────────────────────────────────────

export async function applyLeave(body) {
  return api._request("/api/leave", {
    method: "POST",
    body:   JSON.stringify(body),
  });
}

export async function getMyLeaves({ status, page = 1, limit = 10 } = {}) {
  const p = new URLSearchParams();
  if (status) p.set("status", status);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return api._request(`/api/leave?${p.toString()}`, { method: "GET" });
}

export async function getLeaveById(id) {
  return api._request(`/api/leave/${encodeURIComponent(id)}`, { method: "GET" });
}

export async function cancelLeave(id) {
  return api._request(`/api/leave/${encodeURIComponent(id)}/cancel`, {
    method: "PATCH",
  });
}

export async function addLeaveComment(id, comment) {
  return api._request(`/api/leave/${encodeURIComponent(id)}/comment`, {
    method: "POST",
    body:   JSON.stringify({ comment }),
  });
}

// ── Staff: Review queue & decisions ──────────────────────────────────────────

export async function getStaffLeaveQueue({ status = "pending", search, page = 1, limit = 20 } = {}) {
  const p = new URLSearchParams();
  p.set("status", status);
  if (search) p.set("search", search);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return api._request(`/api/leave/staff/queue?${p.toString()}`, { method: "GET" });
}

export async function reviewLeave(id, { decision, comment = "" }) {
  return api._request(`/api/leave/${encodeURIComponent(id)}/review`, {
    method: "PATCH",
    body:   JSON.stringify({ decision, comment }),
  });
}

// ── Admin: All leaves & stats ─────────────────────────────────────────────────

export async function getAllLeaves({ status, department, page = 1, limit = 20 } = {}) {
  const p = new URLSearchParams();
  if (status)     p.set("status",     status);
  if (department) p.set("department", department);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return api._request(`/api/leave/admin/all?${p.toString()}`, { method: "GET" });
}

export async function getLeaveStats() {
  return api._request("/api/leave/admin/stats", { method: "GET" });
}
