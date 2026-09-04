import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllRequests } from "../../services/adminService";
import StatusBadge from "../../components/shared/StatusBadge";

const STATUSES     = ["pending", "in_review", "approved", "rejected", "escalated", "closed"];
const REQUEST_TYPES = [
  { value: "transcript",              label: "Transcript" },
  { value: "enrollment_verification", label: "Enrollment Verification" },
  { value: "leave_of_absence",        label: "Leave of Absence" },
  { value: "grade_appeal",            label: "Grade Appeal" },
  { value: "financial_aid",           label: "Financial Aid" },
  { value: "course_withdrawal",       label: "Course Withdrawal" },
  { value: "general",                 label: "General" },
];

const TYPE_LABEL = Object.fromEntries(REQUEST_TYPES.map((t) => [t.value, t.label]));

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function AdminRequests() {
  const [requests,   setRequests]   = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter,   setTypeFilter]   = useState("");
  const [page,         setPage]         = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAllRequests({ status: statusFilter, type: typeFilter, page, limit: 20 });
      setRequests(data.requests || []);
      setPagination(data.pagination || { total: 0, page: 1, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [statusFilter, typeFilter]);

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin</p>
        <h1 className="cf-welcome__title">All Requests</h1>
        <p className="cf-welcome__sub">
          System-wide view of every student request.
        </p>
      </section>

      {error && <div className="cf-alert cf-alert--error" role="alert">{error}</div>}

      {/* Filters */}
      <div className="cf-toolbar cf-admin-toolbar">
        <select
          className="cf-input cf-admin-role-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s} style={{ textTransform: "capitalize" }}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <select
          className="cf-input cf-admin-role-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {REQUEST_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <span className="cf-audit-total">
          {!loading && `${pagination.total} total`}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="cf-center cf-center--inline">
          <div className="cf-spinner" aria-label="Loading requests" />
        </div>
      ) : requests.length === 0 ? (
        <div className="cf-empty">
          <p className="cf-empty__title">No requests found</p>
          <p className="cf-empty__text">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="cf-admin-table-wrapper">
          <table className="cf-admin-table" aria-label="All requests">
            <thead>
              <tr>
                <th>Student</th>
                <th>Type</th>
                <th>Department</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req._id} className="cf-admin-user-row">
                  <td data-label="Student">
                    <span className="cf-admin-user-name">{req.student?.name || "—"}</span>
                    <span className="cf-admin-user-email" style={{ display: "block" }}>{req.student?.email}</span>
                  </td>
                  <td data-label="Type">{TYPE_LABEL[req.type] || req.type}</td>
                  <td data-label="Department">{req.department || req.student?.department || <em className="cf-muted-text">—</em>}</td>
                  <td data-label="Priority" style={{ textTransform: "capitalize" }}>{req.priority}</td>
                  <td data-label="Status"><StatusBadge status={req.status} small /></td>
                  <td data-label="Submitted">{fmtDate(req.createdAt)}</td>
                  <td data-label="Details">
                    <Link
                      to={`/faculty/requests/${req._id}`}
                      className="cf-tile__link"
                      style={{ fontSize: 13 }}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="cf-pagination" aria-label="Requests pagination">
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
