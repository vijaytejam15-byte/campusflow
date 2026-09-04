import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applyLeave, getLeaveTypes } from "../../services/leaveService";
import FileUploader from "../../components/shared/FileUploader";

function calcWorkingDays(start, end) {
  if (!start || !end) return 0;
  let count = 0;
  const cur = new Date(start);
  const e   = new Date(end);
  while (cur <= e) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(0, count);
}

const today = new Date().toISOString().split("T")[0];

export default function ApplyLeave() {
  const navigate = useNavigate();

  const [leaveTypes,  setLeaveTypes]  = useState([]);
  const [typesLoading,setTypesLoading]= useState(true);

  const [form, setForm] = useState({
    leaveTypeId: "",
    startDate:   "",
    endDate:     "",
    reason:      "",
  });
  const [documents,  setDocuments]  = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");

  useEffect(() => {
    getLeaveTypes()
      .then((d) => setLeaveTypes(d.leaveTypes || []))
      .catch(() => setError("Could not load leave types."))
      .finally(() => setTypesLoading(false));
  }, []);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const selectedType = leaveTypes.find((t) => t._id === form.leaveTypeId);
  const days = calcWorkingDays(form.startDate, form.endDate);

  const dateError = form.startDate && form.endDate && form.endDate < form.startDate
    ? "End date cannot be before start date"
    : "";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.leaveTypeId)   { setError("Please select a leave type."); return; }
    if (!form.startDate)     { setError("Start date is required."); return; }
    if (!form.endDate)       { setError("End date is required."); return; }
    if (dateError)           { setError(dateError); return; }
    if (!form.reason.trim()) { setError("Reason is required."); return; }
    if (form.reason.trim().length < 10) { setError("Reason must be at least 10 characters."); return; }
    if (selectedType?.requiresDocument && documents.length === 0)
      { setError(`Supporting document is required for "${selectedType.name}".`); return; }

    setSubmitting(true);
    try {
      await applyLeave({
        leaveTypeId: form.leaveTypeId,
        startDate:   form.startDate,
        endDate:     form.endDate,
        reason:      form.reason.trim(),
        documents,
      });
      navigate("/student/my-leaves", { state: { created: true } });
    } catch (err) {
      setError(err.message || "Could not submit leave application.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="cf-main cf-main--narrow">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Leave Management</p>
        <h1 className="cf-welcome__title">Apply for Leave</h1>
        <p className="cf-welcome__sub">Submit a formal leave request to your advisor.</p>
      </section>

      {error && <div className="cf-alert cf-alert--error" role="alert">{error}</div>}

      <article className="cf-tile">
        <form onSubmit={handleSubmit} noValidate>

          {/* Leave Type */}
          <label className="cf-field">
            <span className="cf-label">Leave type</span>
            {typesLoading ? (
              <div className="cf-spinner" style={{ width: 20, height: 20, margin: 8 }} />
            ) : (
              <select
                className="cf-input cf-select"
                value={form.leaveTypeId}
                onChange={update("leaveTypeId")}
                disabled={submitting}
                required
              >
                <option value="">Select leave type…</option>
                {leaveTypes.map((t) => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
            )}
            {selectedType?.description && (
              <span className="cf-hint">{selectedType.description}</span>
            )}
            {selectedType?.requiresDocument && (
              <span className="cf-hint cf-hint--warn">⚠ Supporting document required</span>
            )}
            {selectedType?.maxDaysPerYear > 0 && (
              <span className="cf-hint">Max {selectedType.maxDaysPerYear} days/year for this type</span>
            )}
          </label>

          {/* Date row */}
          <div className="cf-field-row">
            <label className="cf-field">
              <span className="cf-label">Start date</span>
              <input
                type="date"
                className="cf-input"
                value={form.startDate}
                min={today}
                onChange={update("startDate")}
                disabled={submitting}
                required
              />
            </label>
            <label className="cf-field">
              <span className="cf-label">End date</span>
              <input
                type="date"
                className="cf-input"
                value={form.endDate}
                min={form.startDate || today}
                onChange={update("endDate")}
                disabled={submitting}
                required
              />
            </label>
          </div>

          {/* Date error */}
          {dateError && (
            <p className="cf-hint" style={{ color: "var(--cf-danger)", marginTop: -8 }}>
              {dateError}
            </p>
          )}

          {/* Days counter */}
          {days > 0 && (
            <div className="cf-leave-days-badge">
              <span className="cf-leave-days-badge__num">{days}</span>
              <span className="cf-leave-days-badge__label">
                working day{days !== 1 ? "s" : ""} requested
              </span>
            </div>
          )}

          {/* Reason */}
          <label className="cf-field">
            <span className="cf-label">Reason</span>
            <textarea
              className="cf-input cf-textarea cf-textarea--tall"
              value={form.reason}
              onChange={update("reason")}
              placeholder="Explain why you need this leave (minimum 10 characters)…"
              maxLength={2000}
              rows={4}
              disabled={submitting}
              required
            />
            <span className="cf-hint">{form.reason.length} / 2000</span>
          </label>

          {/* Documents */}
          <div className="cf-field">
            <span className="cf-label">
              Supporting documents
              {selectedType?.requiresDocument
                ? <span style={{ color: "var(--cf-danger)", marginLeft: 4 }}>*</span>
                : <span className="cf-optional"> (optional)</span>}
            </span>
            <FileUploader
              files={documents}
              onFilesChange={setDocuments}
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
              onClick={() => navigate("/student/my-leaves")}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="cf-btn cf-btn--auto" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </div>
        </form>
      </article>
    </main>
  );
}
