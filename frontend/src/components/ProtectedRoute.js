import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * ProtectedRoute — authentication guard.
 *
 * Two usage modes:
 *
 * 1. As a layout route wrapper (no children):
 *      <Route element={<ProtectedRoute />}>
 *        <Route path="/dashboard" element={<Dashboard />} />
 *      </Route>
 *    Renders <Outlet /> so nested routes are shown.
 *
 * 2. Wrapping a single element:
 *      <ProtectedRoute><MyPage /></ProtectedRoute>
 *    Renders children directly.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="cf-center">
        <div className="cf-spinner" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children ?? <Outlet />;
}
