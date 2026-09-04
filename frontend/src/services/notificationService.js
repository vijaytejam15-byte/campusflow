/**
 * notificationService — in-memory notification store + helpers.
 *
 * Because this project uses HTTP-only cookies (no localStorage) there is no
 * persistent notification storage on the client.  Notifications arrive via
 * Socket.io and are held in React state managed by NotificationBell.
 *
 * This module provides:
 *   • createNotification(type, payload) — build a notification object
 *   • NOTIFICATION_TYPES                 — event-type constants
 */

export const NOTIFICATION_TYPES = {
  REQUEST_CREATED:        "REQUEST_CREATED",
  REQUEST_STATUS_UPDATED: "REQUEST_STATUS_UPDATED",
};

let _idCounter = 0;

/**
 * Build a normalised notification object from a raw socket payload.
 *
 * @param {string} type    — NOTIFICATION_TYPES value
 * @param {object} payload — raw socket event payload
 * @returns {object}       notification
 */
export function createNotification(type, payload) {
  _idCounter += 1;
  const now = new Date();

  switch (type) {
    case NOTIFICATION_TYPES.REQUEST_CREATED:
      return {
        id:        _idCounter,
        type,
        title:     "New request submitted",
        body:      `${payload.studentName || "A student"} submitted a new request.`,
        requestId: payload.request?._id,
        createdAt: now,
        read:      false,
      };

    case NOTIFICATION_TYPES.REQUEST_STATUS_UPDATED:
      return {
        id:        _idCounter,
        type,
        title:     "Request status updated",
        body:      `Your request was ${payload.newStatus || "updated"}${payload.reviewerName ? ` by ${payload.reviewerName}` : ""}.`,
        requestId: payload.request?._id,
        createdAt: now,
        read:      false,
      };

    default:
      return {
        id:        _idCounter,
        type,
        title:     "Notification",
        body:      JSON.stringify(payload),
        createdAt: now,
        read:      false,
      };
  }
}

/** Format a relative time string, e.g. "2 min ago" */
export function fmtRelative(date) {
  const diff = Date.now() - new Date(date).getTime();
  const sec  = Math.floor(diff / 1000);
  if (sec < 60)   return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60)   return `${min} min ago`;
  const hr  = Math.floor(min / 60);
  if (hr  < 24)   return `${hr} hr ago`;
  return new Date(date).toLocaleDateString();
}
