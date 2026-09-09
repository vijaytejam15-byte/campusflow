import React, { useEffect, useState } from "react";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
  deleteDepartment,
} from "../../services/adminService";

export default function ManageDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  // Create-form state
  const [newName,       setNewName]       = useState("");
  const [newDesc,       setNewDesc]       = useState("");
  const [creating,      setCreating]      = useState(false);
  const [createError,   setCreateError]   = useState("");
  const [createOk,      setCreateOk]      = useState("");

  // Inline-edit state
  const [editingId,     setEditingId]     = useState(null);
  const [editName,      setEditName]      = useState("");
  const [editDesc,      setEditDesc]      = useState("");
  const [editSaving,    setEditSaving]    = useState(false);
  const [editError,     setEditError]     = useState("");

  function load() {
    setLoading(true);
    setError("");
    getDepartments({ all: true })
      .then((data) => setDepartments(data.departments || []))
      .catch((err) => setError(err.message || "Could not load departments."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { setCreateError("Department name cannot be empty."); return; }
    setCreating(true);
    setCreateError("");
    setCreateOk("");
    try {
      const data = await createDepartment({ name, description: newDesc.trim() });
      setDepartments((prev) =>
        [...prev, data.department].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewName("");
      setNewDesc("");
      setCreateOk(`Department "${name}" created.`);
    } catch (err) {
      setCreateError(err.message || "Failed to create department.");
    } finally {
      setCreating(false);
    }
  };

  // ── Inline edit ─────────────────────────────────────────────────────────────
  const startEdit = (dept) => {
    setEditingId(dept._id);
    setEditName(dept.name);
    setEditDesc(dept.description || "");
    setEditError("");
  };
  const cancelEdit = () => { setEditingId(null); setEditError(""); };
  const saveEdit = async (id) => {
    const name = editName.trim();
    if (!name) { setEditError("Name cannot be empty."); return; }
    setEditSaving(true);
    setEditError("");
    try {
      const data = await updateDepartment(id, { name, description: editDesc.trim() });
      setDepartments((prev) =>
        prev.map((d) => d._id === id ? data.department : d)
           .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch (err) {
      setEditError(err.message || "Failed to update.");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Deactivate ───────────────────────────────────────────────────────────────
  const handleDeactivate = async (dept) => {
    if (!window.confirm(`Deactivate "${dept.name}"?`)) return;
    try {
      const data = await deactivateDepartment(dept._id);
      setDepartments((prev) => prev.map((d) => d._id === dept._id ? data.department : d));
    } catch (err) {
      setError(err.message || "Failed to deactivate.");
    }
  };

  // ── Activate ─────────────────────────────────────────────────────────────────
  const handleActivate = async (dept) => {
    try {
      const { activateDepartment } = await import("../../services/adminService");
      const data = await activateDepartment(dept._id);
      setDepartments((prev) => prev.map((d) => d._id === dept._id ? data.department : d));
    } catch {
      // fallback: call PATCH directly
      try {
        const res = await fetch(`/api/admin/departments/${dept._id}/activate`, {
          method: "PATCH", credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        setDepartments((prev) => prev.map((d) => d._id === dept._id ? data.department : d));
      } catch (err) {
        setError(err.message || "Failed to activate.");
      }
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (dept) => {
    if (!window.confirm(`Permanently delete "${dept.name}"? This cannot be undone.`)) return;
    try {
      await deleteDepartment(dept._id);
      setDepartments((prev) => prev.filter((d) => d._id !== dept._id));
    } catch (err) {
      setError(err.message || "Failed to delete.");
    }
  };

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin</p>
        <h1 className="cf-welcome__title">Manage Departments</h1>
        <p className="cf-welcome__sub">
          Add and manage departments. These are stored in the database and can be assigned to users.
        </p>
      </section>

      {error && <div className="cf-alert cf-alert--error" role="alert">{error}</div>}

      {/* Create new department */}
      <section className="cf-tile" style={{ marginBottom: 28 }}>
        <h2 className="cf-tile__title">Add department</h2>
        {createError && <div className="cf-alert cf-alert--error" role="alert">{createError}</div>}
        {createOk    && <div className="cf-alert cf-alert--success" role="status">{createOk}</div>}
        <form onSubmit={handleCreate} className="cf-dept-create-form" noValidate>
          <input
            className="cf-input"
            type="text"
            placeholder="e.g. Computer Science"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="New department name"
            maxLength={100}
            required
          />
          <input
            className="cf-input"
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            aria-label="Department description"
            maxLength={500}
          />
          <button
            type="submit"
            className="cf-btn cf-btn--auto"
            disabled={creating || !newName.trim()}
          >
            {creating ? "Adding…" : "Add department"}
          </button>
        </form>
      </section>

      {/* Department list */}
      <section className="cf-tile">
        <h2 className="cf-tile__title">
          All departments
          {!loading && <span className="cf-dept-count-badge">{departments.length}</span>}
        </h2>

        {loading ? (
          <div className="cf-center cf-center--inline">
            <div className="cf-spinner" aria-label="Loading departments" />
          </div>
        ) : departments.length === 0 ? (
          <div className="cf-empty">
            <p className="cf-empty__title">No departments yet</p>
            <p className="cf-empty__text">Add your first department above.</p>
          </div>
        ) : (
          <ul className="cf-dept-list" aria-label="Department list">
            {departments.map((dept) => (
              <li key={dept._id} className={`cf-dept-item${!dept.isActive ? " cf-dept-item--inactive" : ""}`}>
                {editingId === dept._id ? (
                  <div style={{ flex: 1 }}>
                    {editError && <span style={{ color: "var(--cf-danger)", fontSize: 13 }}>{editError}</span>}
                    <input
                      className="cf-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={100}
                      style={{ marginBottom: 4 }}
                    />
                    <input
                      className="cf-input"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Description (optional)"
                      maxLength={500}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button className="cf-btn cf-btn--auto" style={{ padding: "4px 12px" }}
                        onClick={() => saveEdit(dept._id)} disabled={editSaving}>
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                      <button className="cf-btn cf-btn--ghost" style={{ padding: "4px 12px" }}
                        onClick={cancelEdit}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <span className="cf-dept-item__name">
                        {dept.name}
                        {!dept.isActive && <span className="cf-badge cf-badge--inactive" style={{ marginLeft: 8 }}>Inactive</span>}
                      </span>
                      {dept.description && (
                        <p style={{ fontSize: 13, color: "var(--cf-muted)", margin: "2px 0 0" }}>{dept.description}</p>
                      )}
                    </div>
                    <span className="cf-dept-item__count">
                      {dept.memberCount ?? 0} member{dept.memberCount !== 1 ? "s" : ""}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="cf-btn cf-btn--ghost" style={{ padding: "3px 10px", fontSize: 13 }}
                        onClick={() => startEdit(dept)}>Edit</button>
                      {dept.isActive
                        ? <button className="cf-btn cf-btn--ghost" style={{ padding: "3px 10px", fontSize: 13 }}
                            onClick={() => handleDeactivate(dept)}>Deactivate</button>
                        : <button className="cf-btn cf-btn--ghost" style={{ padding: "3px 10px", fontSize: 13 }}
                            onClick={() => handleActivate(dept)}>Activate</button>
                      }
                      <button className="cf-btn cf-btn--danger" style={{ padding: "3px 10px", fontSize: 13 }}
                        onClick={() => handleDelete(dept)}>Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
