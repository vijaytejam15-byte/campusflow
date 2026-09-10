/**
 * notification.service.js — Feature 6: Notification Center
 *
 * Creates persistent Notification documents AND emits real-time
 * Socket.io events so the frontend bell updates instantly.
 */
"use strict";

const Notification = require("../models/Notification");
const logger       = require("../config/logger");

let _io = null;

/** Call once after Socket.io is initialised. */
function setIO(io) { _io = io; }

/**
 * Create a persistent notification and push it via Socket.io.
 *
 * @param {object} opts
 *   userId      - recipient ObjectId
 *   type        - Notification.type enum value
 *   title       - short title string
 *   body        - longer description (optional)
 *   entityKind  - "request"|"leave"|"workflow_instance"|"system"
 *   entityId    - ObjectId of related entity
 *   actionUrl   - frontend route to navigate to (optional)
 */
async function createNotification(opts) {
  try {
    const notif = await Notification.create({
      userId:     opts.userId,
      type:       opts.type,
      title:      opts.title,
      body:       opts.body       || "",
      entityKind: opts.entityKind || "system",
      entityId:   opts.entityId   || null,
      actionUrl:  opts.actionUrl  || "",
      read:       false,
    });

    // Emit real-time push
    if (_io) {
      _io.to(`user:${opts.userId}`).emit("NOTIFICATION", {
        _id:        notif._id,
        type:       notif.type,
        title:      notif.title,
        body:       notif.body,
        entityKind: notif.entityKind,
        entityId:   notif.entityId,
        actionUrl:  notif.actionUrl,
        createdAt:  notif.createdAt,
      });
    }

    return notif;
  } catch (err) {
    logger.warn("[Notification] Create failed", { error: err.message, userId: opts.userId });
    return null;
  }
}

/**
 * Bulk-notify multiple users (e.g. notify all faculty on a new request).
 */
async function notifyMany(userIds, opts) {
  await Promise.allSettled(
    userIds.map((uid) => createNotification({ ...opts, userId: uid }))
  );
}

/**
 * Mark one notification as read.
 */
async function markRead(notifId, userId) {
  return Notification.findOneAndUpdate(
    { _id: notifId, userId },
    { read: true },
    { new: true }
  );
}

/**
 * Mark all unread notifications for a user as read.
 */
async function markAllRead(userId) {
  return Notification.updateMany({ userId, read: false }, { read: true });
}

/**
 * Get paginated notifications for a user.
 */
async function getNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  const query = { userId };
  if (unreadOnly) query.read = false;

  const skip = (page - 1) * limit;
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({ userId, read: false }),
  ]);

  return { notifications, total, unreadCount, page, limit };
}

module.exports = {
  setIO,
  createNotification,
  notifyMany,
  markRead,
  markAllRead,
  getNotifications,
};
