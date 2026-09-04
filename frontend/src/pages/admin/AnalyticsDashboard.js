import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAnalytics } from "../../services/adminService";

// ── Pure CSS/SVG chart primitives (no external chart library) ─────────────────

/** Horizontal bar chart */
function BarChart({ data, colorFn, maxLabel }) {
  if (!data || data.length === 0) return <p className="cf-muted-text">No data</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="cf-chart-bars">
      {data.map((d, i) => (
        <div key={i} className="cf-chart-bar-row">
          <span className="cf-chart-bar-label" title={d.label}>{d.label}</span>
          <div className="cf-chart-bar-track">
            <div
              className="cf-chart-bar-fill"
              style={{
                width:      `${Math.round((d.value / max) * 100)}%`,
                background: colorFn ? colorFn(d, i) : "var(--cf-primary)",
              }}
            />
          </div>
          <span className="cf-chart-bar-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

/** SVG line chart for monthly trends */
function LineChart({ data }) {
  if (!data || data.length === 0) return <p className="cf-muted-text">No data yet</p>;

  const W = 480, H = 140, PAD = 32;
  const maxVal = Math.max(...data.map((d) => d.total), 1);

  const xStep = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : W - PAD * 2;
  const yScale = (v) => PAD + ((maxVal - v) / maxVal) * (H - PAD * 2);
  const xScale = (i) => PAD + i * xStep;

  const totalPath   = data.map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(d.total)}`).join(" ");
  const approvePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(d.approved)}`).join(" ");

  return (
    <div className="cf-linechart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="cf-linechart" role="img" aria-label="Monthly request trend">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={PAD} y1={PAD + t * (H - PAD * 2)}
            x2={W - PAD} y2={PAD + t * (H - PAD * 2)}
            stroke="#e2e8f0" strokeWidth="1"
          />
        ))}
        {/* Total line */}
        <path d={totalPath} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" />
        {/* Approved line */}
        <path d={approvePath} fill="none" stroke="#16a34a" strokeWidth="2" strokeDasharray="5,3" strokeLinejoin="round" />
        {/* Data points */}
        {data.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.total)} r="4" fill="#4f46e5" />
        ))}
      </svg>
      <div className="cf-linechart-labels">
        {data.map((d, i) => (
          <span key={i} className="cf-linechart-label">{d.label}</span>
        ))}
      </div>
      <div className="cf-linechart-legend">
        <span className="cf-linechart-legend-item" style={{ color: "#4f46e5" }}>— Total</span>
        <span className="cf-linechart-legend-item" style={{ color: "#16a34a" }}>- - Approved</span>
      </div>
    </div>
  );
}

/** SVG donut chart */
function DonutChart({ segments, size = 120 }) {
  if (!segments || segments.length === 0) return null;
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <p className="cf-muted-text">No data</p>;

  const r = 44, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct  = seg.value / total;
    const dash = pct * circumference;
    const arc  = { ...seg, dasharray: `${dash} ${circumference - dash}`, dashoffset: -offset * circumference };
    offset += pct;
    return arc;
  });

  return (
    <div className="cf-donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Status donut chart">
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth="18"
            strokeDasharray={arc.dasharray}
            strokeDashoffset={arc.dashoffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">
          {total}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize="8" fill="#64748b">total</text>
      </svg>
      <div className="cf-donut-legend">
        {segments.map((s, i) => (
          <div key={i} className="cf-donut-legend-item">
            <span className="cf-donut-legend-dot" style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className="cf-donut-legend-val">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Status colours ─────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  pending:   "#d97706",
  in_review: "#1d4ed8",
  approved:  "#16a34a",
  rejected:  "#dc2626",
  escalated: "#b45309",
  closed:    "#475569",
};

const TYPE_LABEL = {
  transcript:              "Transcript",
  enrollment_verification: "Enrollment",
  leave_of_absence:        "Leave",
  grade_appeal:            "Grade Appeal",
  financial_aid:           "Financial Aid",
  course_withdrawal:       "Withdrawal",
  general:                 "General",
};

// ── Main analytics page ───────────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await getAnalytics();
        if (!cancelled) setAnalytics(data.analytics);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load analytics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <main className="cf-main">
        <section className="cf-welcome">
          <p className="cf-eyebrow">Admin</p>
          <h1 className="cf-welcome__title">Analytics</h1>
        </section>
        <div className="cf-center cf-center--inline"><div className="cf-spinner" /></div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="cf-main">
        <section className="cf-welcome">
          <p className="cf-eyebrow">Admin</p>
          <h1 className="cf-welcome__title">Analytics</h1>
        </section>
        <div className="cf-alert cf-alert--error" role="alert">{error}</div>
      </main>
    );
  }

  const a = analytics || {};

  // Shape donut segments
  const statusSegments = Object.entries(a.byStatus || {}).map(([k, v]) => ({
    label: k.replace("_", " "),
    value: v,
    color: STATUS_COLOR[k] || "#94a3b8",
  }));

  // Bar chart for departments
  const deptBars = (a.byDepartment || []).map((d) => ({
    label: d.department || "Unknown",
    value: d.count,
  }));

  // Bar chart for request types
  const typeBars = (a.byType || []).map((t) => ({
    label: TYPE_LABEL[t.type] || t.type,
    value: t.count,
  }));

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin</p>
        <h1 className="cf-welcome__title">Analytics Dashboard</h1>
        <p className="cf-welcome__sub">
          System-wide trends, SLA performance, and request breakdown.
        </p>
      </section>

      {/* ── KPI row ── */}
      <div className="cf-analytics-kpi-row">
        <article className="cf-tile cf-analytics-kpi">
          <span className="cf-analytics-kpi__icon">📋</span>
          <span className="cf-analytics-kpi__value">{a.totalRequests ?? 0}</span>
          <span className="cf-analytics-kpi__label">Total requests</span>
        </article>

        <article className="cf-tile cf-analytics-kpi">
          <span className="cf-analytics-kpi__icon">✅</span>
          <span className="cf-analytics-kpi__value" style={{ color: "#16a34a" }}>
            {a.approvalRate != null ? `${a.approvalRate}%` : "—"}
          </span>
          <span className="cf-analytics-kpi__label">Approval rate</span>
        </article>

        <article className="cf-tile cf-analytics-kpi">
          <span className="cf-analytics-kpi__icon">❌</span>
          <span className="cf-analytics-kpi__value" style={{ color: "#dc2626" }}>
            {a.rejectionRate != null ? `${a.rejectionRate}%` : "—"}
          </span>
          <span className="cf-analytics-kpi__label">Rejection rate</span>
        </article>

        <article className="cf-tile cf-analytics-kpi">
          <span className="cf-analytics-kpi__icon">⏱️</span>
          <span className="cf-analytics-kpi__value" style={{ color: "#7c3aed" }}>
            {a.avgProcessingHours != null ? `${a.avgProcessingHours}h` : "—"}
          </span>
          <span className="cf-analytics-kpi__label">Avg processing time</span>
        </article>

        <article className="cf-tile cf-analytics-kpi">
          <span className="cf-analytics-kpi__icon">🔴</span>
          <span className="cf-analytics-kpi__value" style={{ color: "#dc2626" }}>
            {a.sla?.breachedTotal ?? 0}
          </span>
          <span className="cf-analytics-kpi__label">SLA breaches</span>
        </article>

        <article className="cf-tile cf-analytics-kpi">
          <span className="cf-analytics-kpi__icon">⚡</span>
          <span className="cf-analytics-kpi__value" style={{ color: "#b45309" }}>
            {a.sla?.autoEscalated ?? 0}
          </span>
          <span className="cf-analytics-kpi__label">Auto-escalated</span>
        </article>
      </div>

      {/* ── Charts row ── */}
      <div className="cf-analytics-charts-row">

        {/* Status donut */}
        <section className="cf-tile cf-analytics-chart-tile">
          <h2 className="cf-tile__title">Requests by status</h2>
          <DonutChart segments={statusSegments} size={140} />
        </section>

        {/* Monthly trend */}
        <section className="cf-tile cf-analytics-chart-tile cf-analytics-chart-tile--wide">
          <h2 className="cf-tile__title">Monthly trend (last 6 months)</h2>
          <LineChart data={a.monthlyTrend || []} />
        </section>

      </div>

      {/* ── Department + Type row ── */}
      <div className="cf-analytics-charts-row">

        <section className="cf-tile cf-analytics-chart-tile">
          <h2 className="cf-tile__title">Top departments</h2>
          <BarChart
            data={deptBars}
            colorFn={(_, i) => `hsl(${220 + i * 18}, 70%, 55%)`}
          />
          {deptBars.length === 0 && (
            <p className="cf-tile__text">No department data yet.</p>
          )}
        </section>

        <section className="cf-tile cf-analytics-chart-tile">
          <h2 className="cf-tile__title">Requests by type</h2>
          <BarChart
            data={typeBars}
            colorFn={(_, i) => `hsl(${260 + i * 15}, 60%, 55%)`}
          />
        </section>

      </div>

      {/* ── SLA details ── */}
      <section className="cf-tile" style={{ marginTop: 0 }}>
        <h2 className="cf-tile__title">SLA performance</h2>
        <dl className="cf-details">
          <div className="cf-details__row">
            <dt>Total SLA breaches</dt>
            <dd style={{ color: a.sla?.breachedTotal > 0 ? "#dc2626" : "#16a34a" }}>
              {a.sla?.breachedTotal ?? 0}
            </dd>
          </div>
          <div className="cf-details__row">
            <dt>Breached — now resolved</dt>
            <dd>{a.sla?.breachedResolved ?? 0}</dd>
          </div>
          <div className="cf-details__row">
            <dt>Active requests within SLA</dt>
            <dd style={{ color: "#16a34a" }}>{a.sla?.onTimeActive ?? 0}</dd>
          </div>
          <div className="cf-details__row">
            <dt>Auto-escalated by system</dt>
            <dd>{a.sla?.autoEscalated ?? 0}</dd>
          </div>
        </dl>
      </section>

      {/* Quick link */}
      <div style={{ marginTop: 20 }}>
        <Link to="/admin" className="cf-details-back">← Back to Admin Dashboard</Link>
      </div>
    </main>
  );
}
