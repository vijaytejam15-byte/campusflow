/**
 * workflowService.js — API calls for the configurable workflow engine.
 * Additive alongside the existing requestService.js — does not replace it.
 */
import { api } from "../api";

// ── Workflow instance endpoints ───────────────────────────────────────────────

/** Get workflow status for a request. Returns null when no instance exists. */
export async function getRequestWorkflow(requestId) {
  try {
    return await api._request(`/api/requests/${encodeURIComponent(requestId)}/workflow`, { method: "GET" });
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/** Advance a request workflow stage. */
export async function advanceRequestWorkflow(requestId, action, comment = "") {
  return api._request(`/api/requests/${encodeURIComponent(requestId)}/workflow/advance`, {
    method: "POST",
    body:   JSON.stringify({ action, comment }),
  });
}

/** Get workflow status for a leave. Returns null when no instance exists. */
export async function getLeaveWorkflow(leaveId) {
  try {
    return await api._request(`/api/leave/${encodeURIComponent(leaveId)}/workflow`, { method: "GET" });
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/** Advance a leave workflow stage. */
export async function advanceLeaveWorkflow(leaveId, action, comment = "") {
  return api._request(`/api/leave/${encodeURIComponent(leaveId)}/workflow/advance`, {
    method: "POST",
    body:   JSON.stringify({ action, comment }),
  });
}

// ── Admin: workflow template endpoints ───────────────────────────────────────

export async function getWorkflowTemplates(params = {}) {
  const q = new URLSearchParams();
  if (params.entityKind) q.set("entityKind", params.entityKind);
  if (params.active !== undefined) q.set("active", String(params.active));
  const qs = q.toString();
  return api._request(`/api/admin/workflow-templates${qs ? "?" + qs : ""}`, { method: "GET" });
}

export async function getWorkflowTemplate(id) {
  return api._request(`/api/admin/workflow-templates/${encodeURIComponent(id)}`, { method: "GET" });
}

export async function createWorkflowTemplate(body) {
  return api._request("/api/admin/workflow-templates", {
    method: "POST",
    body:   JSON.stringify(body),
  });
}

export async function updateWorkflowTemplate(id, body) {
  return api._request(`/api/admin/workflow-templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    body:   JSON.stringify(body),
  });
}

export async function activateWorkflowTemplate(id) {
  return api._request(`/api/admin/workflow-templates/${encodeURIComponent(id)}/activate`, {
    method: "PATCH",
  });
}

export async function deactivateWorkflowTemplate(id) {
  return api._request(`/api/admin/workflow-templates/${encodeURIComponent(id)}/deactivate`, {
    method: "PATCH",
  });
}

export async function deleteWorkflowTemplate(id) {
  return api._request(`/api/admin/workflow-templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── Config endpoints ──────────────────────────────────────────────────────────

export async function getActiveWorkflowTemplates() {
  return api._request("/api/config/workflow-templates", { method: "GET" });
}

// ── Feature 4: Version history ────────────────────────────────────────────────

export async function getWorkflowTemplateHistory(id) {
  return api._request(`/api/admin/workflow-templates/${encodeURIComponent(id)}/history`, {
    method: "GET",
  });
}

// ── Feature 10: Workflow metrics ──────────────────────────────────────────────

export async function getWorkflowMetrics() {
  return api._request("/api/admin/workflow-metrics", { method: "GET" });
}
