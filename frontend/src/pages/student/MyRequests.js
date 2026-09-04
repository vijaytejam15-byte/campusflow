import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  getMyRequests,
  cancelRequest,
  REQUEST_TYPES,
  STATUSES,
} from "../../services/requestService";
import StatusBadge from "../../components/shared/StatusBadge";
import SLABadge    from "../../components/shared/SLABadge";
import Pagination  from "../../components/shared/Pagination";

const PAGE_SIZE = 10;

// Human-readable type label helper
const TYPE_LABEL = Object.fromEntries(REQUEST_TYPES.map((t) => [t.value, t.label]));

// Format an ISO date string to a short locale date
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function MyRequests() {
  const location = useLocation();

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType,   setFilterType]   = useState("");
  const [page,         setPage]         = useState(1);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [requests,   setRequests]   = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  // Success banner when redirected from CreateRequest
  const [successMsg, setSuccessMsg] = useState(
    location.state?.created ? "Your request was submitted successfully." : ""
  );

  // Cancellation state
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelError,  setCancelError]  = useState("");

  // Expanded row for detail view
  const [expandedId, setExpandedId] = useState(null);

  const abortRef = useRef(null);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const load = useCallback(async (status, type, pg) => {
    // Cancel any in-flight fetch
    abortRef.current?.abort();
    const controller  = new AbortController();
    abortRef.current  = controller;

    setLoading(true);
    setError("");
    try {
      const data = await getMyRequests({ status, type, page: pg, limit: PAGE_SIZE });
      if (!controller.signal.aborted) {
        setRequests(data.requests   || []);
        setPagination(data.pagination || null);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message || "Could not load your requests.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Re-fetch whenever filters or page change
  useEffect(() => {
    load(filterStatus, filterType, page);
  }, [load, filterStatus, filterType, page]);

  // Cleanup on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  // Reset to page 1 when filters change
  function applyFilter(field, value) {
    setPage(1);
    setExpandedId(null);
    if (field === "status") setFilterStatus(value);
    if (field === "type")   setFilterType(value);
  }

  // ── Cancel request ──────────────────────────────────────────────────────────
  async function handleCancel(id) {
    if (!window.confirm("Cancel this request? This cannot be undone.")) return;
    setCancellingId(id);
    setCancelError("");
    try {
      await cancelRequest(id);
      setRequests((prev) => prev.filter((r) => r._id !== id));
      if (pagination) {
        setPagination((p) => p ? { ...p, total: p.total - 1 } : p);
      }
      setExpandedId(null);
    } catch (err) {
      setCancelError(err.message || "Could not cancel the request.");
    } finally {
      setCancellingId(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Student Requests</p>
        <h1 className="cf-welcome__title">My requests</h1>
        <p className="cf-welcome__sub">
          Track the status of all your submitted requests.
        </p>
      </section>

      {/* Success banner */}
      {successMsg && (
        <div className="cf-alert cf-alert--success" role="status">
          {successMsg}
          <button
            type="button"
            className="cf-alert__dismiss"
            aria-label="Dismiss"
            onClick={() => setSuccessMsg("")}
          >
            ×
          </button>
        </div>
      )}

      {/* Cancel error */}
      {cancelError && (
        <div className="cf-alert cf-alert--error" role="alert">
          {cancelError}
        </div>
      )}

      {/* Toolbar: filters + New request button */}
      <div className="cf-toolbar">
        <select
          className="cf-input cf-select cf-toolbar__filter"
          value={filterStatus}
          onChange={(e) => applyFilter("status", e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          className="cf-input cf-select cf-toolbar__filter"
          value={filterType}
          onChange={(e) => applyFilter("type", e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {REQUEST_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <Link
          to="/student/create-request"
          className="cf-btn cf-btn--auto"
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          + New request
        </Link>
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
          <p className="cf-empty__title">Something went wrong</p>
          <p className="cf-empty__text">{error}</p>
          <button
            className="cf-btn cf-btn--auto"
            onClick={() => load(filterStatus, filterType, page)}
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && requests.length === 0 && (
        <div className="cf-empty">
          <p className="cf-empty__title">
            {filterStatus || filterType ? "No requests match your filters" : "No requests yet"}
          </p>
          <p className="cf-empty__text">
            {filterStatus || filterType
              ? "Try clearing the filters to see all your requests."
              : "Submit your first request to get started."}
          </p>
          {!(filterStatus || filterType) && (
            <Link
              to="/student/create-request"
              className="cf-btn cf-btn--auto"
              style={{ textDecoration: "none", display: "inline-block" }}
            >
              + New request
            </Link>
          )}
        </div>
      )}

      {/* Request list */}
      {!loading && !error && requests.length > 0 && (
        <>
          <div className="cf-req-list">
            {requests.map((req) => {
              const isExpanded  = expandedId === req._id;
              const isCancelling = cancellingId === req._id;

              return (
                <article
                  key={req._id}
                  className={`cf-req-card${isExpanded ? " cf-req-card--open" : ""}`}
                >
                  {/* ── Card header (always visible) ── */}
                  <div
                    className="cf-req-card__head"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedId(isExpanded ? null : req._id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        setExpandedId(isExpanded ? null : req._id);
                    }}
                  >
                    <div className="cf-req-card__meta">
                      <span className="cf-req-card__type">
                        {TYPE_LABEL[req.type] ?? req.type}
                      </span>
                      <span className="cf-req-card__date">{fmtDate(req.createdAt)}</span>
                    </div>
                    <div className="cf-req-card__right">
                      <StatusBadge status={req.status} />
                      {req.slaDeadline && (
                        <SLABadge
                          slaDeadline={req.slaDeadline}
                          slaBreached={req.slaBreached}
                          status={req.status}
                          small
                        />
                      )}
                      <span className="cf-req-card__chevron" aria-hidden="true">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* ── Expanded detail ── */}
                  {isExpanded && (
                    <div className="cf-req-card__body">
                      {req.department && (
                        <p className="cf-req-card__detail">
                          <strong>Department:</strong> {req.department}
                        </p>
                      )}
                      <p className="cf-req-card__detail">
                        <strong>Priority:</strong>{" "}
                        <span style={{ textTransform: "capitalize" }}>{req.priority}</span>
                      </p>
                      <p className="cf-req-card__detail cf-req-card__detail--desc">
                        <strong>Description:</strong>
                        <br />
                        {req.description}
                      </p>

                      {req.attachments?.length > 0 && (
                        <p className="cf-req-card__detail">
                          <strong>Attachments:</strong>{" "}
                          {req.attachments.map((a) => a.originalName).join(", ")}
                        </p>
                      )}

                      {req.staffNote && (
                        <div className="cf-req-card__note">
                          <strong>Staff note:</strong> {req.staffNote}
                        </div>
                      )}

                      {/* Cancel — only for pending requests */}
                      {req.status === "pending" && (
                        <div className="cf-form-actions" style={{ marginTop: 14 }}>
                          <button
                            type="button"
                            className="cf-btn cf-btn--ghost-danger"
                            onClick={() => handleCancel(req._id)}
                            disabled={isCancelling}
                          >
                            {isCancelling ? "Cancelling…" : "Cancel request"}
                          </button>
                        </div>
                      )}

                      {/* View full details */}
                      <div style={{ marginTop: 12 }}>
                        <Link
                          to={`/student/requests/${req._id}`}
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
    </main>
  );
}
