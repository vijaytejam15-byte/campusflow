import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getPendingRequests,
  updateRequestStatus,
  REQUEST_TYPES,
  PRIORITIES,
} from "../../services/requestService";
import StatusBadge  from "../../components/shared/StatusBadge";
import SLABadge     from "../../components/shared/SLABadge";
import Pagination   from "../../components/shared/Pagination";
import ReviewModal  from "../../components/shared/ReviewModal";
import { useAuth }  from "../../hooks/useAuth";

const PAGE_SIZE = 20;

// Label helpers
const TYPE_LABEL     = Object.fromEntries(REQUEST_TYPES.map((t) => [t.value, t.label]));
const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label]));

const PRIORITY_COLOR = {
  low:    { color: "#374151", bg: "#f3f4f6" },
  normal: { color: "#1d4ed8", bg: "#eff6ff" },
  high:   { color: "#c2410c", bg: "#fff7ed" },
  urgent: { color: "#b91c1c", bg: "#fef2f2" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function PriorityPill({ priority }) {
  const cfg = PRIORITY_COLOR[priority] || PRIORITY_COLOR.normal;
  return (
    <span style={{
      display:       "inline-block",
      padding:       "2px 9px",
      borderRadius:  "999px",
      fontSize:      "11px",
      fontWeight:    700,
      letterSpacing: "0.03em",
      textTransform: "uppercase",
      color:         cfg.color,
      background:    cfg.bg,
    }}>
      {PRIORITY_LABEL[priority] || priority}
    </span>
  );
}

export default function PendingRequests() {
  const { user } = useAuth();
  const isHod    = user?.role === "hod";

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterType,     setFilterType]     = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [search,         setSearch]         = useState("");
  const [page,           setPage]           = useState(1);

  // ── Data ───────────────────────────────────────────────────────────────────
  const [requests,   setRequests]   = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  // ── Expand / review state ─────────────────────────────────────────────────
  const [expandedId,  setExpandedId]  = useState(null);
  const [reviewState, setReviewState] = useState(null);
  // reviewState: { requestId, action, requestLabel } | null
  const [submitting,  setSubmitting]  = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMsg,   setActionMsg]   = useState("");

  const abortRef    = useRef(null);
  const debounceRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (type, priority, srch, pg) => {
    abortRef.current?.abort();
    const ctrl    = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError("");
    try {
      const data = await getPendingRequests({ type, priority, search: srch, page: pg, limit: PAGE_SIZE });
      if (!ctrl.signal.aborted) {
        setRequests(data.requests   || []);
        setPagination(data.pagination || null);
      }
    } catch (err) {
      if (!ctrl.signal.aborted)
        setError(err.message || "Could not load requests.");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filterType, filterPriority, search, page);
  }, [load, filterType, filterPriority, search, page]);

  useEffect(() => () => { abortRef.current?.abort(); clearTimeout(debounceRef.current); }, []);

  function resetPage() { setPage(1); setExpandedId(null); setActionMsg(""); setActionError(""); }
  function applyFilter(field, value) {
    resetPage();
    if (field === "type")     setFilterType(value);
    if (field === "priority") setFilterPriority(value);
  }
  function handleSearchChange(e) {
    const v = e.target.value;
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { resetPage(); }, 400);
  }

  // ── Review action ──────────────────────────────────────────────────────────
  function openReview(req, action) {
    setActionError("");
    setActionMsg("");
    setReviewState({
      requestId:    req._id,
      action,
      requestLabel: `${TYPE_LABEL[req.type] || req.type} — ${req.student?.name || "Student"}`,
    });
  }

  async function handleConfirmReview(comment) {
    if (!reviewState) return;
    const STATUS_MAP = { approve: "approved", reject: "rejected", escalate: "escalated" };
    const newStatus  = STATUS_MAP[reviewState.action];

    setSubmitting(true);
    setActionError("");
    try {
      const data = await updateRequestStatus(reviewState.requestId, {
        status:  newStatus,
        comment,
      });
      // Update the card in-place
      setRequests((prev) =>
        prev.map((r) => (r._id === reviewState.requestId ? data.request : r))
      );
      setActionMsg(`Request ${newStatus} successfully.`);
      setReviewState(null);
      setExpandedId(null);
    } catch (err) {
      setActionError(err.message || "Action failed. Please try again.");
      setReviewState(null);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const title = isHod ? "HOD Review Queue" : "Faculty Review Queue";

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">{isHod ? "HOD" : "Faculty"}</p>
        <h1 className="cf-welcome__title">{title}</h1>
        <p className="cf-welcome__sub">
          Review and action student requests assigned to your department.
        </p>
      </section>

      {actionMsg && (
        <div className="cf-alert cf-alert--success" role="status">
          {actionMsg}
          <button type="button" className="cf-alert__dismiss" onClick={() => setActionMsg("")}>×</button>
        </div>
      )}
      {actionError && (
        <div className="cf-alert cf-alert--error" role="alert">
          {actionError}
          <button type="button" className="cf-alert__dismiss" onClick={() => setActionError("")}>×</button>
        </div>
      )}

      {/* Filters */}
      <div className="cf-toolbar">
        <input
          type="search"
          className="cf-input cf-search"
          placeholder="Search by student name…"
          value={search}
          onChange={handleSearchChange}
          aria-label="Search by student name"
        />
        <select
          className="cf-input cf-select cf-toolbar__filter"
          value={filterType}
          onChange={(e) => applyFilter("type", e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {REQUEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          className="cf-input cf-select cf-toolbar__filter"
          value={filterPriority}
          onChange={(e) => applyFilter("priority", e.target.value)}
          aria-label="Filter by priority"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="cf-center cf-center--inline">
          <div className="cf-spinner" aria-label="Loading requests" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="cf-empty cf-empty--error">
          <p className="cf-empty__title">Could not load requests</p>
          <p className="cf-empty__text">{error}</p>
          <button className="cf-btn cf-btn--auto" onClick={() => load(filterType, filterPriority, search, page)}>
            Try again
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && requests.length === 0 && (
        <div className="cf-empty">
          <p className="cf-empty__title">No requests to review</p>
          <p className="cf-empty__text">
            {filterType || filterPriority || search
              ? "Try clearing the filters."
              : "There are currently no pending requests for your department."}
          </p>
        </div>
      )}

      {/* Request list */}
      {!loading && !error && requests.length > 0 && (
        <>
          <div className="cf-req-list">
            {requests.map((req) => {
              const isOpen = expandedId === req._id;
              return (
                <article
                  key={req._id}
                  className={`cf-req-card${isOpen ? " cf-req-card--open" : ""}`}
                >
                  {/* Header row */}
                  <div
                    className="cf-req-card__head"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => setExpandedId(isOpen ? null : req._id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        setExpandedId(isOpen ? null : req._id);
                    }}
                  >
                    <div className="cf-req-card__meta">
                      <span className="cf-req-card__type">
                        {TYPE_LABEL[req.type] || req.type}
                        <span style={{ fontWeight: 400, color: "var(--cf-muted)", marginLeft: 6 }}>
                          — {req.student?.name || "Unknown student"}
                        </span>
                      </span>
                      <span className="cf-req-card__date">
                        {req.student?.department || req.department || "No dept"} · {fmtDate(req.createdAt)}
                      </span>
                    </div>
                    <div className="cf-req-card__right">
                      <PriorityPill priority={req.priority} />
                      <StatusBadge  status={req.status} />
                      {req.slaDeadline && (
                        <SLABadge
                          slaDeadline={req.slaDeadline}
                          slaBreached={req.slaBreached}
                          status={req.status}
                          small
                        />
                      )}
                      <span className="cf-req-card__chevron" aria-hidden="true">
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="cf-req-card__body">

                      {/* Student + meta row */}
                      <div className="cf-review-meta">
                        <span><strong>Student:</strong> {req.student?.name}</span>
                        <span><strong>Email:</strong> {req.student?.email}</span>
                        {req.department && <span><strong>Dept:</strong> {req.department}</span>}
                      </div>

                      <p className="cf-req-card__detail cf-req-card__detail--desc">
                        <strong>Description:</strong><br />{req.description}
                      </p>

                      {req.attachments?.length > 0 && (
                        <p className="cf-req-card__detail">
                          <strong>Attachments:</strong>{" "}
                          {req.attachments.map((a) => a.originalName).join(", ")}
                        </p>
                      )}

                      {/* Comment / audit history */}
                      {req.comments?.length > 0 && (
                        <div className="cf-history-timeline">
                          <p className="cf-history-timeline__heading">History</p>
                          {req.comments.map((c) => (
                            <div key={c._id} className="cf-history-timeline__entry">
                              <div className="cf-history-timeline__who">
                                <strong>{c.userName || "Staff"}</strong>
                                <span className="cf-history-timeline__role">{c.role}</span>
                                <span className="cf-history-timeline__date">{fmtDate(c.createdAt)}</span>
                              </div>
                              <p className="cf-history-timeline__comment">{c.comment}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action buttons — only for actionable statuses */}
                      {["pending", "in_review", "escalated"].includes(req.status) && (
                        <div className="cf-review-actions">
                          <button
                            type="button"
                            className="cf-btn cf-btn--auto cf-btn--approve"
                            onClick={() => openReview(req, "approve")}
                            disabled={submitting}
                          >
                            ✓ Approve
                          </button>
                          <button
                            type="button"
                            className="cf-btn cf-btn--auto cf-btn--danger"
                            onClick={() => openReview(req, "reject")}
                            disabled={submitting}
                          >
                            ✗ Reject
                          </button>
                          {/* Escalate only shown to faculty, not HOD (they are the top) */}
                          {!isHod && (
                            <button
                              type="button"
                              className="cf-btn cf-btn--auto cf-btn--warn"
                              onClick={() => openReview(req, "escalate")}
                              disabled={submitting}
                            >
                              ↑ Escalate to HOD
                            </button>
                          )}
                        </div>
                      )}

                      {/* View full details */}
                      <div style={{ marginTop: 12 }}>
                        <Link
                          to={`/faculty/requests/${req._id}`}
                          className="cf-details-link"
                        >
                          View full details & timeline →
                        </Link>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div style={{ marginTop: 28 }}>
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={(p) => { setPage(p); setExpandedId(null); }}
                disabled={loading}
              />
              <p className="cf-req-summary">
                Showing {(pagination.page - 1) * PAGE_SIZE + 1}–
                {Math.min(pagination.page * PAGE_SIZE, pagination.total)} of{" "}
                {pagination.total} request{pagination.total !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </>
      )}

      {/* Review confirmation modal */}
      {reviewState && (
        <ReviewModal
          action={reviewState.action}
          requestLabel={reviewState.requestLabel}
          onConfirm={handleConfirmReview}
          onCancel={() => setReviewState(null)}
          submitting={submitting}
        />
      )}
    </main>
  );
}
