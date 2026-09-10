/**
 * notifications.routes.js — Feature 6: Notification Center
 *
 * GET    /api/notifications            — list own notifications (paginated)
 * GET    /api/notifications/unread-count — badge count
 * PATCH  /api/notifications/:id/read  — mark one read
 * PATCH  /api/notifications/read-all  — mark all read
 * DELETE /api/notifications/:id       — delete one notification
 */
"use strict";

const express    = require("express");
const mongoose   = require("mongoose");
const { requireAuth } = require("../middleware/auth");
const notifSvc   = require("../services/notification.service");
const Notification = require("../models/Notification");

const router = express.Router();

// GET /api/notifications
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const page       = Math.max(1, parseInt(req.query.page  || "1",  10));
    const limit      = Math.min(50, parseInt(req.query.limit || "20", 10));
    const unreadOnly = req.query.unread === "true";

    const data = await notifSvc.getNotifications(req.userId, { page, limit, unreadOnly });
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/notifications/unread-count
router.get("/unread-count", requireAuth, async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ userId: req.userId, read: false });
    res.json({ count });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all  (must come BEFORE /:id)
router.patch("/read-all", requireAuth, async (req, res, next) => {
  try {
    await notifSvc.markAllRead(req.userId);
    res.json({ message: "All notifications marked as read" });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid notification id" });
    const notif = await notifSvc.markRead(req.params.id, req.userId);
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    res.json({ notification: notif });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/:id
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid notification id" });
    const deleted = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!deleted) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
