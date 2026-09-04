import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { api, setSessionExpiredHandler } from "../api";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true); // true until first /api/me resolves

  // Exposed so App.js can wire React Router's navigate into the api layer
  const navigateRef = useRef(null);

  // On mount, validate the existing session cookie.
  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Wire api-layer 401 handler so any expired session redirects to /login.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      if (navigateRef.current) {
        navigateRef.current("/login?sessionExpired=true", { replace: true });
      }
    });
  }, []);

  const login = async (credentials) => {
    const data = await api.login(credentials);
    setUser(data.user);
    return data.user;
  };

  const register = async (details) => {
    const data = await api.register(details);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.logout(); } finally { setUser(null); }
  };

  const updateUser = (updatedUser) => setUser(updatedUser);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        navigateRef,
        login,
        register,
        logout,
        refresh,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
