/**
 * WorkflowStageActions — renders stage-aware action buttons for reviewers.
 *
 * When a request/leave has a workflowInstanceId, this replaces the fixed
 * approve/reject/escalate buttons with buttons derived from the current
 * stage's allowedActions. Falls back to null when no workflow is present
 * (the existing ReviewModal handles that case).
 *
 * Props:
 *   workflow       result of getRequestWorkflow() or getLeaveWorkflow()
 *   onAction       async fn(action, comment) => void
 *   submitting     boolean
 *   userRole       string
 */
import React, { useState } from "react";

const ACTION_CONFIG = {
  approve:      { label: "Approve",       className: "cf-btn cf-btn--success", requiresComment: false },
  reject:       { label: "Reject",        className: "cf-btn cf-btn--danger",  requiresComment: true  },
  escalate:     { label: "Escalate",      className: "cf-btn cf-btn--warn",    requiresComment: true  },
  close:        { label: "Close",         className: "cf-btn cf-btn--ghost",   requiresComment: false },
  request_info: { label: "Request Info",  className: "cf-btn cf-btn--ghost",   requiresComment: true  },
};

export default function WorkflowStageActions({ workflow, onAction, submitting, userRole }) {
  const [pendingAction, setPendingAction] = useState(null);
  const [comment,       setComment]       = useState("");
  const [error,         setError]         = useState("");

  if (!workflow || workflow.isTerminal) return null;

  const stage = workflow.currentStage;
  if (!stage) return null;

  // Check this user's role matches the stage's required role
  const canAct =
    userRole === "admin" ||
    stage.assigneeRole === userRole ||
    (stage.assigneeRole === "specific"); // specific user check done on backend

  if (!canAct) return null;

  const allowedActions = stage.allowedActions || [];

  function handleActionClick(action) {
    setError("");
    setComment("");
    setPendingAction(action);
  }

  async function handleConfirm() {
    const cfg = ACTION_CONFIG[pendingAction] || {};
    if (cfg.requiresComment && !comment.trim()) {
      setError("A comment is required for this action.");
      return;
    }
    try {
      await onAction(pendingAction, comment.trim());
      setPendingAction(null);
      setComment("");
    } catch (err) {
      setError(err.message || "Action failed.");
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
        Stage: <strong>{stage.stageName}</strong>
      </p>

      {/* Action buttons */}
      {!pendingAction && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {allowedActions.map((action) => {
            const cfg = ACTION_CONFIG[action] || { label: action, className: "cf-btn cf-btn--ghost" };
            return (
              <button
                key={action}
                type="button"
                className={cfg.className}
                onClick={() => handleActionClick(action)}
                disabled={submitting}
                aria-label={`${cfg.label} this item at stage ${stage.stageName}`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Confirm panel */}
      {pendingAction && (
        <div className="cf-tile" style={{ padding: 12, marginTop: 8 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>
            Confirm: {(ACTION_CONFIG[pendingAction]?.label || pendingAction)} at &ldquo;{stage.stageName}&rdquo;
          </p>

          {error && (
            <div className="cf-alert cf-alert--error" role="alert" style={{ marginBottom: 8 }}>
              {error}
            </div>
          )}

          <label className="cf-field">
            <span className="cf-label">
              Comment
              {ACTION_CONFIG[pendingAction]?.requiresComment && (
                <span style={{ color: "var(--cf-danger)", marginLeft: 4 }}>*</span>
              )}
            </span>
            <textarea
              className="cf-input cf-textarea"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting}
              maxLength={2000}
              aria-required={ACTION_CONFIG[pendingAction]?.requiresComment}
            />
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className={ACTION_CONFIG[pendingAction]?.className || "cf-btn cf-btn--auto"}
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Confirm"}
            </button>
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              onClick={() => { setPendingAction(null); setError(""); }}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
