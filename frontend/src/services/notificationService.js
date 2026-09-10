/**
 * notificationService.js — Feature 6: Notification Center API calls.
 */
import { api } from "../api";

export async function getNotifications({ page = 1, limit = 20, unread = false } = {}) {
  const p = new URLSearchParams({ page, limit });
  if (unread) p.set("unread", "true");
  return api._request(`/api/notifications?${p}`, { method: "GET" });
}

export async function getUnreadCount() {
  return api._request("/api/notifications/unread-count", { method: "GET" });
}

export async function markRead(id) {
  return api._request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
}

export async function markAllRead() {
  return api._request("/api/notifications/read-all", { method: "PATCH" });
}

export async function deleteNotification(id) {
  return api._request(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
}
