import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { getLeaveById, addLeaveComment } from "../../services/leaveService";
import { useAuth } from "../../hooks/useAuth";

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtShortDate(iso) {
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
      display: "inline-block", padding: "4px 14px", borderRadius: "999px",
      fontWeight: 700, fontSize: "13px", background: s.bg, color: s.color,
    }}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}

export default function LeaveDetails() {
  const { id }   = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leave,   setLeave]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [comment,       setComment]       = useState("");
  const [posting,       setPosting]       = useState(false);
  const [commentError,  setCommentError]  = useState("");
  const [commentOk,     setCommentOk]     = useState("");

  const role = user?.role ?? "student";
  const backPath  = ["faculty", "hod", "admin"].includes(role) ? "/staff/leave-queue" : "/student/my-leaves";
  const backLabel = ["faculty", "hod", "admin"].includes(role) ? "← Back to Queue" : "← Back to My Leaves";

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    getLeaveById(id)
      .then((d) => { if (!cancelled) setLeave(d.leave); })
      .catch((err) => { if (!cancelled) setError(err.message || "Could not load details."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  async function handlePostComment(e) {
    e.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed) { setCommentError("Comment cannot be empty."); return; }
    setPosting(true); setCommentError(""); setCommentOk("");
    try {
      const data = await addLeaveComment(id, trimmed);
      setLeave((prev) => ({
        ...prev,
        comments: [...(prev.comments || []), data.comment],
      }));
      setComment("");
      setCommentOk("Comment added.");
      setTimeout(() => setCommentOk(""), 3000);
    } catch (err) {
      setCommentError(err.message || "Could not post comment.");
    } finally {
      setPosting(false);
    }
  }

  if (loading) {
    return (
      <main className="cf-main cf-main--narrow">
        <div className="cf-center cf-center--inline"><div className="cf-spinner" /></div>
      </main>
    );
  }

  if (error || !leave) {
    return (
      <main className="cf-main cf-main--narrow">
        <div className="cf-empty cf-empty--error">
          <p className="cf-empty__title">Could not load application</p>
          <p className="cf-empty__text">{error}</p>
          <button className="cf-btn cf-btn--auto" onClick={() => navigate(backPath)}>
            {backLabel}
          </button>
        </div>
      </main>
    );
  }

  const isTerminal = ["approved", "rejected", "cancelled"].includes(leave.status);
  const isReviewerView = ["faculty", "hod", "admin"].includes(role);

  return (
    <main className="cf-main cf-main--narrow">
      <Link to={backPath} className="cf-details-back">{backLabel}</Link>

      {/* Header */}
      <section className="cf-welcome" style={{ marginTop: 16 }}>
        <p className="cf-eyebrow">Leave Application</p>
        <h1 className="cf-welcome__title" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {leave.leaveTypeName || leave.leaveType?.name}
          <StatusPill status={leave.status} />
        </h1>
        <p className="cf-welcome__sub">
          Submitted {fmtDate(leave.createdAt)}
          {isReviewerView && leave.student?.name && ` by ${leave.student.name}`}
        </p>
      </section>

      {/* Details */}
      <section className="cf-tile" style={{ marginBottom: 20 }}>
        <h2 className="cf-tile__title">Application Details</h2>
        <dl className="cf-details">
          {isReviewerView && leave.student && (
            <>
              <div className="cf-details__row"><dt>Student</dt><dd>{leave.student.name}</dd></div>
              <div className="cf-details__row"><dt>Email</dt><dd>{leave.student.email}</dd></div>
              {leave.student.department && (
                <div className="cf-details__row"><dt>Department</dt><dd>{leave.student.department}</dd></div>
              )}
              {leave.student.rollNumber && (
                <div className="cf-details__row"><dt>Roll No.</dt><dd>{leave.student.rollNumber}</dd></div>
              )}
            </>
          )}
          <div className="cf-details__row"><dt>Leave type</dt><dd>{leave.leaveTypeName || leave.leaveType?.name}</dd></div>
          <div className="cf-details__row"><dt>From</dt><dd>{fmtShortDate(leave.startDate)}</dd></div>
          <div className="cf-details__row"><dt>To</dt><dd>{fmtShortDate(leave.endDate)}</dd></div>
          <div className="cf-details__row">
            <dt>Duration</dt>
            <dd>
              <span className="cf-leave-day-count">{leave.totalDays}</span>
              {" "}working day{leave.totalDays !== 1 ? "s" : ""}
            </dd>
          </div>
          <div className="cf-details__row"><dt>Status</dt><dd><StatusPill status={leave.status} /></dd></div>
          {leave.reviewedBy && (
            <div className="cf-details__row">
              <dt>Reviewed by</dt>
              <dd>{leave.reviewedBy.name} ({leave.reviewedBy.role})</dd>
            </div>
          )}
          {leave.reviewedAt && (
            <div className="cf-details__row"><dt>Reviewed on</dt><dd>{fmtDate(leave.reviewedAt)}</dd></div>
          )}
          <div className="cf-details__row cf-details__row--block">
            <dt>Reason</dt>
            <dd style={{ whiteSpace: "pre-wrap", fontWeight: 400 }}>{leave.reason}</dd>
          </div>
          {leave.staffNote && (
            <div className="cf-details__row cf-details__row--block">
              <dt>Staff note</dt>
              <dd>
                <div className="cf-req-card__note" style={{ marginTop: 4 }}>{leave.staffNote}</div>
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Documents */}
      {leave.documents?.length > 0 && (
        <section className="cf-tile" style={{ marginBottom: 20 }}>
          <h2 className="cf-tile__title">Supporting Documents</h2>
          <ul className="cf-uploader__list">
            {leave.documents.map((d, i) => (
              <li key={i} className="cf-uploader__item">
                <span className="cf-uploader__item-name">📎 {d.originalName}</span>
                {d.size > 0 && (
                  <span className="cf-uploader__item-size">
                    {d.size < 1024 ? `${d.size}B`
                      : d.size < 1048576 ? `${(d.size/1024).toFixed(1)}KB`
                      : `${(d.size/1048576).toFixed(1)}MB`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Activity */}
      <section className="cf-tile" style={{ marginBottom: 20 }}>
        <h2 className="cf-tile__title">Activity Log</h2>
        {leave.comments?.length > 0 ? (
          <div className="cf-history-timeline">
            {leave.comments.map((c, i) => (
              <div key={c._id || i} className="cf-history-timeline__entry">
                <div className="cf-history-timeline__who">
                  <strong>{c.userName || "Staff"}</strong>
                  <span className="cf-history-timeline__role">{c.role}</span>
                  <span className="cf-history-timeline__date">{fmtDate(c.createdAt)}</span>
                </div>
                <p className="cf-history-timeline__comment">{c.comment}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="cf-tile__text">No activity yet.</p>
        )}

        {/* Comment box for non-terminal */}
        {!isTerminal && (
          <form onSubmit={handlePostComment} className="cf-comment-form" noValidate>
            <h3 className="cf-comment-form__title">Add a note</h3>
            {commentError && <div className="cf-alert cf-alert--error">{commentError}</div>}
            {commentOk    && <div className="cf-alert cf-alert--success">{commentOk}</div>}
            <label className="cf-field">
              <textarea
                className="cf-input cf-textarea"
                rows={3}
                maxLength={2000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a note or additional information…"
                disabled={posting}
              />
              <span className="cf-hint">{comment.length} / 2000</span>
            </label>
            <div className="cf-form-actions" style={{ marginTop: 8 }}>
              <button
                type="submit"
                className="cf-btn cf-btn--auto"
                disabled={posting || !comment.trim()}
              >
                {posting ? "Posting…" : "Post note"}
              </button>
            </div>
          </form>
        )}
      </section>

      <div className="cf-form-actions cf-form-actions--single">
        <Link to={backPath} className="cf-btn cf-btn--ghost cf-btn--auto"
          style={{ textDecoration: "none" }}>{backLabel}</Link>
      </div>
    </main>
  );
}
