import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { getRequestById, addComment, REQUEST_TYPES, PRIORITIES } from "../../services/requestService";
import { useAuth }    from "../../hooks/useAuth";
import StatusBadge    from "../../components/shared/StatusBadge";
import SLABadge       from "../../components/shared/SLABadge";
import Timeline       from "../../components/shared/Timeline";

// ── Label maps ──────────────────────────────────────────────────────────────
const TYPE_LABEL     = Object.fromEntries(REQUEST_TYPES.map((t) => [t.value, t.label]));
const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label]));

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACTION_COLOR = {
  approve:  { color: "#15803d", bg: "#f0fdf4", label: "Approved"  },
  reject:   { color: "#b91c1c", bg: "#fef2f2", label: "Rejected"  },
  escalate: { color: "#d97706", bg: "#fffbeb", label: "Escalated" },
  close:    { color: "#475569", bg: "#f8fafc", label: "Closed"    },
  comment:  { color: "#1d4ed8", bg: "#eff6ff", label: "Note"      },
  reopen:   { color: "#7c3aed", bg: "#f5f3ff", label: "Reopened"  },
};

function ActionPill({ action }) {
  const cfg = ACTION_COLOR[action] || ACTION_COLOR.comment;
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px", borderRadius: "999px",
      fontSize: "11px", fontWeight: 700, background: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

export default function RequestDetails() {
  const { id }   = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // Inline comment box
  const [newComment,     setNewComment]     = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentError,   setCommentError]   = useState("");
  const [commentSuccess, setCommentSuccess] = useState("");

  const role     = user?.role ?? "student";
  const backPath = ["faculty", "hod", "admin"].includes(role)
    ? "/faculty/pending-requests"
    : "/student/my-requests";
  const backLabel = ["faculty", "hod", "admin"].includes(role)
    ? "← Back to Review Queue"
    : "← Back to My Requests";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const data = await getRequestById(id);
        if (!cancelled) setRequest(data.request);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load request details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  async function handlePostComment(e) {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed) { setCommentError("Comment cannot be empty."); return; }
    setPostingComment(true);
    setCommentError("");
    setCommentSuccess("");
    try {
      const data = await addComment(id, trimmed);
      // Append the new comment locally so the UI updates immediately
      setRequest((prev) => ({
        ...prev,
        comments: [...(prev.comments || []), data.comment],
      }));
      setNewComment("");
      setCommentSuccess("Comment added.");
      setTimeout(() => setCommentSuccess(""), 3000);
    } catch (err) {
      setCommentError(err.message || "Could not post comment.");
    } finally {
      setPostingComment(false);
    }
  }

  if (loading) {
    return (
      <main className="cf-main cf-main--narrow">
        <div className="cf-center cf-center--inline">
          <div className="cf-spinner" aria-label="Loading request details" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="cf-main cf-main--narrow">
        <div className="cf-empty cf-empty--error">
          <p className="cf-empty__title">Could not load request</p>
          <p className="cf-empty__text">{error}</p>
          <button className="cf-btn cf-btn--auto" onClick={() => navigate(backPath)}>
            {backLabel}
          </button>
        </div>
      </main>
    );
  }

  if (!request) return null;

  const isReviewerView = ["faculty", "hod", "admin"].includes(role);
  const isTerminal     = ["approved", "rejected", "closed"].includes(request.status);

  return (
    <main className="cf-main cf-main--narrow">
      <Link to={backPath} className="cf-details-back">{backLabel}</Link>

      {/* Page header */}
      <section className="cf-welcome" style={{ marginTop: 16 }}>
        <p className="cf-eyebrow">Request Details</p>
        <h1 className="cf-welcome__title" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {TYPE_LABEL[request.type] || request.type}
          <StatusBadge status={request.status} />
        </h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span className="cf-welcome__sub" style={{ margin: 0 }}>
            Submitted {fmtDate(request.createdAt)}
            {request.student?.name && ` by ${request.student.name}`}
          </span>
          {request.slaDeadline && (
            <SLABadge
              slaDeadline={request.slaDeadline}
              slaBreached={request.slaBreached}
              status={request.status}
            />
          )}
        </div>
      </section>

      {/* Progress timeline */}
      <section className="cf-tile" style={{ marginBottom: 20 }}>
        <h2 className="cf-tile__title" style={{ marginBottom: 18 }}>Progress</h2>
        <Timeline currentStatus={request.status} comments={request.comments} />
      </section>

      {/* Summary */}
      <section className="cf-tile" style={{ marginBottom: 20 }}>
        <h2 className="cf-tile__title">Summary</h2>
        <dl className="cf-details">
          {isReviewerView && request.student && (
            <>
              <div className="cf-details__row"><dt>Student</dt><dd>{request.student.name}</dd></div>
              <div className="cf-details__row"><dt>Email</dt><dd>{request.student.email}</dd></div>
              {request.student.department && (
                <div className="cf-details__row"><dt>Department</dt><dd>{request.student.department}</dd></div>
              )}
            </>
          )}
          <div className="cf-details__row">
            <dt>Request type</dt><dd>{TYPE_LABEL[request.type] || request.type}</dd>
          </div>
          <div className="cf-details__row">
            <dt>Priority</dt>
            <dd style={{ textTransform: "capitalize" }}>{PRIORITY_LABEL[request.priority] || request.priority}</dd>
          </div>
          {request.department && (
            <div className="cf-details__row"><dt>Department</dt><dd>{request.department}</dd></div>
          )}
          <div className="cf-details__row">
            <dt>Status</dt><dd><StatusBadge status={request.status} small /></dd>
          </div>
          {request.slaDeadline && (
            <div className="cf-details__row">
              <dt>SLA deadline</dt>
              <dd>
                <SLABadge
                  slaDeadline={request.slaDeadline}
                  slaBreached={request.slaBreached}
                  status={request.status}
                  small
                />
              </dd>
            </div>
          )}
          {request.autoEscalated && (
            <div className="cf-details__row">
              <dt>Auto-escalated</dt>
              <dd><span style={{ color: "#b45309", fontWeight: 700 }}>⚡ Yes — SLA deadline was exceeded</span></dd>
            </div>
          )}
          {request.assignedTo && (
            <div className="cf-details__row">
              <dt>Assigned to</dt><dd>{request.assignedTo.name} ({request.assignedTo.role})</dd>
            </div>
          )}
          {request.reviewedAt && (
            <div className="cf-details__row"><dt>Last reviewed</dt><dd>{fmtDate(request.reviewedAt)}</dd></div>
          )}
          <div className="cf-details__row cf-details__row--block">
            <dt>Description</dt>
            <dd style={{ whiteSpace: "pre-wrap", fontWeight: 400 }}>{request.description}</dd>
          </div>
          {request.staffNote && (
            <div className="cf-details__row cf-details__row--block">
              <dt>Staff note</dt>
              <dd><div className="cf-req-card__note" style={{ marginTop: 4 }}>{request.staffNote}</div></dd>
            </div>
          )}
        </dl>
      </section>

      {/* Attachments */}
      {request.attachments?.length > 0 && (
        <section className="cf-tile" style={{ marginBottom: 20 }}>
          <h2 className="cf-tile__title">Attachments</h2>
          <ul className="cf-uploader__list">
            {request.attachments.map((a, idx) => (
              <li key={idx} className="cf-uploader__item">
                <span className="cf-uploader__item-name" title={a.originalName}>📎 {a.originalName}</span>
                {a.size > 0 && <span className="cf-uploader__item-size">{fmtSize(a.size)}</span>}
                {a.mimeType && <span className="cf-uploader__item-size">{a.mimeType}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Activity log */}
      <section className="cf-tile" style={{ marginBottom: 20 }}>
        <h2 className="cf-tile__title">Activity log</h2>
        {request.comments?.length > 0 ? (
          <div className="cf-history-timeline">
            {request.comments.map((c, i) => (
              <div key={c._id || i} className="cf-history-timeline__entry">
                <div className="cf-history-timeline__who">
                  <strong>{c.userName || "Staff"}</strong>
                  <span className="cf-history-timeline__role">{c.role}</span>
                  <ActionPill action={c.action} />
                  <span className="cf-history-timeline__date">{fmtDate(c.createdAt)}</span>
                </div>
                <p className="cf-history-timeline__comment">{c.comment}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="cf-tile__text">No activity yet.</p>
        )}

        {/* ── Add comment box ── */}
        {!isTerminal && (
          <form onSubmit={handlePostComment} className="cf-comment-form" noValidate>
            <h3 className="cf-comment-form__title">Add a comment</h3>
            {commentError   && <div className="cf-alert cf-alert--error"  role="alert">{commentError}</div>}
            {commentSuccess && <div className="cf-alert cf-alert--success" role="status">{commentSuccess}</div>}
            <label className="cf-field">
              <span className="cf-label">
                {isReviewerView ? "Reviewer note" : "Your message"}
                <span className="cf-optional"> (optional)</span>
              </span>
              <textarea
                className="cf-input cf-textarea"
                rows={3}
                maxLength={2000}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={isReviewerView
                  ? "Add an internal note or ask the student for more information…"
                  : "Provide additional details or follow up on your request…"}
                disabled={postingComment}
              />
              <span className="cf-hint">{newComment.length} / 2000</span>
            </label>
            <div className="cf-form-actions" style={{ marginTop: 10 }}>
              <button
                type="submit"
                className="cf-btn cf-btn--auto"
                disabled={postingComment || !newComment.trim()}
              >
                {postingComment ? "Posting…" : "Post comment"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Back button */}
      <div className="cf-form-actions cf-form-actions--single">
        <Link to={backPath} className="cf-btn cf-btn--ghost cf-btn--auto" style={{ textDecoration: "none" }}>
          {backLabel}
        </Link>
      </div>
    </main>
  );
}
