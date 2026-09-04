import React, { useEffect, useState, useCallback } from "react";
import { getAuditLogs } from "../../services/adminService";

const ACTIONS = ["comment", "approve", "reject", "escalate", "close", "reopen"];
const ROLES   = ["student", "faculty", "hod", "admin"];

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, {
    year:   "numeric",
    month:  "short",
    day:    "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function ActionBadge({ action }) {
  const map = {
    approve:  { bg: "#dcfce7", fg: "#15803d" },
    reject:   { bg: "#fee2e2", fg: "#dc2626" },
    escalate: { bg: "#fef9c3", fg: "#a16207" },
    close:    { bg: "#f1f5f9", fg: "#475569" },
    comment:  { bg: "#dbeafe", fg: "#1d4ed8" },
    reopen:   { bg: "#f5f3ff", fg: "#7c3aed" },
  };
  const { bg = "#f1f5f9", fg = "#475569" } = map[action?.toLowerCase()] || {};
  return (
    <span className="cf-role-badge" style={{ background: bg, color: fg }}>
      {action || "—"}
    </span>
  );
}

export default function AuditLogs() {
  const [logs,       setLogs]       = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  const [actionFilter, setActionFilter] = useState("");
  const [roleFilter,   setRoleFilter]   = useState("");
  const [page,         setPage]         = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAuditLogs({
        action: actionFilter,
        role:   roleFilter,
        page,
        limit:  30,
      });
      setLogs(data.logs || []);
      setPagination(data.pagination || { total: 0, page: 1, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Could not load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, roleFilter, page]);

  useEffect(() => { load(); }, [load]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [actionFilter, roleFilter]);

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin</p>
        <h1 className="cf-welcome__title">Audit Logs</h1>
        <p className="cf-welcome__sub">
          A chronological record of every reviewer action across all requests.
        </p>
      </section>

      {error && <div className="cf-alert cf-alert--error" role="alert">{error}</div>}

      {/* Filters */}
      <div className="cf-toolbar cf-admin-toolbar">
        <select
          className="cf-input cf-admin-role-filter"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          className="cf-input cf-admin-role-filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="cf-audit-total">
          {!loading && `${pagination.total} entr${pagination.total !== 1 ? "ies" : "y"}`}
        </span>
      </div>

      {/* Log table */}
      {loading ? (
        <div className="cf-center cf-center--inline">
          <div className="cf-spinner" aria-label="Loading audit logs" />
        </div>
      ) : logs.length === 0 ? (
        <div className="cf-empty">
          <p className="cf-empty__title">No log entries found</p>
          <p className="cf-empty__text">Try clearing filters or check back after some requests are reviewed.</p>
        </div>
      ) : (
        <div className="cf-admin-table-wrapper">
          <table className="cf-admin-table" aria-label="Audit log table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Request type</th>
                <th>Action</th>
                <th>By</th>
                <th>Role</th>
                <th>Comment</th>
                <th>Status snapshot</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={`${log._id}-${i}`} className="cf-admin-user-row">
                  <td data-label="Date">
                    <span className="cf-audit-date">{fmtDate(log.createdAt)}</span>
                  </td>
                  <td data-label="Request type">
                    <span>{log.requestType || "—"}</span>
                  </td>
                  <td data-label="Action">
                    <ActionBadge action={log.action} />
                  </td>
                  <td data-label="By">
                    <span>{log.userName || "—"}</span>
                  </td>
                  <td data-label="Role">
                    <span className="cf-role-badge" style={{ background: "#f1f5f9", color: "#475569" }}>
                      {log.role || "—"}
                    </span>
                  </td>
                  <td data-label="Comment">
                    <span className="cf-audit-comment">{log.comment || <em style={{ color: "var(--cf-muted)" }}>—</em>}</span>
                  </td>
                  <td data-label="Status snapshot">
                    <span>{log.statusSnapshot || "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="cf-pagination" aria-label="Audit log pagination">
          <button
            className="cf-btn cf-btn--ghost cf-btn--auto"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </button>
          <span className="cf-pagination__info">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            className="cf-btn cf-btn--ghost cf-btn--auto"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
