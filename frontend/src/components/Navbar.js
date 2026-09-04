import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen,   setMenuOpen]   = useState(false);

  const role = user?.role ?? "student";

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  const initials = (user?.name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const linkClass = ({ isActive }) =>
    "cf-navlink" + (isActive ? " cf-navlink--active" : "");

  const close = () => setMenuOpen(false);

  return (
    <header className="cf-topbar">
      {/* ── Left: brand + hamburger ── */}
      <div className="cf-topbar__left">
        <div className="cf-brand cf-brand--sm">
          <span className="cf-brand__mark" aria-hidden="true">CF</span>
          <span className="cf-brand__name">CampusFlow</span>
        </div>

        <button
          type="button"
          className="cf-navtoggle"
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* ── Main nav ── */}
      <nav
        className={"cf-nav" + (menuOpen ? " cf-nav--open" : "")}
        aria-label="Primary"
      >
        {/* Common links */}
        <NavLink to="/dashboard" className={linkClass} onClick={close}>Dashboard</NavLink>
        <NavLink to="/profile"   className={linkClass} onClick={close}>Profile</NavLink>
        <NavLink to="/courses"   className={linkClass} onClick={close}>Courses</NavLink>

        {/* Student links */}
        {role === "student" && (
          <>
            <NavLink to="/student/create-request" className={linkClass} onClick={close}>New Request</NavLink>
            <NavLink to="/student/my-requests"    className={linkClass} onClick={close}>My Requests</NavLink>
            <NavLink to="/student/apply-leave"    className={linkClass} onClick={close}>Apply Leave</NavLink>
            <NavLink to="/student/my-leaves"      className={linkClass} onClick={close}>My Leaves</NavLink>
          </>
        )}

        {/* Faculty / HOD links */}
        {(role === "faculty" || role === "hod") && (
          <>
            <NavLink
              to={role === "hod" ? "/hod/requests" : "/faculty/pending-requests"}
              className={linkClass}
              onClick={close}
            >
              Pending Requests
            </NavLink>
            <NavLink to="/staff/leave-queue" className={linkClass} onClick={close}>
              Leave Queue
            </NavLink>
          </>
        )}

        {/* Admin links */}
        {role === "admin" && (
          <>
            <NavLink to="/admin"                className={linkClass} onClick={close}>Admin</NavLink>
            <NavLink to="/admin/analytics"      className={linkClass} onClick={close}>Analytics</NavLink>
            <NavLink to="/admin/users"          className={linkClass} onClick={close}>Users</NavLink>
            <NavLink to="/admin/departments"    className={linkClass} onClick={close}>Departments</NavLink>
            <NavLink to="/admin/leave-types"    className={linkClass} onClick={close}>Leave Types</NavLink>
            <NavLink to="/admin/leave-reports"  className={linkClass} onClick={close}>Leave Reports</NavLink>
            <NavLink to="/admin/audit-logs"     className={linkClass} onClick={close}>Audit Logs</NavLink>
          </>
        )}

        <div className="cf-nav__divider" aria-hidden="true" />

        {/* Right slot: notification bell + user chip + logout */}
        <div className="cf-topbar__right">
          <NotificationBell />

          <div className="cf-user">
            <span className="cf-avatar" aria-hidden="true">{initials}</span>
            <span className="cf-user__name">{user?.name}</span>
            {role !== "student" && (
              <span className="cf-nav__role-badge">{role}</span>
            )}
          </div>
        </div>

        <button
          className="cf-btn cf-btn--ghost cf-nav__logout"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </nav>
    </header>
  );
}
