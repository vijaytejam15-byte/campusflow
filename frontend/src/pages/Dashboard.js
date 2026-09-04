import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api }     from "../api";
import { getAdminStats } from "../services/adminService";

// ── Student dashboard ─────────────────────────────────────────────────────────
function StudentDashboard({ user }) {
  const [courseCount,    setCourseCount]    = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [leaveStats,     setLeaveStats]     = useState(null);
  const [error,          setError]          = useState("");

  useEffect(() => {
    let cancelled = false;
    api.getCourses()
      .then((data) => { if (!cancelled) setCourseCount(data.count ?? data.courses?.length ?? 0); })
      .catch((err) => { if (!cancelled) setError(err.message || "Could not load courses."); })
      .finally(() => { if (!cancelled) setLoadingCourses(false); });

    // Load leave summary
    import("../services/leaveService").then(({ getMyLeaves }) => {
      Promise.all([
        getMyLeaves({ status: "pending", limit: 1 }),
        getMyLeaves({ status: "approved", limit: 1 }),
        getMyLeaves({ limit: 1 }),
      ]).then(([pending, approved, all]) => {
        if (!cancelled) setLeaveStats({
          pending:  pending.pagination?.total  ?? 0,
          approved: approved.pagination?.total ?? 0,
          total:    all.pagination?.total      ?? 0,
        });
      }).catch(() => {});
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <section className="cf-welcome">
        <p className="cf-eyebrow">Dashboard</p>
        <h1 className="cf-welcome__title">Welcome back, {user?.name?.split(" ")[0]}.</h1>
        <p className="cf-welcome__sub">Track your requests, courses, and leaves.</p>
      </section>

      <section className="cf-grid">
        <article className="cf-tile">
          <h3 className="cf-tile__title">Your profile</h3>
          <dl className="cf-details">
            <div className="cf-details__row"><dt>Name</dt><dd>{user?.name}</dd></div>
            <div className="cf-details__row"><dt>Department</dt><dd>{user?.department || "Not set"}</dd></div>
            <div className="cf-details__row"><dt>Semester</dt><dd>{user?.semester || "Not set"}</dd></div>
          </dl>
          <Link to="/profile" className="cf-tile__link">Edit profile →</Link>
        </article>

        <article className="cf-tile">
          <h3 className="cf-tile__title">Courses</h3>
          {loadingCourses ? (
            <div className="cf-stat">
              <span className="cf-stat__value cf-stat__value--loading">—</span>
              <span className="cf-stat__label">Loading…</span>
            </div>
          ) : error ? (
            <p className="cf-tile__text cf-tile__text--error">{error}</p>
          ) : (
            <div className="cf-stat">
              <span className="cf-stat__value">{courseCount}</span>
              <span className="cf-stat__label">{courseCount === 1 ? "course enrolled" : "courses enrolled"}</span>
            </div>
          )}
          <Link to="/courses" className="cf-tile__link">Manage courses →</Link>
        </article>

        <article className="cf-tile">
          <h3 className="cf-tile__title">My requests</h3>
          <p className="cf-tile__text">Submit and track university requests — transcripts, grade appeals, leaves and more.</p>
          <Link to="/student/my-requests"    className="cf-tile__link">View my requests →</Link>
          <Link to="/student/create-request" className="cf-tile__link" style={{ display: "block", marginTop: 6 }}>+ New request →</Link>
        </article>

        <article className="cf-tile">
          <h3 className="cf-tile__title">Leave applications</h3>
          {leaveStats ? (
            <dl className="cf-details">
              <div className="cf-details__row">
                <dt>Total applications</dt>
                <dd>{leaveStats.total}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Pending review</dt>
                <dd style={{ color: "#d97706", fontWeight: 700 }}>{leaveStats.pending}</dd>
              </div>
              <div className="cf-details__row">
                <dt>Approved</dt>
                <dd style={{ color: "#16a34a", fontWeight: 700 }}>{leaveStats.approved}</dd>
              </div>
            </dl>
          ) : (
            <p className="cf-tile__text">Apply for sick, casual, or academic leave.</p>
          )}
          <Link to="/student/my-leaves"   className="cf-tile__link">View my leaves →</Link>
          <Link to="/student/apply-leave" className="cf-tile__link" style={{ display: "block", marginTop: 6 }}>+ Apply for leave →</Link>
        </article>
      </section>
    </>
  );
}

// ── Faculty / HOD dashboard ───────────────────────────────────────────────────
function ReviewerDashboard({ user }) {
  const isHod     = user?.role === "hod";
  const queuePath = isHod ? "/hod/requests" : "/faculty/pending-requests";

  return (
    <>
      <section className="cf-welcome">
        <p className="cf-eyebrow">{isHod ? "HOD" : "Faculty"}</p>
        <h1 className="cf-welcome__title">Welcome back, {user?.name?.split(" ")[0]}.</h1>
        <p className="cf-welcome__sub">Review and action student requests for your department.</p>
      </section>

      <section className="cf-grid">
        <article className="cf-tile">
          <h3 className="cf-tile__title">{isHod ? "HOD" : "Faculty"} review queue</h3>
          <p className="cf-tile__text">
            {isHod
              ? "Review pending, in-review and escalated requests from your department."
              : "Review pending and in-review requests submitted by students."}
          </p>
          <Link to={queuePath} className="cf-tile__link">Open review queue →</Link>
        </article>

        <article className="cf-tile">
          <h3 className="cf-tile__title">Leave review queue</h3>
          <p className="cf-tile__text">
            Review and action student leave applications assigned to your department.
          </p>
          <Link to="/staff/leave-queue" className="cf-tile__link">Open leave queue →</Link>
        </article>

        <article className="cf-tile">
          <h3 className="cf-tile__title">Your profile</h3>
          <dl className="cf-details">
            <div className="cf-details__row"><dt>Name</dt><dd>{user?.name}</dd></div>
            <div className="cf-details__row"><dt>Department</dt><dd>{user?.department || "Not set"}</dd></div>
            <div className="cf-details__row"><dt>Role</dt><dd style={{ textTransform: "capitalize" }}>{user?.role}</dd></div>
          </dl>
          <Link to="/profile" className="cf-tile__link">Edit profile →</Link>
        </article>
      </section>
    </>
  );
}

// ── Admin dashboard ───────────────────────────────────────────────────────────
function AdminOverviewDashboard({ user }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAdminStats()
      .then((d) => { if (!cancelled) setMetrics(d.metrics); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <section className="cf-welcome">
        <p className="cf-eyebrow">Admin</p>
        <h1 className="cf-welcome__title">Welcome back, {user?.name?.split(" ")[0]}.</h1>
        <p className="cf-welcome__sub">System-wide overview for CampusFlow.</p>
      </section>

      <section className="cf-grid">
        <article className="cf-tile">
          <h3 className="cf-tile__title">Requests</h3>
          <div className="cf-stat">
            <span className="cf-stat__value" style={{ color: "var(--cf-primary)" }}>
              {loading ? "—" : (metrics?.totalRequests ?? 0)}
            </span>
            <span className="cf-stat__label">total requests</span>
          </div>
          <Link to="/admin/requests" className="cf-tile__link">View all requests →</Link>
        </article>

        <article className="cf-tile">
          <h3 className="cf-tile__title">Users</h3>
          <div className="cf-stat">
            <span className="cf-stat__value" style={{ color: "#7c3aed" }}>
              {loading ? "—" : (metrics?.totalUsers ?? 0)}
            </span>
            <span className="cf-stat__label">registered users</span>
          </div>
          <Link to="/admin/users" className="cf-tile__link">Manage users →</Link>
        </article>

        <article className="cf-tile">
          <h3 className="cf-tile__title">Pending approvals</h3>
          <div className="cf-stat">
            <span className="cf-stat__value" style={{ color: "#d97706" }}>
              {loading ? "—" : (metrics?.pendingRequests ?? 0)}
            </span>
            <span className="cf-stat__label">awaiting review</span>
          </div>
          <Link to="/faculty/pending-requests" className="cf-tile__link">Review queue →</Link>
        </article>

        <article className="cf-tile">
          <h3 className="cf-tile__title">Quick links</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Link to="/admin"              className="cf-tile__link" style={{ display: "block" }}>Admin Dashboard →</Link>
            <Link to="/admin/departments"  className="cf-tile__link" style={{ display: "block" }}>Manage Departments →</Link>
            <Link to="/admin/leave-types"  className="cf-tile__link" style={{ display: "block" }}>Manage Leave Types →</Link>
            <Link to="/admin/leave-reports"className="cf-tile__link" style={{ display: "block" }}>Leave Reports →</Link>
            <Link to="/admin/audit-logs"   className="cf-tile__link" style={{ display: "block" }}>Audit Logs →</Link>
          </div>
        </article>
      </section>
    </>
  );
}

// ── Root component ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role ?? "student";

  return (
    <main className="cf-main">
      {role === "admin"
        ? <AdminOverviewDashboard user={user} />
        : (role === "faculty" || role === "hod")
        ? <ReviewerDashboard user={user} />
        : <StudentDashboard user={user} />}
    </main>
  );
}
