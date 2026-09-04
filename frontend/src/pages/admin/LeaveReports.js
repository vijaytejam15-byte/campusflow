import React, { useEffect, useState } from "react";
import { getAllLeaves, getLeaveStats } from "../../services/leaveService";

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const STATUS_STYLE = {
  pending:   { bg: "#fef9c3", color: "#854d0e" },
  approved:  { bg: "#f0fdf4", color: "#15803d" },
  rejected:  { bg: "#fef2f2", color: "#b91c1c" },
  cancelled: { bg: "#f8fafc", color: "#475569" },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "999px",
      fontSize: "11px", fontWeight: 700, background: s.bg, color: s.color,
    }}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}

// Simple bar chart (reuse existing cf-chart-* classes)
function BarChart({ data, colorFn }) {
  if (!data?.length) return <p className="cf-muted-text">No data</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="cf-chart-bars">
      {data.map((d, i) => (
        <div key={i} className="cf-chart-bar-row">
          <span className="cf-chart-bar-label" title={d.label}>{d.label}</span>
          <div className="cf-chart-bar-track">
            <div className="cf-chart-bar-fill" style={{
              width: `${Math.round((d.value / max) * 100)}%`,
              background: colorFn ? colorFn(d, i) : "var(--cf-primary)",
            }} />
          </div>
          <span className="cf-chart-bar-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function LeaveReports() {
  const [stats,    setStats]    = useState(null);
  const [leaves,   setLeaves]   = useState([]);
  const [pagination,setPagination] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [listLoading,  setListLoading]  = useState(true);
  const [error,    setError]    = useState("");

  const [statusFilter, setStatusFilter]  = useState("");
  const [page,         setPage]          = useState(1);

  // Load stats once
  useEffect(() => {
    setStatsLoading(true);
    getLeaveStats()
      .then((d) => setStats(d.stats))
      .catch((err) => setError(err.message || "Could not load stats."))
      .finally(() => setStatsLoading(false));
  }, []);

  // Load list when filters change
  useEffect(() => {
    setListLoading(true);
    getAllLeaves({ status: statusFilter, page, limit: 20 })
      .then((d) => { setLeaves(d.leaves || []); setPagination(d.pagination || null); })
      .catch((err) => setError(err.message || "Could not load applications."))
      .finally(() => setListLoading(false));
  }, [statusFilter, page]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  const s = stats || {};

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin · Leave</p>
        <h1 className="cf-welcome__title">Leave Reports</h1>
        <p className="cf-welcome__sub">System-wide leave statistics and all applications.</p>
      </section>

      {error && <div className="cf-alert cf-alert--error">{error}</div>}

      {/* KPI row */}
      {!statsLoading && (
        <div className="cf-analytics-kpi-row" style={{ marginBottom: 22 }}>
          {[
            { icon: "📋", label: "Total", value: s.totalLeaves ?? 0, color: "var(--cf-primary)" },
            { icon: "⏳", label: "Pending",  value: s.byStatus?.pending  ?? 0, color: "#d97706" },
            { icon: "✅", label: "Approved", value: s.byStatus?.approved ?? 0, color: "#16a34a" },
            { icon: "❌", label: "Rejected", value: s.byStatus?.rejected ?? 0, color: "#dc2626" },
            { icon: "🚫", label: "Cancelled",value: s.byStatus?.cancelled ?? 0, color: "#475569" },
          ].map((k) => (
            <article key={k.label} className="cf-tile cf-analytics-kpi">
              <span className="cf-analytics-kpi__icon">{k.icon}</span>
              <span className="cf-analytics-kpi__value" style={{ color: k.color }}>{k.value}</span>
              <span className="cf-analytics-kpi__label">{k.label} leaves</span>
            </article>
          ))}
        </div>
      )}

      {/* Charts */}
      {!statsLoading && stats && (
        <div className="cf-analytics-charts-row" style={{ marginBottom: 22 }}>
          <section className="cf-tile cf-analytics-chart-tile">
            <h2 className="cf-tile__title">By leave type</h2>
            <BarChart
              data={(s.byLeaveType || []).map((t) => ({ label: t.name, value: t.count }))}
              colorFn={(_, i) => `hsl(${220 + i * 25}, 65%, 55%)`}
            />
          </section>
          <section className="cf-tile cf-analytics-chart-tile">
            <h2 className="cf-tile__title">By department</h2>
            <BarChart
              data={(s.byDepartment || []).map((d) => ({ label: d.department || "Unknown", value: d.count }))}
              colorFn={(_, i) => `hsl(${150 + i * 20}, 60%, 50%)`}
            />
          </section>
        </div>
      )}

      {/* All applications table */}
      <section className="cf-tile" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 12px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <h2 className="cf-tile__title" style={{ margin: 0 }}>All Applications</h2>
          <select
            className="cf-input cf-admin-role-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: "auto" }}
          >
            <option value="">All statuses</option>
            {["pending","approved","rejected","cancelled"].map((s) => (
              <option key={s} value={s} style={{ textTransform: "capitalize" }}>{s}</option>
            ))}
          </select>
        </div>

        {listLoading ? (
          <div className="cf-center cf-center--inline"><div className="cf-spinner" /></div>
        ) : leaves.length === 0 ? (
          <div className="cf-empty" style={{ borderRadius: 0, border: "none", borderTop: "1px solid var(--cf-line)" }}>
            <p className="cf-empty__title">No applications found</p>
          </div>
        ) : (
          <div className="cf-admin-table-wrapper" style={{ borderRadius: 0, border: "none", borderTop: "1px solid var(--cf-line)" }}>
            <table className="cf-admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Department</th>
                  <th>Leave Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((l, i) => {
                  const stu = l.student || {};
                  return (
                    <tr key={l._id || i} className="cf-admin-user-row">
                      <td data-label="Student">
                        <span className="cf-admin-user-name">{stu.name || "—"}</span>
                      </td>
                      <td data-label="Department">{stu.department || <em className="cf-muted-text">—</em>}</td>
                      <td data-label="Leave Type">{l.leaveTypeName || "—"}</td>
                      <td data-label="From">{fmtDate(l.startDate)}</td>
                      <td data-label="To">{fmtDate(l.endDate)}</td>
                      <td data-label="Days"><span className="cf-leave-day-count">{l.totalDays}</span></td>
                      <td data-label="Status"><StatusPill status={l.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="cf-pagination" style={{ paddingBottom: 16 }}>
            <button className="cf-btn cf-btn--ghost cf-btn--auto"
              disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span className="cf-pagination__info">Page {pagination.page} of {pagination.totalPages}</span>
            <button className="cf-btn cf-btn--ghost cf-btn--auto"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        )}
      </section>
    </main>
  );
}
