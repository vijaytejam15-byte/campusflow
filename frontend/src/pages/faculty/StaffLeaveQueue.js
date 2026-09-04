import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getStaffLeaveQueue, reviewLeave } from "../../services/leaveService";
import { useAuth } from "../../hooks/useAuth";

const STATUSES = ["pending", "approved", "rejected", "cancelled"];

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const STATUS_STYLE = {
  pending:   { bg: "#fef9c3", color: "#854d0e" },
  approved:  { bg: "#f0fdf4", color: "#15803d" },
  rejected:  { bg: "#fef2f2", color: "#b91c1c" },
  cancelled: { bg: "#f8fafc", color: "#475569" },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "999px",
      fontSize: "12px", fontWeight: 700, background: s.bg, color: s.color,
      whiteSpace: "nowrap",
    }}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}

// Inline review modal
function ReviewModal({ leave, onClose, onDone }) {
  const [decision, setDecision] = useState("");
  const [comment,  setComment]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!decision) { setErr("Select a decision."); return; }
    if (decision === "rejected" && !comment.trim()) {
      setErr("A reason is required when rejecting."); return;
    }
    setSaving(true); setErr("");
    try {
      const data = await reviewLeave(leave._id, { decision, comment: comment.trim() });
      onDone(data.leave);
    } catch (ex) {
      setErr(ex.message || "Action failed.");
      setSaving(false);
    }
  }

  return (
    <div
      className="cf-modal-overlay"
      role="dialog" aria-modal="true" aria-labelledby="rv-title"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="cf-modal cf-modal--review">
        <div className="cf-modal__head">
          <h2 className="cf-modal__title" id="rv-title">Review Leave Application</h2>
          <button type="button" className="cf-modal__close" onClick={onClose} disabled={saving}>×</button>
        </div>

        <p style={{ fontSize: 14, color: "var(--cf-muted)", marginBottom: 16 }}>
          <strong>{leave.student?.name}</strong> — {leave.leaveTypeName || "Leave"} ·{" "}
          {fmtDate(leave.startDate)} → {fmtDate(leave.endDate)} ({leave.totalDays}d)
        </p>

        {err && <div className="cf-alert cf-alert--error">{err}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="cf-leave-decision-row">
            <button
              type="button"
              className={`cf-leave-decision-btn cf-leave-decision-btn--approve${decision === "approved" ? " active" : ""}`}
              onClick={() => setDecision("approved")}
              disabled={saving}
            >
              ✓ Approve
            </button>
            <button
              type="button"
              className={`cf-leave-decision-btn cf-leave-decision-btn--reject${decision === "rejected" ? " active" : ""}`}
              onClick={() => setDecision("rejected")}
              disabled={saving}
            >
              ✗ Reject
            </button>
          </div>

          <label className="cf-field" style={{ marginTop: 16 }}>
            <span className="cf-label">
              Comment
              {decision === "rejected"
                ? <span style={{ color: "var(--cf-danger)", marginLeft: 4 }}>*</span>
                : <span className="cf-optional"> (optional)</span>}
            </span>
            <textarea
              className="cf-input cf-textarea"
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={decision === "rejected" ? "Explain the reason for rejection…" : "Add an optional note for the student…"}
              disabled={saving}
            />
          </label>

          <div className="cf-form-actions">
            <button type="button" className="cf-btn cf-btn--ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className={`cf-btn cf-btn--auto ${decision === "approved" ? "cf-btn--approve" : decision === "rejected" ? "cf-btn--danger" : ""}`}
              disabled={saving || !decision}
            >
              {saving ? "Saving…" : `Confirm ${decision || "decision"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function StaffLeaveQueue() {
  const { user }   = useAuth();
  const isHod      = user?.role === "hod";
  const debounceRef = useRef(null);

  const [filterStatus, setFilterStatus] = useState("pending");
  const [search,       setSearch]       = useState("");
  const [page,         setPage]         = useState(1);
  const [leaves,       setLeaves]       = useState([]);
  const [pagination,   setPagination]   = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [reviewTarget, setReviewTarget] = useState(null);
  const [actionMsg,    setActionMsg]    = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await getStaffLeaveQueue({ status: filterStatus, search, page });
      setLeaves(data.leaves || []);
      setPagination(data.pagination || null);
    } catch (err) {
      setError(err.message || "Could not load queue.");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, search, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filterStatus, search]);

  function handleSearchChange(e) {
    const v = e.target.value;
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPage(1), 400);
  }

  function handleReviewDone(updatedLeave) {
    setLeaves((prev) =>
      prev.map((l) => (l._id === updatedLeave._id ? { ...l, status: updatedLeave.status } : l))
    );
    setActionMsg(`Leave application ${updatedLeave.status}.`);
    setReviewTarget(null);
    setTimeout(() => setActionMsg(""), 4000);
  }

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">{isHod ? "HOD" : "Faculty"}</p>
        <h1 className="cf-welcome__title">Leave Review Queue</h1>
        <p className="cf-welcome__sub">Review and action student leave applications.</p>
      </section>

      {actionMsg && (
        <div className="cf-alert cf-alert--success" role="status">
          {actionMsg}
          <button className="cf-alert__dismiss" onClick={() => setActionMsg("")}>×</button>
        </div>
      )}

      {/* Filters */}
      <div className="cf-toolbar">
        <input
          type="search"
          className="cf-input cf-search"
          placeholder="Search by student name or roll no…"
          value={search}
          onChange={handleSearchChange}
          aria-label="Search"
        />
        <select
          className="cf-input cf-select cf-toolbar__filter"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s} style={{ textTransform: "capitalize" }}>{s}</option>
          ))}
        </select>
      </div>

      {loading && <div className="cf-center cf-center--inline"><div className="cf-spinner" /></div>}

      {!loading && error && (
        <div className="cf-empty cf-empty--error">
          <p className="cf-empty__title">Could not load queue</p>
          <p className="cf-empty__text">{error}</p>
          <button className="cf-btn cf-btn--auto" onClick={load}>Try again</button>
        </div>
      )}

      {!loading && !error && leaves.length === 0 && (
        <div className="cf-empty">
          <p className="cf-empty__title">No {filterStatus} applications</p>
          <p className="cf-empty__text">
            {filterStatus === "pending"
              ? "No leave applications are awaiting your review."
              : "Try changing the status filter."}
          </p>
        </div>
      )}

      {!loading && !error && leaves.length > 0 && (
        <>
          <div className="cf-admin-table-wrapper">
            <table className="cf-admin-table" aria-label="Leave queue">
              <thead>
                <tr>
                  <th>Student</th>
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
                    <td data-label="Student">
                      <span className="cf-admin-user-name">{l.student?.name || "—"}</span>
                      {l.student?.rollNumber && (
                        <span className="cf-admin-user-email" style={{ display: "block" }}>
                          {l.student.rollNumber}
                        </span>
                      )}
                    </td>
                    <td data-label="Leave Type">{l.leaveTypeName || "—"}</td>
                    <td data-label="From">{fmtDate(l.startDate)}</td>
                    <td data-label="To">{fmtDate(l.endDate)}</td>
                    <td data-label="Days">
                      <span className="cf-leave-day-count">{l.totalDays}</span>
                    </td>
                    <td data-label="Status"><StatusPill status={l.status} /></td>
                    <td data-label="Applied">{fmtDate(l.createdAt)}</td>
                    <td data-label="Actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link to={`/leave/${l._id}`} className="cf-details-link" style={{ fontSize: 13 }}>
                        View →
                      </Link>
                      {l.status === "pending" && (
                        <button
                          type="button"
                          className="cf-btn cf-btn--auto"
                          style={{ fontSize: 12, padding: "4px 12px" }}
                          onClick={() => setReviewTarget(l)}
                        >
                          Review
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
              <button className="cf-btn cf-btn--ghost cf-btn--auto"
                disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <span className="cf-pagination__info">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button className="cf-btn cf-btn--ghost cf-btn--auto"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      {reviewTarget && (
        <ReviewModal
          leave={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onDone={handleReviewDone}
        />
      )}
    </main>
  );
}
