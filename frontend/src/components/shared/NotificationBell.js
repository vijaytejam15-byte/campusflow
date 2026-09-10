/**
 * NotificationBell — Feature 6: real-time bell icon with unread badge.
 *
 * Renders a bell button in the app header. Clicking it opens an inline
 * dropdown panel with the user's most recent notifications.
 * Listens to Socket.io "NOTIFICATION" events to update badge instantly.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markRead, markAllRead, getUnreadCount } from "../../services/notificationService";

const TYPE_ICON = {
  request_submitted:     "📋",
  request_status_changed:"📝",
  request_assigned:      "👤",
  leave_submitted:       "🗓️",
  leave_status_changed:  "🗓️",
  workflow_stage_advanced:"⚙️",
  workflow_approved:     "✅",
  workflow_rejected:     "❌",
  sla_warning:           "⚠️",
  sla_breached:          "🔴",
  system:                "ℹ️",
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell({ socket }) {
  const [open,         setOpen]         = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [loading,      setLoading]      = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const loadCount = useCallback(async () => {
    try {
      const data = await getUnreadCount();
      setUnreadCount(data.count || 0);
    } catch { /* non-fatal */ }
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications({ limit: 10 });
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  // Load count on mount
  useEffect(() => { loadCount(); }, [loadCount]);

  // Socket.io real-time push
  useEffect(() => {
    if (!socket) return;
    const handler = (notif) => {
      setUnreadCount((c) => c + 1);
      setNotifications((prev) => [notif, ...prev].slice(0, 10));
    };
    socket.on("NOTIFICATION", handler);
    return () => socket.off("NOTIFICATION", handler);
  }, [socket]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleBellClick() {
    if (!open) loadNotifications();
    setOpen((o) => !o);
  }

  async function handleMarkRead(notif) {
    if (notif.read) return;
    try {
      await markRead(notif._id);
      setNotifications((prev) => prev.map((n) => n._id === notif._id ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* non-fatal */ }
    if (notif.actionUrl) { setOpen(false); navigate(notif.actionUrl); }
  }

  async function handleMarkAllRead() {
    try {
      await markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* non-fatal */ }
  }

  return (
    <div ref={panelRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Bell button */}
      <button
        type="button"
        onClick={handleBellClick}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          background: "none", border: "none", cursor: "pointer",
          position: "relative", padding: "4px 8px", fontSize: 20,
          color: "var(--cf-text, #0f172a)",
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 0, right: 0,
            background: "#dc2626", color: "#fff",
            borderRadius: "50%", fontSize: 10, fontWeight: 700,
            width: 16, height: 16, display: "flex", alignItems: "center",
            justifyContent: "center", lineHeight: 1,
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: "absolute", right: 0, top: "calc(100% + 8px)",
            width: 340, maxHeight: 480, overflowY: "auto",
            background: "#fff", border: "1px solid #e5e7eb",
            borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            zIndex: 1000,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            <div style={{ display: "flex", gap: 8 }}>
              {unreadCount > 0 && (
                <button type="button" onClick={handleMarkAllRead}
                  style={{ fontSize: 12, color: "#4f46e5", background: "none", border: "none", cursor: "pointer" }}>
                  Mark all read
                </button>
              )}
              <button type="button" onClick={() => { setOpen(false); navigate("/notifications"); }}
                style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>
                View all
              </button>
            </div>
          </div>

          {/* Body */}
          {loading ? (
            <div style={{ padding: 24, textAlign: "center" }}>
              <div className="cf-spinner" style={{ width: 20, height: 20, margin: "0 auto" }} />
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#6b7280", fontSize: 13 }}>
              No notifications yet
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {notifications.map((n) => (
                <li
                  key={n._id}
                  onClick={() => handleMarkRead(n)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #f8fafc",
                    cursor: n.actionUrl ? "pointer" : "default",
                    background: n.read ? "#fff" : "#f0f4ff",
                    display: "flex", gap: 10, alignItems: "flex-start",
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden>
                    {TYPE_ICON[n.type] || "🔔"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: n.read ? 400 : 600,
                      color: "#0f172a", wordBreak: "break-word" }}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n.body}
                      </p>
                    )}
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: "#94a3b8" }}>
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                  {!n.read && (
                    <span style={{ width: 8, height: 8, borderRadius: "50%",
                      background: "#4f46e5", flexShrink: 0, marginTop: 5 }} aria-hidden />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
