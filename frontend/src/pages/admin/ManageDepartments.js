import React, { useEffect, useState } from "react";
import { getDepartments, createDepartment, getUsers } from "../../services/adminService";

export default function ManageDepartments() {
  const [departments, setDepartments] = useState([]);
  const [deptCounts,  setDeptCounts]  = useState({});
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  // Create-form state
  const [newName,  setNewName]  = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createOk,    setCreateOk]    = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        // Load departments (deduplicated from user records) and user roster
        const [depts, data] = await Promise.all([
          getDepartments(),
          getUsers({ limit: 200 }),
        ]);
        if (cancelled) return;

        // Count members per department
        const counts = {};
        (data.users || []).forEach((u) => {
          if (u.department) counts[u.department] = (counts[u.department] || 0) + 1;
        });

        setDepartments(depts);
        setDeptCounts(counts);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load departments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setCreateError("Department name cannot be empty.");
      return;
    }
    if (departments.includes(name)) {
      setCreateError(`"${name}" already exists.`);
      return;
    }
    setCreating(true);
    setCreateError("");
    setCreateOk("");
    try {
      await createDepartment({ name });
      setDepartments((prev) => [...prev, name].sort((a, b) => a.localeCompare(b)));
      setNewName("");
      setCreateOk(`Department "${name}" added. Assign it to users to make it appear in reports.`);
    } catch (err) {
      setCreateError(err.message || "Failed to create department.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin</p>
        <h1 className="cf-welcome__title">Manage Departments</h1>
        <p className="cf-welcome__sub">
          Departments are derived from user profiles. Add new ones here and assign them to users.
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
          <button
            type="submit"
            className="cf-btn cf-btn--auto"
            disabled={creating || !newName.trim()}
          >
            {creating ? "Adding…" : "Add department"}
          </button>
        </form>
        <p className="cf-hint">
          Note: departments are stored as text fields on user accounts — no separate database table is used.
        </p>
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
            <p className="cf-empty__text">
              Departments appear here once assigned to at least one user profile.
            </p>
          </div>
        ) : (
          <ul className="cf-dept-list" aria-label="Department list">
            {departments.map((dept) => (
              <li key={dept} className="cf-dept-item">
                <span className="cf-dept-item__name">{dept}</span>
                <span className="cf-dept-item__count">
                  {deptCounts[dept] ?? 0} member{deptCounts[dept] !== 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
