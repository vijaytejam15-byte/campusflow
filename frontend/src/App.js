import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute     from "./components/ProtectedRoute";
import RoleRoute          from "./routes/RoleRoute";
import AppLayout          from "./components/AppLayout";

// ── Auth pages ────────────────────────────────────────────────────────────────
import Login    from "./pages/Login";
import Register from "./pages/Register";

// ── Common pages ──────────────────────────────────────────────────────────────
import Dashboard from "./pages/Dashboard";
import Profile   from "./pages/Profile";
import Courses   from "./pages/Courses";
import NotFound  from "./pages/NotFound";

// ── Student pages ─────────────────────────────────────────────────────────────
import CreateRequest  from "./pages/student/CreateRequest";
import MyRequests     from "./pages/student/MyRequests";
import RequestDetails from "./pages/student/RequestDetails";
import ApplyLeave     from "./pages/student/ApplyLeave";
import MyLeaves       from "./pages/student/MyLeaves";
import LeaveDetails   from "./pages/student/LeaveDetails";

// ── Faculty / HOD pages ───────────────────────────────────────────────────────
import PendingRequests from "./pages/faculty/PendingRequests";
import StaffLeaveQueue from "./pages/faculty/StaffLeaveQueue";

// ── Admin pages ───────────────────────────────────────────────────────────────
import AdminDashboard      from "./pages/admin/AdminDashboard";
import ManageUsers         from "./pages/admin/ManageUsers";
import ManageDepartments   from "./pages/admin/ManageDepartments";
import AuditLogs           from "./pages/admin/AuditLogs";
import AdminRequests       from "./pages/admin/AdminRequests";
import AnalyticsDashboard  from "./pages/admin/AnalyticsDashboard";
import ManageLeaveTypes    from "./pages/admin/ManageLeaveTypes";
import LeaveReports        from "./pages/admin/LeaveReports";

import "./App.css";

// ── Wires React Router's navigate into the AuthContext navigateRef ─────────
// Must be rendered inside <BrowserRouter> so useNavigate() is available.
function NavigateWirer() {
  const { navigateRef } = useAuth();
  const navigate = useNavigate();
  React.useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate, navigateRef]);
  return null;
}

// ── Keeps authenticated users out of /login and /register ────────────────────
function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="cf-center">
        <div className="cf-spinner" aria-label="Loading" />
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <>
      <NavigateWirer />
      <Routes>
        {/* ── Public-only ── */}
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <Register />
            </PublicOnlyRoute>
          }
        />

        {/* ── All authenticated users ── */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>

            {/* Common */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile"   element={<Profile />} />
            <Route path="/courses"   element={<Courses />} />

            {/* ── Student ── */}
            <Route element={<RoleRoute allowedRoles={["student"]} />}>
              <Route path="/student/create-request" element={<CreateRequest />} />
              <Route path="/student/my-requests"    element={<MyRequests />} />
              <Route path="/student/apply-leave"    element={<ApplyLeave />} />
              <Route path="/student/my-leaves"      element={<MyLeaves />} />
            </Route>

            {/* RequestDetails + LeaveDetails accessible across roles */}
            <Route element={<RoleRoute allowedRoles={["student", "faculty", "hod", "admin"]} />}>
              <Route path="/student/requests/:id" element={<RequestDetails />} />
              <Route path="/leave/:id"            element={<LeaveDetails />} />
            </Route>

            {/* ── Faculty / HOD ── */}
            <Route element={<RoleRoute allowedRoles={["faculty", "hod", "admin"]} />}>
              <Route path="/faculty/pending-requests" element={<PendingRequests />} />
              <Route path="/hod/requests"             element={<PendingRequests />} />
              <Route path="/faculty/requests/:id"     element={<RequestDetails />} />
              <Route path="/staff/leave-queue"        element={<StaffLeaveQueue />} />
            </Route>

            {/* ── Admin ── */}
            <Route element={<RoleRoute allowedRoles={["admin"]} />}>
              <Route path="/admin"                  element={<AdminDashboard />} />
              <Route path="/admin/analytics"        element={<AnalyticsDashboard />} />
              <Route path="/admin/users"            element={<ManageUsers />} />
              <Route path="/admin/departments"      element={<ManageDepartments />} />
              <Route path="/admin/audit-logs"       element={<AuditLogs />} />
              <Route path="/admin/requests"         element={<AdminRequests />} />
              <Route path="/admin/leave-types"      element={<ManageLeaveTypes />} />
              <Route path="/admin/leave-reports"    element={<LeaveReports />} />
            </Route>

          </Route>
        </Route>

        {/* ── Root redirect ── */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
