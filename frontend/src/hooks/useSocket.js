import { useEffect, useRef, useCallback } from "react";
import { io }       from "socket.io-client";
import { useAuth }  from "./useAuth";

const SOCKET_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

/**
 * useSocket — connects to the Socket.io server when the user is authenticated
 * and tears down cleanly on logout or unmount.
 *
 * Usage
 * ─────
 *   const { on, off } = useSocket();
 *
 *   useEffect(() => {
 *     on("REQUEST_STATUS_UPDATED", handler);
 *     return () => off("REQUEST_STATUS_UPDATED", handler);
 *   }, [on, off]);
 *
 * Returns
 * ───────
 * { on, off, emit, connected }
 */
export function useSocket() {
  const { user, isAuthenticated } = useAuth();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) {
      // Disconnect cleanly when the user logs out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    // Already connected
    if (socketRef.current?.connected) return;

    const socket = io(SOCKET_URL, {
      withCredentials: true,   // send the httpOnly cookie
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay:    2000,
    });

    socket.on("connect", () => {
      // Tell the server which role room to join
      const role = user?.role ?? "student";
      socket.emit("JOIN_ROLE_ROOM", role);
    });

    socket.on("connect_error", (err) => {
      // Suppress noise — the app works fine without real-time updates
      console.warn("[Socket] Connection error:", err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, user?.role]); // reconnect if role changes

  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler);
  }, []);

  const off = useCallback((event, handler) => {
    socketRef.current?.off(event, handler);
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return {
    on,
    off,
    emit,
    connected: Boolean(socketRef.current?.connected),
  };
}
