import React, { useEffect, useState, useCallback } from "react";
import { getUsers, updateUserRole, deleteUser, createUser } from "../../services/adminService";

const ROLES = ["student", "faculty", "hod", "admin"];

// ── Small sub-components ──────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const colours = {
    admin:   { bg: "#ede9fe", fg: "#7c3aed" },
    hod:     { bg: "#fef9c3", fg: "#a16207" },
    faculty: { bg: "#dbeafe", fg: "#1d4ed8" },
    student: { bg: "#dcfce7", fg: "#15803d" },
  };
  const { bg = "#f1f5f9", fg = "#475569" } = colours[role] || {};
  return (
    <span className="cf-role-badge" style={{ background: bg, color: fg }}>
      {role}
    </span>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm]   = useState({ name: "", email: "", password: "", role: "student", department: "" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError("Name, email and password are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await createUser(form);
      onCreated(data.user);
    } catch (err) {
      setError(err.message || "Failed to create user.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cf-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cu-title">
      <div className="cf-modal">
        <div className="cf-modal__head">
          <h2 className="cf-modal__title" id="cu-title">Create user</h2>
          <button type="button" className="cf-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {error && <div className="cf-alert cf-alert--error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} noValidate>
          <label className="cf-field">
            <span className="cf-label">Name</span>
            <input className="cf-input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </label>
          <label className="cf-field">
            <span className="cf-label">Email</span>
            <input className="cf-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
          </label>
          <label className="cf-field">
            <span className="cf-label">Password</span>
            <input className="cf-input" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={6} />
          </label>
          <div className="cf-field-row">
            <label className="cf-field">
              <span className="cf-label">Role</span>
              <select className="cf-input" value={form.role} onChange={(e) => set("role", e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="cf-field">
              <span className="cf-label">Department <span className="cf-optional">(optional)</span></span>
              <input className="cf-input" value={form.department} onChange={(e) => set("department", e.target.value)} />
            </label>
          </div>
          <div className="cf-form-actions">
            <button type="button" className="cf-btn cf-btn--ghost cf-btn--auto" onClick={onClose}>Cancel</button>
            <button type="submit" className="cf-btn cf-btn--auto" disabled={saving}>
              {saving ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ManageUsers() {
  const [users,      setUsers]      = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [search,     setSearch]     = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page,       setPage]       = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  // { userId, currentRole } or null
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [actionError,   setActionError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getUsers({ search, role: roleFilter, page, limit: 20 });
      setUsers(data.users || []);
      setPagination(data.pagination || { total: 0, page: 1, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, page]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, roleFilter]);

  const handleRoleChange = async (userId, newRole) => {
    setActionError("");
    try {
      const data = await updateUserRole(userId, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, role: data.user?.role ?? newRole } : u))
      );
    } catch (err) {
      setActionError(err.message || "Failed to update role.");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setActionError("");
    try {
      await deleteUser(confirmDelete.userId);
      setUsers((prev) => prev.filter((u) => u._id !== confirmDelete.userId));
      setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }));
      setConfirmDelete(null);
    } catch (err) {
      setActionError(err.message || "Failed to delete user.");
      setConfirmDelete(null);
    }
  };

  return (
    <main className="cf-main">
      {/* Page header */}
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin</p>
        <h1 className="cf-welcome__title">Manage Users</h1>
        <p className="cf-welcome__sub">
          Search, filter, update roles, or remove user accounts.
        </p>
      </section>

      {error && <div className="cf-alert cf-alert--error" role="alert">{error}</div>}
      {actionError && <div className="cf-alert cf-alert--error" role="alert">{actionError}</div>}

      {/* Toolbar */}
      <div className="cf-toolbar cf-admin-toolbar">
        <input
          className="cf-input cf-search"
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
        <select
          className="cf-input cf-admin-role-filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button
          type="button"
          className="cf-btn cf-btn--auto"
          onClick={() => setShowCreate(true)}
        >
          + Create user
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="cf-center cf-center--inline">
          <div className="cf-spinner" aria-label="Loading users" />
        </div>
      ) : users.length === 0 ? (
        <div className="cf-empty">
          <p className="cf-empty__title">No users found</p>
          <p className="cf-empty__text">Try adjusting your search or filter.</p>
        </div>
      ) : (
        <div className="cf-admin-table-wrapper">
          <table className="cf-admin-table" aria-label="Users table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="cf-admin-user-row">
                  <td data-label="Name">
                    <span className="cf-admin-user-name">{u.name}</span>
                  </td>
                  <td data-label="Email">
                    <span className="cf-admin-user-email">{u.email}</span>
                  </td>
                  <td data-label="Role">
                    <select
                      className="cf-input cf-admin-role-select"
                      value={u.role}
                      onChange={(e) => handleRoleChange(u._id, e.target.value)}
                      aria-label={`Change role for ${u.name}`}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <RoleBadge role={u.role} />
                  </td>
                  <td data-label="Department">
                    <span className="cf-admin-user-dept">{u.department || <em className="cf-muted-text">—</em>}</span>
                  </td>
                  <td data-label="Actions">
                    <button
                      type="button"
                      className="cf-btn cf-btn--ghost-danger cf-btn--auto cf-admin-delete-btn"
                      onClick={() => setConfirmDelete({ userId: u._id, name: u.name })}
                      aria-label={`Delete ${u.name}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="cf-pagination" aria-label="User list pagination">
          <button
            className="cf-btn cf-btn--ghost cf-btn--auto"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </button>
          <span className="cf-pagination__info">
            Page {pagination.page} of {pagination.totalPages}
            &nbsp;({pagination.total} users)
          </span>
          <button
            className="cf-btn cf-btn--ghost cf-btn--auto"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="cf-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="del-title">
          <div className="cf-modal">
            <div className="cf-modal__head">
              <h2 className="cf-modal__title" id="del-title">Delete user</h2>
              <button type="button" className="cf-modal__close" onClick={() => setConfirmDelete(null)} aria-label="Close">×</button>
            </div>
            <p className="cf-confirm__text">
              Are you sure you want to delete <strong>{confirmDelete.name}</strong>?
              This action cannot be undone.
            </p>
            <div className="cf-form-actions" style={{ marginTop: 20 }}>
              <button type="button" className="cf-btn cf-btn--ghost cf-btn--auto" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" className="cf-btn cf-btn--danger cf-btn--auto" onClick={handleDeleteConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(newUser) => {
            setUsers((prev) => [newUser, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </main>
  );
}
