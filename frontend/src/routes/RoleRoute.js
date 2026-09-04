import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * RoleRoute — role-based access control guard.
 *
 * Sits inside a <ProtectedRoute> (authentication is already guaranteed).
 * Checks whether the authenticated user's role is in the allowedRoles list.
 *
 * Props
 * ─────
 * allowedRoles  {string[]}  Roles permitted to access the wrapped routes.
 *                           e.g. ["admin", "instructor"]
 *
 * Usage
 * ─────
 *   <Route element={<ProtectedRoute />}>
 *     <Route element={<RoleRoute allowedRoles={["admin"]} />}>
 *       <Route path="/admin" element={<AdminDashboard />} />
 *     </Route>
 *   </Route>
 *
 * Role resolution
 * ───────────────
 * • user.role is the source of truth (populated from the server via /api/me).
 * • If user has no role yet (undefined / null) it is treated as the
 *   default "student" role, consistent with the User model default.
 * • Unauthorised users are redirected to their own default dashboard rather
 *   than /login (they ARE authenticated — just not authorised for this path).
 *
 * Default dashboards by role
 * ──────────────────────────
 * Role not in allowedRoles → /dashboard  (student home, safe fallback)
 * You can extend ROLE_HOME below as new roles are added.
 */

const ROLE_HOME = {
  student: "/dashboard",
  faculty: "/faculty/pending-requests",
  hod:     "/hod/requests",
  admin:   "/admin",
};

const DEFAULT_HOME = "/dashboard";

function roleHome(role) {
  return ROLE_HOME[role] ?? DEFAULT_HOME;
}

export default function RoleRoute({ allowedRoles = [] }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Still waiting for the session check — show a spinner rather than
  // flashing an incorrect redirect.
  if (loading) {
    return (
      <div className="cf-center">
        <div className="cf-spinner" aria-label="Loading" />
      </div>
    );
  }

  // Should not happen when nested inside ProtectedRoute, but guard anyway.
  if (!isAuthenticated) {
    return (
      <Navigate to="/login" replace state={{ from: location }} />
    );
  }

  // Normalise: default to "student" when no role is set yet.
  const userRole = user?.role ?? "student";

  if (!allowedRoles.includes(userRole)) {
    // User is authenticated but not authorised for this section.
    // Redirect to their own home — not /login, not a 403 page.
    return <Navigate to={roleHome(userRole)} replace />;
  }
  return <Outlet />;
}
