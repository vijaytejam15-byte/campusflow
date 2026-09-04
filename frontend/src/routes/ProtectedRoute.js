import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * ProtectedRoute — guards any route that requires an active session.
 *
 * Works in two modes depending on how it is used in the route tree:
 *
 *   Layout wrapper (renders nested routes via <Outlet>):
 *     <Route element={<ProtectedRoute />}>
 *       <Route path="/dashboard" element={<Dashboard />} />
 *     </Route>
 *
 *   Direct wrapper (renders explicit children):
 *     <Route element={<ProtectedRoute><SomePage /></ProtectedRoute>} />
 *
 * Redirect behaviour
 * ──────────────────
 * • Passes { from: location } in redirect state so Login can send the user
 *   back to their intended page after a successful sign-in.
 * • Does NOT set sessionExpired here — that flag is set exclusively by the
 *   central 401 handler in api.js via navigateRef (?sessionExpired=true),
 *   keeping the two cases (unauthenticated visit vs. expired session) distinct.
 *
 * Loading
 * ───────
 * • Shows a spinner while the initial GET /api/me check is in flight so a
 *   page refresh never wrongly boots a user who still has a valid cookie.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="cf-center">
        <div className="cf-spinner" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  // If children were passed render them; otherwise render nested route <Outlet>.
  return children ?? <Outlet />;
}
