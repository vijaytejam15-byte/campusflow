import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRequest, REQUEST_TYPES, PRIORITIES } from "../../services/requestService";
import FileUploader from "../../components/shared/FileUploader";

const EMPTY_FORM = {
  type:        "general",
  description: "",
  department:  "",
  priority:    "normal",
};

export default function CreateRequest() {
  const navigate = useNavigate();

  const [form, setForm]           = useState(EMPTY_FORM);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState("");

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate() {
    if (!form.type)              return "Please select a request type.";
    if (!form.description.trim()) return "Please describe your request.";
    if (form.description.trim().length < 20)
      return "Description must be at least 20 characters.";
    return "";
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSubmitting(true);
    try {
      await createRequest({
        type:        form.type,
        description: form.description.trim(),
        department:  form.department.trim(),
        priority:    form.priority,
        attachments,
      });
      navigate("/student/my-requests", {
        replace: false,
        state:   { created: true },
      });
    } catch (err) {
      setError(err.message || "Could not submit the request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="cf-main cf-main--narrow">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Student Requests</p>
        <h1 className="cf-welcome__title">New request</h1>
        <p className="cf-welcome__sub">
          Submit a formal request to the university administration.
        </p>
      </section>

      {error && (
        <div className="cf-alert cf-alert--error" role="alert">
          {error}
        </div>
      )}

      <article className="cf-tile">
        <form onSubmit={handleSubmit} noValidate>

          {/* Request type */}
          <label className="cf-field">
            <span className="cf-label">Request type</span>
            <select
              className="cf-input cf-select"
              value={form.type}
              onChange={update("type")}
              disabled={submitting}
              required
            >
              {REQUEST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>

          {/* Two-column row: department + priority */}
          <div className="cf-field-row">
            <label className="cf-field">
              <span className="cf-label">
                Department <span className="cf-optional">(optional)</span>
              </span>
              <input
                type="text"
                className="cf-input"
                value={form.department}
                onChange={update("department")}
                placeholder="e.g. Registrar's Office"
                maxLength={100}
                disabled={submitting}
              />
            </label>

            <label className="cf-field">
              <span className="cf-label">Priority</span>
              <select
                className="cf-input cf-select"
                value={form.priority}
                onChange={update("priority")}
                disabled={submitting}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Description */}
          <label className="cf-field">
            <span className="cf-label">Description</span>
            <textarea
              className="cf-input cf-textarea cf-textarea--tall"
              value={form.description}
              onChange={update("description")}
              placeholder="Describe your request in detail (minimum 20 characters)…"
              maxLength={3000}
              rows={5}
              disabled={submitting}
              required
            />
            <span className="cf-hint">
              {form.description.length} / 3000 characters
            </span>
          </label>

          {/* Attachments */}
          <div className="cf-field">
            <span className="cf-label">
              Attachments <span className="cf-optional">(optional, max 5 files)</span>
            </span>
            <FileUploader
              files={attachments}
              onFilesChange={setAttachments}
              maxFiles={5}
              maxSizeMB={5}
              disabled={submitting}
            />
          </div>

          {/* Actions */}
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              onClick={() => navigate("/student/my-requests")}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--auto"
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </form>
      </article>
    </main>
  );
}
