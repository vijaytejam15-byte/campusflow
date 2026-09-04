import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getMyLeaves, cancelLeave } from "../../services/leaveService";

const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"];

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// Reuse existing StatusBadge for leave status colours (same naming conventions)
function LeaveStatusBadge({ status }) {
  const map = {
    pending:   { label: "Pending",   bg: "#fef9c3", color: "#854d0e", border: "#fde68a" },
    approved:  { label: "Approved",  bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
    rejected:  { label: "Rejected",  bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
    cancelled: { label: "Cancelled", bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
  };
  const cfg = map[status] || map.pending;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: "999px",
      fontSize: "12px", fontWeight: 700, background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`, whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

export default function MyLeaves() {
  const location = useLocation();
  const [filterStatus, setFilterStatus] = useState("");
  const [page,         setPage]         = useState(1);
  const [leaves,       setLeaves]       = useState([]);
  const [pagination,   setPagination]   = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelError,  setCancelError]  = useState("");
  const [successMsg,   setSuccessMsg]   = useState(
    location.state?.created ? "Your leave application has been submitted." : ""
  );

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await getMyLeaves({ status: filterStatus, page, limit: 10 });
      setLeaves(data.leaves || []);
      setPagination(data.pagination || null);
    } catch (err) {
      setError(err.message || "Could not load leave applications.");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filterStatus]);

  async function handleCancel(id) {
    if (!window.confirm("Cancel this leave application?")) return;
    setCancellingId(id);
    setCancelError("");
    try {
      await cancelLeave(id);
      setLeaves((prev) => prev.map((l) =>
        l._id === id ? { ...l, status: "cancelled" } : l
      ));
    } catch (err) {
      setCancelError(err.message || "Could not cancel.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Leave Management</p>
        <h1 className="cf-welcome__title">My Leave Applications</h1>
        <p className="cf-welcome__sub">Track all your leave requests and their status.</p>
      </section>

      {successMsg && (
        <div className="cf-alert cf-alert--success" role="status">
          {successMsg}
          <button className="cf-alert__dismiss" onClick={() => setSuccessMsg("")}>×</button>
        </div>
      )}
      {cancelError && <div className="cf-alert cf-alert--error" role="alert">{cancelError}</div>}

      {/* Toolbar */}
      <div className="cf-toolbar">
        <select
          className="cf-input cf-select cf-toolbar__filter"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {LEAVE_STATUSES.map((s) => (
            <option key={s} value={s} style={{ textTransform: "capitalize" }}>{s}</option>
          ))}
        </select>
        <Link
          to="/student/apply-leave"
          className="cf-btn cf-btn--auto"
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          + Apply for Leave
        </Link>
      </div>

      {loading && (
        <div className="cf-center cf-center--inline">
          <div className="cf-spinner" aria-label="Loading" />
        </div>
      )}

      {!loading && error && (
        <div className="cf-empty cf-empty--error">
          <p className="cf-empty__title">Something went wrong</p>
          <p className="cf-empty__text">{error}</p>
          <button className="cf-btn cf-btn--auto" onClick={load}>Try again</button>
        </div>
      )}

      {!loading && !error && leaves.length === 0 && (
        <div className="cf-empty">
          <p className="cf-empty__title">
            {filterStatus ? "No applications match your filter" : "No leave applications yet"}
          </p>
          <p className="cf-empty__text">Submit your first leave application to get started.</p>
          {!filterStatus && (
            <Link to="/student/apply-leave" className="cf-btn cf-btn--auto"
              style={{ textDecoration: "none", display: "inline-block" }}>
              + Apply for Leave
            </Link>
          )}
        </div>
      )}

      {!loading && !error && leaves.length > 0 && (
        <>
          <div className="cf-admin-table-wrapper">
            <table className="cf-admin-table" aria-label="Leave applications">
              <thead>
                <tr>
                  <th>Leave Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Applied</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((l) => (
                  <tr key={l._id} className="cf-admin-user-row">
                    <td data-label="Leave Type">
                      <span className="cf-admin-user-name">{l.leaveTypeName || l.leaveType?.name || "—"}</span>
                    </td>
                    <td data-label="From">{fmtDate(l.startDate)}</td>
                    <td data-label="To">{fmtDate(l.endDate)}</td>
                    <td data-label="Days">
                      <span className="cf-leave-day-count">{l.totalDays}</span>
                    </td>
                    <td data-label="Status"><LeaveStatusBadge status={l.status} /></td>
                    <td data-label="Applied">{fmtDate(l.createdAt)}</td>
                    <td data-label="Actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        to={`/student/leaves/${l._id}`}
                        className="cf-details-link"
                        style={{ fontSize: 13 }}
                      >
                        View →
                      </Link>
                      {l.status === "pending" && (
                        <button
                          type="button"
                          className="cf-btn cf-btn--ghost-danger cf-btn--auto"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                          onClick={() => handleCancel(l._id)}
                          disabled={cancellingId === l._id}
                        >
                          {cancellingId === l._id ? "…" : "Cancel"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="cf-pagination">
              <button
                className="cf-btn cf-btn--ghost cf-btn--auto"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >← Prev</button>
              <span className="cf-pagination__info">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                className="cf-btn cf-btn--ghost cf-btn--auto"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >Next →</button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
