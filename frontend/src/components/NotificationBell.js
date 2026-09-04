import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket }   from "../hooks/useSocket";
import { useAuth }     from "../hooks/useAuth";
import {
  createNotification,
  fmtRelative,
  NOTIFICATION_TYPES,
} from "../services/notificationService";

const MAX_NOTIFICATIONS = 20;

/**
 * NotificationBell — real-time notification badge + dropdown.
 *
 * Listens for REQUEST_CREATED and REQUEST_STATUS_UPDATED socket events and
 * surfaces them as an unread count badge.  Clicking the bell opens a dropdown
 * with the most recent notifications and links to the relevant request.
 */
export default function NotificationBell() {
  const { user }   = useAuth();
  const { on, off } = useSocket();
  const navigate   = useNavigate();
  const dropdownRef = useRef(null);

  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const role = user?.role ?? "student";

  // Add a notification, capping the list
  const push = useCallback((type, payload) => {
    const n = createNotification(type, payload);
    setNotifications((prev) => [n, ...prev].slice(0, MAX_NOTIFICATIONS));
  }, []);

  // Listen for socket events relevant to this user's role
  useEffect(() => {
    const handleCreated = (payload) => {
      // Only reviewers care about new submissions
      if (["faculty", "hod", "admin"].includes(role)) {
        push(NOTIFICATION_TYPES.REQUEST_CREATED, payload);
      }
    };

    const handleUpdated = (payload) => {
      // Students care about status updates on their own requests
      push(NOTIFICATION_TYPES.REQUEST_STATUS_UPDATED, payload);
    };

    on("REQUEST_CREATED",        handleCreated);
    on("REQUEST_STATUS_UPDATED", handleUpdated);

    return () => {
      off("REQUEST_CREATED",        handleCreated);
      off("REQUEST_STATUS_UPDATED", handleUpdated);
    };
  }, [on, off, push, role]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const unread = notifications.filter((n) => !n.read).length;

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function handleNotificationClick(n) {
    // Mark this one as read
    setNotifications((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
    );
    setOpen(false);

    // Navigate to the relevant request
    if (n.requestId) {
      const path = ["faculty", "hod", "admin"].includes(role)
        ? `/faculty/requests/${n.requestId}`
        : `/student/requests/${n.requestId}`;
      navigate(path);
    }
  }

  return (
    <div className="cf-notif" ref={dropdownRef}>
      <button
        type="button"
        className="cf-notif__btn"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        🔔
        {unread > 0 && (
          <span className="cf-notif__badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="cf-notif__dropdown" role="dialog" aria-label="Notifications">
          <div className="cf-notif__header">
            <span className="cf-notif__header-title">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                className="cf-notif__mark-all"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="cf-notif__empty">No notifications yet.</p>
          ) : (
            <ul className="cf-notif__list">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`cf-notif__item${n.read ? "" : " cf-notif__item--unread"}`}
                  onClick={() => handleNotificationClick(n)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleNotificationClick(n);
                  }}
                >
                  <div className="cf-notif__item-title">{n.title}</div>
                  <div className="cf-notif__item-body">{n.body}</div>
                  <div className="cf-notif__item-time">{fmtRelative(n.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
