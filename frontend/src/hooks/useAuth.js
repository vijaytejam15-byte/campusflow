import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

/**
 * useAuth — consume the AuthContext from any component inside AuthProvider.
 *
 * Returned shape:
 *   user            — the authenticated user object (or null)
 *   isAuthenticated — true when a valid session exists
 *   loading         — true while the initial /api/me check is in flight
 *   login(creds)    — POST /api/login, sets user
 *   register(data)  — POST /api/register, sets user
 *   logout()        — POST /api/logout, clears user
 *   updateUser(u)   — sync updated user object into context (e.g. after profile edit)
 *   refresh()       — re-validate the session cookie against /api/me
 *   navigateRef     — ref to React Router's navigate fn (for programmatic nav)
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an <AuthProvider>.");
  }
  return ctx;
}
