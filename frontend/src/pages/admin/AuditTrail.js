/**
 * AuditTrail — Feature 7: Unified audit log for admins.
 * Route: /admin/audit-trail
 */
import React, { useEffect, useState, useCallback } from "react";
import { api } from "../../api";

const KIND_ICONS = {
  request: "📋", leave: "🗓️", workflow_instance: "⚙️",
  workflow_template: "📐", user: "👤", department: "🏢",
  leave_type: "📑", system: "🖥️",
};

function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(d).toLocaleDateString();
}

export default function AuditTrail() {
  const [logs,       setLogs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);
  const [filters,    setFilters]    = useState({ action: "", entityKind: "", from: "", to: "" });
  const [expanded,   setExpanded]   = useState(null);
  const LIMIT = 30;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams({ page, limit: LIMIT });
      if (filters.action)     p.set("action",     filters.action);
      if (filters.entityKind) p.set("entityKind", filters.entityKind);
      if (filters.from)       p.set("from",       filters.from);
      if (filters.to)         p.set("to",         filters.to);
      const data = await api._request(`/api/admin/audit-trail?${p}`, { method: "GET" });
      setLogs(data.logs || []);
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) { setError(err.message || "Failed to load audit trail."); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filters]);

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  function exportCSV() {
    const rows = [["Time","Actor","Role","Action","Entity Kind","Entity ID","IP"]];
    logs.forEach((l) => rows.push([
      new Date(l.createdAt).toISOString(),
      l.actorId?.name || l.actorName || "System",
      l.actorRole || "",
      l.action,
      l.entityKind || "",
      l.entityId || "",
      l.ip || "",
    ]));
    const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `audit-trail-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin</p>
        <h1 className="cf-welcome__title">Audit Trail</h1>
        <p className="cf-welcome__sub">Complete history of all system mutations — {total} entries.</p>
      </section>

      {error && <div className="cf-alert cf-alert--error" role="alert">{error}</div>}

      {/* Filters */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:16, alignItems:"flex-end" }}>
        <label className="cf-field" style={{ margin:0, flex:"1 1 160px" }}>
          <span className="cf-label" style={{ fontSize:12 }}>Action contains</span>
          <input className="cf-input" style={{ fontSize:13 }} placeholder="e.g. workflow.approve"
            value={filters.action} onChange={(e) => setFilter("action", e.target.value)} />
        </label>
        <label className="cf-field" style={{ margin:0, flex:"0 0 160px" }}>
          <span className="cf-label" style={{ fontSize:12 }}>Entity kind</span>
          <select className="cf-input cf-select" style={{ fontSize:13 }} value={filters.entityKind}
            onChange={(e) => setFilter("entityKind", e.target.value)}>
            <option value="">All</option>
            {["request","leave","workflow_instance","workflow_template","user","department","leave_type","system"].map((k) => (
              <option key={k} value={k}>{k.replace(/_/g," ")}</option>
            ))}
          </select>
        </label>
        <label className="cf-field" style={{ margin:0, flex:"0 0 150px" }}>
          <span className="cf-label" style={{ fontSize:12 }}>From</span>
          <input type="date" className="cf-input" style={{ fontSize:13 }} value={filters.from}
            onChange={(e) => setFilter("from", e.target.value)} />
        </label>
        <label className="cf-field" style={{ margin:0, flex:"0 0 150px" }}>
          <span className="cf-label" style={{ fontSize:12 }}>To</span>
          <input type="date" className="cf-input" style={{ fontSize:13 }} value={filters.to}
            onChange={(e) => setFilter("to", e.target.value)} />
        </label>
        <button className="cf-btn cf-btn--ghost" style={{ fontSize:13, alignSelf:"flex-end" }} onClick={exportCSV}>
          ↓ Export CSV
        </button>
        <button className="cf-btn cf-btn--ghost" style={{ fontSize:13, alignSelf:"flex-end" }}
          onClick={() => setFilters({ action:"", entityKind:"", from:"", to:"" })}>
          Clear
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="cf-center cf-center--inline"><div className="cf-spinner" /></div>
      ) : logs.length === 0 ? (
        <div className="cf-empty"><p className="cf-empty__title">No audit entries</p></div>
      ) : (
        <div className="cf-admin-table-wrapper">
          <table className="cf-admin-table" aria-label="Audit trail">
            <thead>
              <tr>
                <th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <React.Fragment key={log._id || i}>
                  <tr style={{ cursor:"pointer" }} onClick={() => setExpanded(expanded === i ? null : i)}>
                    <td data-label="Time" style={{ whiteSpace:"nowrap", fontSize:12 }}>
                      <span title={new Date(log.createdAt).toLocaleString()}>{timeAgo(log.createdAt)}</span>
                    </td>
                    <td data-label="Actor" style={{ fontSize:13 }}>
                      <div>{log.actorId?.name || log.actorName || <em className="cf-muted-text">System</em>}</div>
                      {log.actorRole && <div style={{ fontSize:11, color:"#6b7280" }}>{log.actorRole}</div>}
                    </td>
                    <td data-label="Action" style={{ fontSize:13 }}>
                      <code style={{ fontSize:12, background:"#f1f5f9", padding:"2px 5px", borderRadius:3 }}>
                        {log.action}
                      </code>
                    </td>
                    <td data-label="Entity" style={{ fontSize:12 }}>
                      {log.entityKind && <span>{KIND_ICONS[log.entityKind] || "📄"} {log.entityKind.replace(/_/g," ")}</span>}
                      {log.entityRef && <div style={{ color:"#6b7280" }}>{log.entityRef}</div>}
                    </td>
                    <td data-label="Details" style={{ fontSize:12, color:"#4f46e5" }}>
                      {expanded === i ? "▾ Hide" : "▸ Show"}
                    </td>
                  </tr>
                  {expanded === i && (
                    <tr>
                      <td colSpan={5} style={{ background:"#f8fafc", padding:"8px 16px" }}>
                        <div style={{ display:"flex", gap:24, flexWrap:"wrap", fontSize:12 }}>
                          {log.ip && <div><strong>IP:</strong> {log.ip}</div>}
                          {log.entityId && <div><strong>Entity ID:</strong> <code style={{ fontSize:11 }}>{log.entityId}</code></div>}
                          {log.before && (
                            <div><strong>Before:</strong> <code style={{ fontSize:11 }}>{JSON.stringify(log.before)}</code></div>
                          )}
                          {log.after && (
                            <div><strong>After:</strong> <code style={{ fontSize:11 }}>{JSON.stringify(log.after)}</code></div>
                          )}
                          {log.meta && (
                            <div><strong>Meta:</strong> <code style={{ fontSize:11 }}>{JSON.stringify(log.meta)}</code></div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="cf-pagination" style={{ marginTop:16 }}>
          <button className="cf-btn cf-btn--ghost cf-btn--auto" disabled={page<=1} onClick={() => setPage((p)=>p-1)}>← Prev</button>
          <span className="cf-pagination__info">Page {page} / {totalPages} ({total} entries)</span>
          <button className="cf-btn cf-btn--ghost cf-btn--auto" disabled={page>=totalPages} onClick={() => setPage((p)=>p+1)}>Next →</button>
        </div>
      )}
    </main>
  );
}
