import React, { useEffect, useRef, useState } from "react";

/**
 * ReviewModal — confirmation dialog for Approve / Reject / Escalate actions.
 *
 * Props
 * ─────
 * action        {string}   "approve" | "reject" | "escalate"
 * requestLabel  {string}   Short description shown in the modal heading
 * onConfirm     {fn}       Called with (comment: string) when confirmed
 * onCancel      {fn}       Called when the modal is dismissed
 * submitting    {boolean}  Disables buttons while the API call is in-flight
 */

const ACTION_CONFIG = {
  approve:  { label: "Approve",          btnClass: "cf-btn--approve", commentRequired: false },
  reject:   { label: "Reject",           btnClass: "cf-btn--danger",  commentRequired: true  },
  escalate: { label: "Escalate to HOD",  btnClass: "cf-btn--warn",    commentRequired: true  },
};

export default function ReviewModal({
  action,
  requestLabel,
  onConfirm,
  onCancel,
  submitting = false,
}) {
  const [comment, setComment] = useState("");
  const [error,   setError]   = useState("");
  const textareaRef           = useRef(null);
  const cfg = ACTION_CONFIG[action] ?? ACTION_CONFIG.approve;

  // Auto-focus the textarea on open
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !submitting) onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submitting, onCancel]);

  function handleConfirm() {
    setError("");
    const trimmed = comment.trim();
    if (cfg.commentRequired && !trimmed) {
      setError("A remark is required for this action.");
      textareaRef.current?.focus();
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <div
      className="cf-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rm-title"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onCancel(); }}
    >
      <div className="cf-modal cf-modal--review">
        {/* Header */}
        <header className="cf-modal__head">
          <h2 className="cf-modal__title" id="rm-title">
            {cfg.label}{" "}
            <span className="cf-modal__title-sub">"{requestLabel}"</span>
          </h2>
          <button
            type="button"
            className="cf-modal__close"
            aria-label="Close dialog"
            onClick={onCancel}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        {/* Body */}
        <div className="cf-modal__body">
          {error && (
            <div className="cf-alert cf-alert--error" role="alert">
              {error}
            </div>
          )}

          <label className="cf-field">
            <span className="cf-label">
              Remarks / Comments
              {cfg.commentRequired
                ? null
                : <span className="cf-optional"> (optional)</span>}
            </span>
            <textarea
              ref={textareaRef}
              className="cf-input cf-textarea cf-textarea--tall"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                action === "approve"
                  ? "Add an optional note for the student…"
                  : action === "reject"
                  ? "Explain the reason for rejection…"
                  : "Explain why this is being escalated to HOD…"
              }
              maxLength={2000}
              rows={4}
              disabled={submitting}
            />
            <span className="cf-hint">{comment.length} / 2000</span>
          </label>
        </div>

        {/* Actions */}
        <div className="cf-form-actions">
          <button
            type="button"
            className="cf-btn cf-btn--ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`cf-btn cf-btn--auto ${cfg.btnClass}`}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : `Confirm ${cfg.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
