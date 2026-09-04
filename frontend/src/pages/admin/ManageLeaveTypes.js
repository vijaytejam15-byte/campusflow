import React, { useEffect, useState } from "react";
import {
  getLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType,
} from "../../services/leaveService";

function LeaveTypeModal({ initial, onClose, onSaved }) {
  const isEdit = !!initial?._id;
  const [form, setForm] = useState({
    name:             initial?.name             || "",
    description:      initial?.description      || "",
    maxDaysPerYear:   initial?.maxDaysPerYear    ?? 0,
    requiresDocument: initial?.requiresDocument ?? false,
    isActive:         initial?.isActive         ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Name is required."); return; }
    setSaving(true); setErr("");
    try {
      let result;
      if (isEdit) {
        result = await updateLeaveType(initial._id, form);
      } else {
        result = await createLeaveType(form);
      }
      onSaved(result.leaveType);
    } catch (ex) {
      setErr(ex.message || "Could not save.");
      setSaving(false);
    }
  }

  return (
    <div className="cf-modal-overlay" role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="cf-modal">
        <div className="cf-modal__head">
          <h2 className="cf-modal__title">{isEdit ? "Edit Leave Type" : "Add Leave Type"}</h2>
          <button type="button" className="cf-modal__close" onClick={onClose}>×</button>
        </div>
        {err && <div className="cf-alert cf-alert--error">{err}</div>}
        <form onSubmit={handleSubmit} noValidate>
          <label className="cf-field">
            <span className="cf-label">Name</span>
            <input className="cf-input" value={form.name} onChange={set("name")} maxLength={80} required />
          </label>
          <label className="cf-field">
            <span className="cf-label">Description <span className="cf-optional">(optional)</span></span>
            <textarea className="cf-input cf-textarea" value={form.description}
              onChange={set("description")} maxLength={500} rows={2} />
          </label>
          <label className="cf-field">
            <span className="cf-label">Max days per year <span className="cf-optional">(0 = unlimited)</span></span>
            <input className="cf-input" type="number" min={0} max={365}
              value={form.maxDaysPerYear} onChange={set("maxDaysPerYear")} />
          </label>
          <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={form.requiresDocument}
                onChange={set("requiresDocument")} style={{ width: 16, height: 16 }} />
              <span className="cf-label" style={{ margin: 0 }}>Requires document</span>
            </label>
            {isEdit && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.isActive}
                  onChange={set("isActive")} style={{ width: 16, height: 16 }} />
                <span className="cf-label" style={{ margin: 0 }}>Active</span>
              </label>
            )}
          </div>
          <div className="cf-form-actions">
            <button type="button" className="cf-btn cf-btn--ghost cf-btn--auto" onClick={onClose}>Cancel</button>
            <button type="submit" className="cf-btn cf-btn--auto" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add leave type"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ManageLeaveTypes() {
  const [types,      setTypes]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [modal,      setModal]      = useState(null); // null | { mode: 'create' | 'edit', item? }
  const [actionMsg,  setActionMsg]  = useState("");
  const [actionErr,  setActionErr]  = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    getLeaveTypes(true) // admin sees all including inactive
      .then((d) => setTypes(d.leaveTypes || []))
      .catch((err) => setError(err.message || "Could not load leave types."))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(leaveType) {
    setTypes((prev) => {
      const idx = prev.findIndex((t) => t._id === leaveType._id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = leaveType;
        return next;
      }
      return [leaveType, ...prev];
    });
    setModal(null);
    setActionMsg(`Leave type "${leaveType.name}" saved.`);
    setTimeout(() => setActionMsg(""), 4000);
  }

  async function handleDeactivate(id, name) {
    if (!window.confirm(`Deactivate "${name}"? Students will no longer see it.`)) return;
    setActionErr("");
    try {
      const data = await deleteLeaveType(id);
      setTypes((prev) => prev.map((t) => t._id === id ? data.leaveType : t));
      setActionMsg(`"${name}" deactivated.`);
      setTimeout(() => setActionMsg(""), 3000);
    } catch (err) {
      setActionErr(err.message || "Could not deactivate.");
    }
  }

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin · Leave</p>
        <h1 className="cf-welcome__title">Manage Leave Types</h1>
        <p className="cf-welcome__sub">Configure leave categories available to students.</p>
      </section>

      {error      && <div className="cf-alert cf-alert--error"   role="alert">{error}</div>}
      {actionErr  && <div className="cf-alert cf-alert--error"   role="alert">{actionErr}</div>}
      {actionMsg  && <div className="cf-alert cf-alert--success" role="status">{actionMsg}</div>}

      <div className="cf-toolbar">
        <button type="button" className="cf-btn cf-btn--auto"
          onClick={() => setModal({ mode: "create" })}>
          + Add leave type
        </button>
      </div>

      {loading ? (
        <div className="cf-center cf-center--inline"><div className="cf-spinner" /></div>
      ) : types.length === 0 ? (
        <div className="cf-empty">
          <p className="cf-empty__title">No leave types yet</p>
          <p className="cf-empty__text">Create the first one to get started.</p>
        </div>
      ) : (
        <div className="cf-admin-table-wrapper">
          <table className="cf-admin-table" aria-label="Leave types">
            <thead>
              <tr>
                <th>Name</th>
                <th>Max days/year</th>
                <th>Requires doc</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t._id} className="cf-admin-user-row" style={{ opacity: t.isActive ? 1 : 0.55 }}>
                  <td data-label="Name">
                    <span className="cf-admin-user-name">{t.name}</span>
                    {t.description && (
                      <span className="cf-admin-user-email" style={{ display: "block" }}>{t.description}</span>
                    )}
                  </td>
                  <td data-label="Max days">{t.maxDaysPerYear === 0 ? "Unlimited" : t.maxDaysPerYear}</td>
                  <td data-label="Requires doc">{t.requiresDocument ? "Yes" : "No"}</td>
                  <td data-label="Status">
                    <span className="cf-role-badge"
                      style={{ background: t.isActive ? "#dcfce7" : "#f1f5f9", color: t.isActive ? "#15803d" : "#475569" }}>
                      {t.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td data-label="Actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="cf-btn cf-btn--ghost cf-btn--auto"
                      style={{ fontSize: 13, padding: "5px 12px" }}
                      onClick={() => setModal({ mode: "edit", item: t })}>
                      Edit
                    </button>
                    {t.isActive && (
                      <button type="button" className="cf-btn cf-btn--ghost-danger cf-btn--auto"
                        style={{ fontSize: 13, padding: "5px 12px" }}
                        onClick={() => handleDeactivate(t._id, t.name)}>
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <LeaveTypeModal
          initial={modal.mode === "edit" ? modal.item : null}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </main>
  );
}
