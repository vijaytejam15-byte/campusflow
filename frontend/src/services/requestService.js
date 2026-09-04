/**
 * requestService — all API calls for the Request workflow.
 * Uses the existing fetch-based api._request helper.
 * No axios, no localStorage.
 */
import { api } from "../api";

// ── Constants (mirror backend model) ─────────────────────────────────────────

export const REQUEST_TYPES = [
  { value: "transcript",              label: "Transcript Request" },
  { value: "enrollment_verification", label: "Enrollment Verification" },
  { value: "leave_of_absence",        label: "Leave of Absence" },
  { value: "grade_appeal",            label: "Grade Appeal" },
  { value: "financial_aid",           label: "Financial Aid" },
  { value: "course_withdrawal",       label: "Course Withdrawal" },
  { value: "general",                 label: "General Inquiry" },
];

export const PRIORITIES = [
  { value: "low",    label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high",   label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const STATUSES = [
  { value: "pending",   label: "Pending",   color: "pending"  },
  { value: "in_review", label: "In Review", color: "review"   },
  { value: "approved",  label: "Approved",  color: "approved" },
  { value: "rejected",  label: "Rejected",  color: "rejected" },
  { value: "escalated", label: "Escalated", color: "escalated"},
  { value: "closed",    label: "Closed",    color: "closed"   },
];

// ── Student methods ───────────────────────────────────────────────────────────

/**
 * Fetch the authenticated student's own requests.
 * @param {{ status?, type?, page?, limit? }} params
 */
export async function getMyRequests({ status, type, page = 1, limit = 10 } = {}) {
  const p = new URLSearchParams();
  if (status) p.set("status", status);
  if (type)   p.set("type",   type);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return api._request(`/api/requests?${p.toString()}`, { method: "GET" });
}

/** Fetch a single student-owned request. */
export async function getRequestById(id) {
  return api._request(`/api/requests/${encodeURIComponent(id)}`, { method: "GET" });
}

/** Submit a new request. */
export async function createRequest(body) {
  return api._request("/api/requests", {
    method: "POST",
    body:   JSON.stringify(body),
  });
}

/** Student edits a pending request. */
export async function updateRequest(id, body) {
  return api._request(`/api/requests/${encodeURIComponent(id)}`, {
    method: "PUT",
    body:   JSON.stringify(body),
  });
}

/** Student cancels (deletes) a pending request. */
export async function cancelRequest(id) {
  return api._request(`/api/requests/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── Reviewer methods (faculty / HOD / admin) ──────────────────────────────────

/**
 * Fetch requests queued for the logged-in reviewer.
 * Backend scopes automatically by role + department.
 *
 * @param {{ type?, priority?, search?, page?, limit? }} params
 * @returns {Promise<{ requests, pagination }>}
 */
export async function getPendingRequests({
  type,
  priority,
  search,
  page  = 1,
  limit = 20,
} = {}) {
  const p = new URLSearchParams();
  if (type)     p.set("type",     type);
  if (priority) p.set("priority", priority);
  if (search)   p.set("search",   search);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return api._request(`/api/requests/pending?${p.toString()}`, { method: "GET" });
}

/**
 * Reviewer updates a request's status.
 *
 * @param {string} requestId
 * @param {{ status: string, comment?: string }} payload
 * @returns {Promise<{ message, request }>}
 */
export async function updateRequestStatus(requestId, { status, comment = "" }) {
  return api._request(`/api/requests/${encodeURIComponent(requestId)}/status`, {
    method: "PATCH",
    body:   JSON.stringify({ status, comment }),
  });
}

/**
 * Add a standalone comment to a request.
 * Students can comment on their own; reviewers can comment on any.
 *
 * @param {string} requestId
 * @param {string} comment
 * @returns {Promise<{ message, comment }>}
 */
export async function addComment(requestId, comment) {
  return api._request(`/api/requests/${encodeURIComponent(requestId)}/comment`, {
    method: "POST",
    body:   JSON.stringify({ comment }),
  });
}
