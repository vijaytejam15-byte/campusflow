import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminStats } from "../../services/adminService";

// ── Metric card component ─────────────────────────────────────────────────────
function MetricCard({ icon, label, value, loading, accent, linkTo, linkLabel }) {
  return (
    <article className="cf-tile cf-admin-metric">
      <div className="cf-admin-metric__icon" style={{ color: accent }} aria-hidden="true">
        {icon}
      </div>
      <div className="cf-stat">
        <span
          className={`cf-stat__value${loading ? " cf-stat__value--loading" : ""}`}
          style={{ color: loading ? undefined : accent }}
        >
          {loading ? "—" : (value ?? 0)}
        </span>
        <span className="cf-stat__label">{label}</span>
      </div>
      {linkTo && (
        <Link to={linkTo} className="cf-tile__link" style={{ marginTop: 12 }}>
          {linkLabel || "View →"}
        </Link>
      )}
    </article>
  );
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await getAdminStats();
        if (!cancelled) setMetrics(data.metrics);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load stats.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Derive "active departments" from the usersByRole map
  // (departments aren't counted separately — use totalUsers as a proxy)
  // const deptCount = metrics ? Object.values(metrics.usersByRole || {}).reduce((a, b) => a + b, 0) : null;

  return (
    <main className="cf-main">
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin</p>
        <h1 className="cf-welcome__title">Admin Dashboard</h1>
        <p className="cf-welcome__sub">
          System-wide overview for CampusFlow.
        </p>
      </section>

      {error && (
        <div className="cf-alert cf-alert--error" role="alert">
          {error}
        </div>
      )}

      {/* ── Metric cards ── */}
      <div className="cf-admin-metrics-grid">
        <MetricCard
          icon="📋"
          label="Total requests"
          value={metrics?.totalRequests}
          loading={loading}
          accent="var(--cf-primary)"
          linkTo="/admin/requests"
          linkLabel="View all →"
        />
        <MetricCard
          icon="⏳"
          label="Pending approvals"
          value={metrics?.pendingRequests}
          loading={loading}
          accent="#d97706"
          linkTo="/faculty/pending-requests"
          linkLabel="Review queue →"
        />
        <MetricCard
          icon="✅"
          label="Approved"
          value={metrics?.approvedRequests}
          loading={loading}
          accent="var(--cf-success)"
        />
        <MetricCard
          icon="❌"
          label="Rejected"
          value={metrics?.rejectedRequests}
          loading={loading}
          accent="var(--cf-danger)"
        />
        <MetricCard
          icon="👥"
          label="Total users"
          value={metrics?.totalUsers}
          loading={loading}
          accent="var(--cf-primary)"
          linkTo="/admin/users"
          linkLabel="Manage users →"
        />
        <MetricCard
          icon="🏫"
          label="Departments"
          value={loading ? null : (metrics ? "—" : null)}
          loading={loading}
          accent="#7c3aed"
          linkTo="/admin/departments"
          linkLabel="Manage →"
        />
      </div>

      {/* ── Users by role breakdown ── */}
      {!loading && metrics?.usersByRole && (
        <section className="cf-tile" style={{ marginTop: 24 }}>
          <h2 className="cf-tile__title">Users by role</h2>
          <dl className="cf-details">
            {["student", "faculty", "hod", "admin"].map((r) => (
              <div key={r} className="cf-details__row">
                <dt style={{ textTransform: "capitalize" }}>{r}</dt>
                <dd>{metrics.usersByRole[r] ?? 0}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ── Quick links ── */}
      <section className="cf-tile" style={{ marginTop: 24 }}>
        <h2 className="cf-tile__title">Quick actions</h2>
        <div className="cf-admin-quick-links">
          <Link to="/admin/analytics"    className="cf-btn cf-btn--auto" style={{ textDecoration: "none" }}>Analytics</Link>
          <Link to="/admin/users"        className="cf-btn cf-btn--auto" style={{ textDecoration: "none" }}>Manage Users</Link>
          <Link to="/admin/departments"  className="cf-btn cf-btn--auto" style={{ textDecoration: "none" }}>Manage Departments</Link>
          <Link to="/admin/leave-types"  className="cf-btn cf-btn--auto" style={{ textDecoration: "none" }}>Leave Types</Link>
          <Link to="/admin/leave-reports"className="cf-btn cf-btn--auto" style={{ textDecoration: "none" }}>Leave Reports</Link>
          <Link to="/admin/audit-logs"   className="cf-btn cf-btn--ghost cf-btn--auto" style={{ textDecoration: "none" }}>Audit Logs</Link>
        </div>
      </section>
    </main>
  );
}
