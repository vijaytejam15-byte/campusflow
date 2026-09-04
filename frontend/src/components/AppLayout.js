import React from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

// Wraps every protected page (Dashboard, Profile, Courses) with the shared
// top navigation. ProtectedRoute still guards access before this renders.
export default function AppLayout() {
  return (
    <div className="cf-app">
      <Navbar />
      <Outlet />
    </div>
  );
}
