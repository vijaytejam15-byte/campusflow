/**
 * WorkflowTemplateBuilder — create or edit a workflow template.
 *
 * Upgraded with:
 *   Feature 1  — stageType: sequential | parallel
 *   Feature 2  — Conditional transitions: per-stage routing rules
 *   Feature 3  — parallelAssignees + parallelQuorum
 *   Feature 4  — versionNote field on edit
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
const ROLES   = ["faculty","hod","admin","specific"];
const ACTIONS = ["approve","reject","escalate","close","request_info"];
const COND_OPERATORS = ["eq","neq","gt","gte","lt","lte","in","nin"];
const COND_FIELDS    = ["priority","type","department","totalDays","leaveTypeName"];

function emptyCondition() {
  return { field: "priority", operator: "eq", value: "", targetStageOrder: 0 };
}

function emptyStage() {
  return {
    _key:               Math.random().toString(36).slice(2),
    name:               "",
    stageType:          "sequential",
    assigneeRole:       "faculty",
    assigneeUserId:     "",
    parallelAssignees:  [],
    parallelQuorum:     0,
    allowedActions:     ["approve","reject"],
    requiresComment:    false,
    slaHours:           48,
    notifyOnEnter:      ["student"],
    autoAdvance:        false,
    autoAdvanceAction:  null,
    conditions:         [],
  };
}

export default function WorkflowTemplateBuilder() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const isEdit   = !!id && id !== "new";

  const [name,           setName]           = useState("");
  const [description,    setDescription]    = useState("");
  const [entityKind,     setEntityKind]     = useState("request");
  const [appliesToTypes, setAppliesToTypes] = useState([]);
  const [isActive,       setIsActive]       = useState(true);
  const [stages,         setStages]         = useState([emptyStage()]);
  const [versionNote,    setVersionNote]    = useState("");
  const [loading,        setLoading]        = useState(isEdit);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");
  const [activeInstances,setActiveInstances]= useState(0);
  const [versionHistory, setVersionHistory] = useState([]);
  const [showHistory,    setShowHistory]    = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getWorkflowTemplate(id)
      .then(({ template, activeInstances: ai }) => {
        setName(template.name || "");
        setDescription(template.description || "");
        setEntityKind(template.entityKind || "request");
        setAppliesToTypes(template.appliesToTypes || []);
        setIsActive(template.isActive !== false);
        setStages((template.stages || []).map((s) => ({
          ...emptyStage(), ...s,
          _key: s._id || Math.random().toString(36).slice(2),
          conditions: s.conditions || [],
          parallelAssignees: s.parallelAssignees || [],
        })));
        setVersionHistory(template.versionHistory || []);
        setActiveInstances(ai || 0);
      })
      .catch((err) => setError(err.message || "Could not load template."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // ── Stage helpers ──────────────────────────────────────────────────────────
  const addStage    = () => setStages((p) => [...p, emptyStage()]);
  const removeStage = (idx) => setStages((p) => p.filter((_, i) => i !== idx));
  const moveStage   = (idx, dir) => setStages((p) => {
    const n = [...p], s = idx + dir;
    if (s < 0 || s >= n.length) return p;
    [n[idx], n[s]] = [n[s], n[idx]];
    return n;
  });
  const updateStage = (idx, field, value) =>
    setStages((p) => p.map((s, i) => i === idx ? { ...s, [field]: value } : s));

  const toggleAction = (idx, action) => setStages((p) => p.map((s, i) => {
    if (i !== idx) return s;
    const has = s.allowedActions.includes(action);
    return { ...s, allowedActions: has ? s.allowedActions.filter((a) => a !== action) : [...s.allowedActions, action] };
  }));

  const toggleType = (type) => setAppliesToTypes((p) =>
    p.includes(type) ? p.filter((t) => t !== type) : [...p, type]);

  // ── Condition helpers ──────────────────────────────────────────────────────
  const addCondition    = (idx) => updateStage(idx, "conditions", [...(stages[idx].conditions || []), emptyCondition()]);
  const removeCondition = (idx, ci) => updateStage(idx, "conditions", stages[idx].conditions.filter((_, i) => i !== ci));
  const updateCondition = (idx, ci, field, val) => updateStage(idx, "conditions",
    stages[idx].conditions.map((c, i) => i === ci ? { ...c, [field]: val } : c));

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim())    { setError("Template name is required."); return; }
    if (!stages.length)  { setError("At least one stage is required."); return; }
    for (const [i, s] of stages.entries()) {
      if (!s.name.trim()) { setError(`Stage ${i+1}: name is required.`); return; }
      if (!s.allowedActions?.length) { setError(`Stage ${i+1}: select at least one action.`); return; }
    }
    setSaving(true);
    try {
      const payload = { name, description, entityKind, appliesToTypes, isActive, stages, versionNote };
      if (isEdit) await updateWorkflowTemplate(id, payload);
      else        await createWorkflowTemplate(payload);
      navigate("/admin/workflow-templates");
    } catch (err) {
      setError(err.message || "Failed to save template.");
    } finally { setSaving(false); }
  }

  if (loading) return <main className="cf-main"><div className="cf-center"><div className="cf-spinner" /></div></main>;

  return (
    <main className="cf-main cf-main--narrow">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin / Workflow Templates</p>
        <h1 className="cf-welcome__title">{isEdit ? "Edit Template" : "New Workflow Template"}</h1>
        {isEdit && activeInstances > 0 && (
          <p className="cf-welcome__sub" style={{ color: "#b45309" }}>
            ⚠ {activeInstances} active instance(s) — they will keep the previous version snapshot.
          </p>
        )}
      </section>

      {error && <div className="cf-alert cf-alert--error" role="alert">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Basic info ─────────────────────────────────────────────────── */}
        <article className="cf-tile" style={{ marginBottom: 20 }}>
          <h2 className="cf-tile__title">Template details</h2>

          <label className="cf-field">
            <span className="cf-label">Name *</span>
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
            </div>
          )}

          <label className="cf-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={saving} />
            <span className="cf-label" style={{ margin: 0 }}>Active (use for new submissions)</span>
          </label>

          {isEdit && (
            <label className="cf-field">
              <span className="cf-label">Version note <span className="cf-optional">(optional, saved with this edit)</span></span>
              <input className="cf-input" value={versionNote} onChange={(e) => setVersionNote(e.target.value)}
                maxLength={200} placeholder="e.g. Added HOD escalation stage" disabled={saving} />
            </label>
          )}
        </article>

        {/* ── Version history (Feature 4) ──────────────────────────────── */}
        {isEdit && versionHistory.length > 0 && (
          <article className="cf-tile" style={{ marginBottom: 20 }}>
            <button type="button" onClick={() => setShowHistory((h) => !h)}
              style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, padding: 0 }}>
              {showHistory ? "▾" : "▸"} Version history ({versionHistory.length} saved versions)
            </button>
            {showHistory && (
              <ul style={{ marginTop: 12, padding: 0, listStyle: "none" }}>
                {[...versionHistory].reverse().map((v, i) => (
                  <li key={i} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <strong>v{v.version}</strong>
                    {v.note && <span style={{ marginLeft: 8, color: "#6b7280" }}>{v.note}</span>}
                    <span style={{ marginLeft: 8, color: "#94a3b8" }}>
                      {v.editedAt ? new Date(v.editedAt).toLocaleString() : ""}
                      {v.editedBy?.name ? ` by ${v.editedBy.name}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}

        {/* ── Stages ─────────────────────────────────────────────────────── */}
        <article className="cf-tile" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 className="cf-tile__title" style={{ margin: 0 }}>Stages</h2>
            <button type="button" className="cf-btn cf-btn--ghost" onClick={addStage} disabled={saving}>
              + Add stage
            </button>
          </div>

          {stages.map((stage, idx) => (
            <div key={stage._key} style={{ border: "1px solid var(--cf-border, #e5e7eb)", borderRadius: 8, padding: 16, marginBottom: 12 }}>
              {/* Stage header */}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>Stage {idx + 1}</strong>
                <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" className="cf-btn cf-btn--ghost" style={{ padding: "2px 8px", fontSize: 12 }}
                    onClick={() => moveStage(idx, -1)} disabled={saving || idx === 0}>↑</button>
                  <button type="button" className="cf-btn cf-btn--ghost" style={{ padding: "2px 8px", fontSize: 12 }}
                    onClick={() => moveStage(idx, 1)} disabled={saving || idx === stages.length - 1}>↓</button>
                  <button type="button" className="cf-btn cf-btn--ghost"
                    style={{ padding: "2px 8px", fontSize: 12, color: "var(--cf-danger)" }}
                    onClick={() => removeStage(idx)} disabled={saving || stages.length <= 1}>✕</button>
                </div>
              </div>

              {/* Name */}
              <label className="cf-field">
                <span className="cf-label">Stage name *</span>
                <input className="cf-input" value={stage.name}
                  onChange={(e) => updateStage(idx, "name", e.target.value)}
                  placeholder="e.g. Faculty Review" maxLength={100} disabled={saving} required />
              </label>

              {/* Stage type (Feature 1/3) */}
              <div className="cf-field-row">
                <label className="cf-field">
                  <span className="cf-label">Stage type</span>
                  <select className="cf-input cf-select" value={stage.stageType || "sequential"}
                    onChange={(e) => updateStage(idx, "stageType", e.target.value)} disabled={saving}>
                    <option value="sequential">Sequential (one actor)</option>
                    <option value="parallel">Parallel (multiple actors)</option>
                  </select>
                </label>
                <label className="cf-field">
                  <span className="cf-label">Assignee role</span>
                  <select className="cf-input cf-select" value={stage.assigneeRole}
                    onChange={(e) => updateStage(idx, "assigneeRole", e.target.value)} disabled={saving}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="cf-field">
                  <span className="cf-label">SLA (hours)</span>
                  <input type="number" className="cf-input" min={0} value={stage.slaHours}
                    onChange={(e) => updateStage(idx, "slaHours", Number(e.target.value))} disabled={saving} />
                </label>
              </div>

              {/* Parallel options (Feature 3) */}
              {stage.stageType === "parallel" && (
                <div style={{ background: "#f8fafc", borderRadius: 6, padding: 12, marginBottom: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>Parallel approval settings</p>
                  <label className="cf-field">
                    <span className="cf-label">Minimum approvals (quorum, 0 = all)</span>
                    <input type="number" className="cf-input" min={0} max={20}
                      value={stage.parallelQuorum || 0}
                      onChange={(e) => updateStage(idx, "parallelQuorum", Number(e.target.value))}
                      disabled={saving} style={{ maxWidth: 120 }} />
                  </label>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>
                    Specific assignee IDs are set by the system after user assignment. Configure quorum here.
                  </p>
                </div>
              )}

              {/* Allowed actions */}
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

              {/* Options row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 6 }}>
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

              {/* Conditional transitions (Feature 2) */}
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Conditional routing</span>
                  <button type="button" className="cf-btn cf-btn--ghost"
                    style={{ padding: "2px 10px", fontSize: 12 }}
                    onClick={() => addCondition(idx)} disabled={saving}>
                    + Add condition
                  </button>
                </div>
                {(stage.conditions || []).length === 0 && (
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>
                    No conditions — always proceeds sequentially.
                  </p>
                )}
                {(stage.conditions || []).map((cond, ci) => (
                  <div key={ci} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                    <select className="cf-input cf-select" style={{ flex: "1 1 100px", minWidth: 90 }}
                      value={cond.field}
                      onChange={(e) => updateCondition(idx, ci, "field", e.target.value)}>
                      {COND_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <select className="cf-input cf-select" style={{ flex: "0 0 80px" }}
                      value={cond.operator}
                      onChange={(e) => updateCondition(idx, ci, "operator", e.target.value)}>
                      {COND_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input className="cf-input" style={{ flex: "1 1 90px", minWidth: 80 }}
                      placeholder="value" value={cond.value}
                      onChange={(e) => updateCondition(idx, ci, "value", e.target.value)} />
                    <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>→ stage</span>
                    <input type="number" className="cf-input" style={{ flex: "0 0 60px" }} min={1}
                      placeholder="order" value={cond.targetStageOrder || ""}
                      onChange={(e) => updateCondition(idx, ci, "targetStageOrder", Number(e.target.value))} />
                    <button type="button" onClick={() => removeCondition(idx, ci)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, padding: "0 4px" }}>✕</button>
                  </div>
                ))}
                {(stage.conditions || []).length > 0 && (
                  <p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 0" }}>
                    If condition matches, workflow jumps to the target stage order number.
                  </p>
                )}
              </div>
            </div>
          ))}
        </article>

        {/* ── Form actions ────────────────────────────────────────────────── */}
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
