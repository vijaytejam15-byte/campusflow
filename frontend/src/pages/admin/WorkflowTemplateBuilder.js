/**
 * WorkflowTemplateBuilder — create or edit a workflow template.
 * Route: /admin/workflow-templates/new  (create)
 *        /admin/workflow-templates/:id  (edit)
 */
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getWorkflowTemplate,
  createWorkflowTemplate,
  updateWorkflowTemplate,
} from "../../services/workflowService";

const REQUEST_TYPES = [
  "transcript","enrollment_verification","leave_of_absence",
  "grade_appeal","financial_aid","course_withdrawal","general",
];
const ROLES    = ["faculty","hod","admin","specific"];
const ACTIONS  = ["approve","reject","escalate","close","request_info"];

function emptyStage(order) {
  return {
    _key:            Math.random().toString(36).slice(2),
    name:            "",
    assigneeRole:    "faculty",
    allowedActions:  ["approve","reject"],
    requiresComment: false,
    slaHours:        48,
    notifyOnEnter:   ["student"],
    autoAdvance:     false,
    autoAdvanceAction: null,
  };
}

export default function WorkflowTemplateBuilder() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const isEdit     = !!id && id !== "new";

  const [name,            setName]            = useState("");
  const [description,     setDescription]     = useState("");
  const [entityKind,      setEntityKind]      = useState("request");
  const [appliesToTypes,  setAppliesToTypes]  = useState([]);
  const [isActive,        setIsActive]        = useState(true);
  const [stages,          setStages]          = useState([emptyStage(1)]);
  const [loading,         setLoading]         = useState(isEdit);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState("");
  const [activeInstances, setActiveInstances] = useState(0);

  useEffect(() => {
    if (!isEdit) return;
    getWorkflowTemplate(id)
      .then(({ template, activeInstances: ai }) => {
        setName(template.name || "");
        setDescription(template.description || "");
        setEntityKind(template.entityKind || "request");
        setAppliesToTypes(template.appliesToTypes || []);
        setIsActive(template.isActive !== false);
        setStages((template.stages || []).map((s) => ({ ...s, _key: s._id || Math.random().toString(36).slice(2) })));
        setActiveInstances(ai || 0);
      })
      .catch((err) => setError(err.message || "Could not load template."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // ── Stage helpers ──────────────────────────────────────────────────────────
  function addStage() {
    setStages((prev) => [...prev, emptyStage(prev.length + 1)]);
  }

  function removeStage(idx) {
    setStages((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveStage(idx, dir) {
    setStages((prev) => {
      const next  = [...prev];
      const swap  = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function updateStage(idx, field, value) {
    setStages((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  function toggleAction(idx, action) {
    setStages((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const has = s.allowedActions.includes(action);
      return {
        ...s,
        allowedActions: has
          ? s.allowedActions.filter((a) => a !== action)
          : [...s.allowedActions, action],
      };
    }));
  }

  function toggleType(type) {
    setAppliesToTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Template name is required."); return; }
    if (stages.length === 0) { setError("At least one stage is required."); return; }
    for (const [i, s] of stages.entries()) {
      if (!s.name.trim()) { setError(`Stage ${i + 1}: name is required.`); return; }
      if (!s.allowedActions || s.allowedActions.length === 0) {
        setError(`Stage ${i + 1}: select at least one allowed action.`); return;
      }
    }

    setSaving(true);
    try {
      const payload = { name, description, entityKind, appliesToTypes, isActive, stages };
      if (isEdit) {
        await updateWorkflowTemplate(id, payload);
      } else {
        await createWorkflowTemplate(payload);
      }
      navigate("/admin/workflow-templates");
    } catch (err) {
      setError(err.message || "Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="cf-main"><div className="cf-center"><div className="cf-spinner" /></div></main>;

  return (
    <main className="cf-main cf-main--narrow">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin / Workflow Templates</p>
        <h1 className="cf-welcome__title">{isEdit ? "Edit Template" : "New Workflow Template"}</h1>
        {isEdit && activeInstances > 0 && (
          <p className="cf-welcome__sub" style={{ color: "#b45309" }}>
            ⚠ {activeInstances} active instance(s) — they will continue using the previous version snapshot.
          </p>
        )}
      </section>

      {error && <div className="cf-alert cf-alert--error" role="alert">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Basic info ── */}
        <article className="cf-tile" style={{ marginBottom: 20 }}>
          <h2 className="cf-tile__title">Template details</h2>

          <label className="cf-field">
            <span className="cf-label">Name <span style={{ color: "var(--cf-danger)" }}>*</span></span>
            <input className="cf-input" value={name} onChange={(e) => setName(e.target.value)}
              maxLength={120} disabled={saving} required />
          </label>

          <label className="cf-field">
            <span className="cf-label">Description</span>
            <textarea className="cf-input cf-textarea" rows={2} value={description}
              onChange={(e) => setDescription(e.target.value)} maxLength={500} disabled={saving} />
          </label>

          <label className="cf-field">
            <span className="cf-label">Entity kind</span>
            <select className="cf-input cf-select" value={entityKind}
              onChange={(e) => setEntityKind(e.target.value)} disabled={saving}>
              <option value="request">Request</option>
              <option value="leave">Leave</option>
            </select>
          </label>

          {entityKind === "request" && (
            <div className="cf-field">
              <span className="cf-label">Auto-apply to request types</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {REQUEST_TYPES.map((t) => (
                  <label key={t} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                    <input type="checkbox" checked={appliesToTypes.includes(t)}
                      onChange={() => toggleType(t)} disabled={saving} />
                    {t.replace(/_/g, " ")}
                  </label>
                ))}
              </div>
              <span className="cf-hint">Leave blank for manual assignment only.</span>
            </div>
          )}

          <label className="cf-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={saving} />
            <span className="cf-label" style={{ margin: 0 }}>Active (use for new submissions)</span>
          </label>
        </article>

        {/* ── Stages ── */}
        <article className="cf-tile" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 className="cf-tile__title" style={{ margin: 0 }}>Stages</h2>
            <button type="button" className="cf-btn cf-btn--ghost" onClick={addStage} disabled={saving}>
              + Add stage
            </button>
          </div>

          {stages.map((stage, idx) => (
            <div key={stage._key} style={{ border: "1px solid var(--cf-border, #e5e7eb)", borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>Stage {idx + 1}</strong>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="cf-btn cf-btn--ghost" style={{ padding: "2px 8px", fontSize: 12 }}
                    onClick={() => moveStage(idx, -1)} disabled={saving || idx === 0} aria-label="Move stage up">↑</button>
                  <button type="button" className="cf-btn cf-btn--ghost" style={{ padding: "2px 8px", fontSize: 12 }}
                    onClick={() => moveStage(idx, 1)} disabled={saving || idx === stages.length - 1} aria-label="Move stage down">↓</button>
                  <button type="button" className="cf-btn cf-btn--ghost" style={{ padding: "2px 8px", fontSize: 12, color: "var(--cf-danger)" }}
                    onClick={() => removeStage(idx)} disabled={saving || stages.length <= 1} aria-label="Remove stage">✕</button>
                </div>
              </div>

              <label className="cf-field">
                <span className="cf-label">Stage name *</span>
                <input className="cf-input" value={stage.name}
                  onChange={(e) => updateStage(idx, "name", e.target.value)}
                  placeholder="e.g. Faculty Review" maxLength={100} disabled={saving} required />
              </label>

              <div className="cf-field-row">
                <label className="cf-field">
                  <span className="cf-label">Assignee role</span>
                  <select className="cf-input cf-select" value={stage.assigneeRole}
                    onChange={(e) => updateStage(idx, "assigneeRole", e.target.value)} disabled={saving}>
                    {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </label>
                <label className="cf-field">
                  <span className="cf-label">SLA (hours)</span>
                  <input type="number" className="cf-input" min={0} value={stage.slaHours}
                    onChange={(e) => updateStage(idx, "slaHours", Number(e.target.value))} disabled={saving} />
                </label>
              </div>

              <div className="cf-field">
                <span className="cf-label">Allowed actions *</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {ACTIONS.map((a) => (
                    <label key={a} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                      <input type="checkbox" checked={(stage.allowedActions || []).includes(a)}
                        onChange={() => toggleAction(idx, a)} disabled={saving} />
                      {a.replace(/_/g, " ")}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={!!stage.requiresComment}
                    onChange={(e) => updateStage(idx, "requiresComment", e.target.checked)} disabled={saving} />
                  Require comment
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={!!stage.autoAdvance}
                    onChange={(e) => updateStage(idx, "autoAdvance", e.target.checked)} disabled={saving} />
                  Auto-advance on SLA breach
                </label>
              </div>

              {stage.autoAdvance && (
                <label className="cf-field" style={{ marginTop: 8 }}>
                  <span className="cf-label">Auto-advance action</span>
                  <select className="cf-input cf-select" value={stage.autoAdvanceAction || ""}
                    onChange={(e) => updateStage(idx, "autoAdvanceAction", e.target.value || null)} disabled={saving}>
                    <option value="">-- select --</option>
                    {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
                  </select>
                </label>
              )}
            </div>
          ))}
        </article>

        {/* ── Actions ── */}
        <div className="cf-form-actions">
          <button type="button" className="cf-btn cf-btn--ghost"
            onClick={() => navigate("/admin/workflow-templates")} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="cf-btn cf-btn--auto" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </button>
        </div>
      </form>
    </main>
  );
}
