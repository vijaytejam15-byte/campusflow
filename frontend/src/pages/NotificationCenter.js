/**
 * NotificationCenter — Feature 6: Full notifications list page.
 * Route: /notifications
 */
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markRead, markAllRead, deleteNotification } from "../services/notificationService";

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

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [unread,   setUnread]   = useState(false);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getNotifications({ page, limit: LIMIT, unread });
      setNotifications(data.notifications || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [page, unread]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [unread]);

  async function handleMarkRead(n) {
    if (!n.read) {
      await markRead(n._id).catch(() => {});
      setNotifications((prev) => prev.map((x) => x._id === n._id ? { ...x, read: true } : x));
    }
    if (n.actionUrl) navigate(n.actionUrl);
  }

  async function handleMarkAllRead() {
    await markAllRead().catch(() => {});
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
  }

  async function handleDelete(id) {
    await deleteNotification(id).catch(() => {});
    setNotifications((prev) => prev.filter((x) => x._id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }

  const totalPages = Math.ceil(total / LIMIT);
  const hasUnread  = notifications.some((n) => !n.read);

  return (
    <main className="cf-main cf-main--narrow">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Notifications</p>
        <h1 className="cf-welcome__title">Notification Center</h1>
        <p className="cf-welcome__sub">All your system notifications in one place.</p>
      </section>

      {error && <div className="cf-alert cf-alert--error" role="alert">{error}</div>}

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} />
          Unread only
        </label>
        {hasUnread && (
          <button type="button" className="cf-btn cf-btn--ghost" style={{ fontSize: 13, padding: "4px 12px" }}
            onClick={handleMarkAllRead}>
            Mark all as read
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#6b7280" }}>{total} total</span>
      </div>

      {loading ? (
        <div className="cf-center cf-center--inline"><div className="cf-spinner" /></div>
      ) : notifications.length === 0 ? (
        <div className="cf-empty">
          <p className="cf-empty__title">No notifications</p>
          <p className="cf-empty__text">{unread ? "No unread notifications." : "You're all caught up!"}</p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {notifications.map((n) => (
            <li key={n._id} style={{
              display: "flex", gap: 12, padding: "14px 16px",
              background: n.read ? "#fff" : "#f0f4ff",
              border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 8,
              cursor: n.actionUrl ? "pointer" : "default",
            }} onClick={() => handleMarkRead(n)}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{TYPE_ICON[n.type] || "🔔"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: n.read ? 400 : 600, fontSize: 14, color: "#0f172a" }}>
                  {n.title}
                </p>
                {n.body && <p style={{ margin: "3px 0 0", fontSize: 13, color: "#6b7280" }}>{n.body}</p>}
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>{timeAgo(n.createdAt)}</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                {!n.read && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4f46e5", alignSelf: "flex-end" }} />
                )}
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(n._id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#94a3b8", padding: 2 }}
                  aria-label="Delete notification">✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="cf-pagination" style={{ marginTop: 16 }}>
          <button className="cf-btn cf-btn--ghost cf-btn--auto" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="cf-pagination__info">Page {page} / {totalPages}</span>
          <button className="cf-btn cf-btn--ghost cf-btn--auto" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </main>
  );
}
