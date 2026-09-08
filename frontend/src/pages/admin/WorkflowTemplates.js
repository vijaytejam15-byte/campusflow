/**
 * WorkflowTemplates — Admin page: list, activate/deactivate, delete templates.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getWorkflowTemplates,
  activateWorkflowTemplate,
  deactivateWorkflowTemplate,
  deleteWorkflowTemplate,
} from "../../services/workflowService";

const KIND_LABEL = { request: "Request", leave: "Leave" };

export default function WorkflowTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [msg,       setMsg]       = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await getWorkflowTemplates();
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err.message || "Could not load templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(id, isActive) {
    try {
      if (isActive) {
        await deactivateWorkflowTemplate(id);
        setMsg("Template deactivated.");
      } else {
        await activateWorkflowTemplate(id);
        setMsg("Template activated.");
      }
      await load();
    } catch (err) {
      setError(err.message || "Failed to update template.");
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    try {
      await deleteWorkflowTemplate(id);
      setMsg("Template deleted.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to delete template.");
    }
  }

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin</p>
        <h1 className="cf-welcome__title">Workflow Templates</h1>
        <p className="cf-welcome__sub">
          Create and manage configurable multi-stage approval workflows.
        </p>
      </section>

      {msg   && <div className="cf-alert cf-alert--success" role="status">{msg}<button className="cf-alert__dismiss" onClick={() => setMsg("")}>×</button></div>}
      {error && <div className="cf-alert cf-alert--error"   role="alert">{error}<button className="cf-alert__dismiss" onClick={() => setError("")}>×</button></div>}

      <div className="cf-toolbar" style={{ marginBottom: 16 }}>
        <Link to="/admin/workflow-templates/new" className="cf-btn cf-btn--auto">
          + New Template
        </Link>
      </div>

      {loading && (
        <div className="cf-center"><div className="cf-spinner" aria-label="Loading" /></div>
      )}

      {!loading && templates.length === 0 && (
        <div className="cf-empty">
          <p className="cf-empty__title">No workflow templates yet</p>
          <p className="cf-empty__text">
            Create a template to enable multi-stage approvals for request types.
          </p>
          <Link to="/admin/workflow-templates/new" className="cf-btn cf-btn--auto">
            Create your first template
          </Link>
        </div>
      )}

      {!loading && templates.length > 0 && (
        <div className="cf-table-wrapper">
          <table className="cf-table" aria-label="Workflow templates">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Applies to</th>
                <th>Stages</th>
                <th>Version</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t._id}>
                  <td>
                    <Link to={`/admin/workflow-templates/${t._id}`} style={{ fontWeight: 600 }}>
                      {t.name}
                    </Link>
                    {t.description && (
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{t.description}</div>
                    )}
                  </td>
                  <td>{KIND_LABEL[t.entityKind] || t.entityKind}</td>
                  <td>
                    {t.appliesToTypes && t.appliesToTypes.length > 0
                      ? t.appliesToTypes.map((x) => (
                          <span key={x} className="cf-tag" style={{ marginRight: 4 }}>
                            {x.replace(/_/g, " ")}
                          </span>
                        ))
                      : <span style={{ color: "#9ca3af" }}>Manual only</span>
                    }
                  </td>
                  <td>{t.stages ? t.stages.length : 0}</td>
                  <td>v{t.version || 1}</td>
                  <td>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      background: t.isActive ? "#dcfce7" : "#f3f4f6",
                      color: t.isActive ? "#16a34a" : "#6b7280",
                    }}>
                      {t.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        to={`/admin/workflow-templates/${t._id}`}
                        className="cf-btn cf-btn--ghost"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => handleToggle(t._id, t.isActive)}
                      >
                        {t.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost"
                        style={{ fontSize: 12, padding: "4px 10px", color: "var(--cf-danger)" }}
                        onClick={() => handleDelete(t._id, t.name)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
