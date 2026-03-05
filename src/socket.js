import { io } from "socket.io-client";

// Backend URL - use VITE_BACKEND_URL env var with fallback to deployed Vercel backend
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://soul-backend-nine.vercel.app";

// Debug log in development
if (import.meta.env.DEV) {
  console.log("BACKEND_URL =", BACKEND_URL);
}

// Create socket instance with polling only (no WebSocket) for Vercel compatibility
// This avoids WebSocket upgrade issues on Vercel's serverless environment
export const socket = io(BACKEND_URL, {
  path: "/socket.io",
  transports: ["polling"],       // Force polling only - no WebSocket
  upgrade: false,                // Disable WebSocket upgrade
  auth: {
    token: null                  // Will be set via setSocketToken
  },
  withCredentials: false,        // No credentials needed for polling
  reconnection: true,            // Enable auto-reconnection
  reconnectionAttempts: 10,      // Max reconnection attempts
  reconnectionDelay: 500,         // Delay between attempts (ms)
  timeout: 20000,                // Connection timeout (ms)
  autoConnect: false             // IMPORTANT: connect only after token is ready
});

// ====== Connection Event Logging ======

socket.on("connect", () => {
  console.log("[socket] Connected - socket.id:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("[socket] Disconnected - reason:", reason);
});

socket.on("connect_error", (err) => {
  console.log("[socket] Connection error - message:", err.message);
  if (err.description) {
    console.log("[socket] Connection error - description:", err.description);
  }
});

socket.on("reconnect_attempt", (attemptNumber) => {
  console.log("[socket] Reconnect attempt - count:", attemptNumber);
});

socket.on("reconnect_failed", () => {
  console.log("[socket] Reconnect failed - gave up after maximum attempts");
});

// ====== Token Management ======

/**
 * Set the authentication token and establish/refresh connection safely.
 * This function:
 * 1. Updates the token in socket.auth
 * 2. If already connected, disconnects first to ensure clean re-authentication
 * 3. Then connects with the new token
 * 
 * @param {string|null} token - The JWT token from authentication
 */
export function setSocketToken(token) {
  // Update the token in auth object
  socket.auth = { token };
  
  // If already connected, disconnect first to re-authenticate with new token
  if (socket.connected) {
    socket.disconnect();
  }
  
  // Connect with updated auth
  socket.connect();
}

/**
 * Legacy function - kept for backward compatibility
 * @deprecated Use setSocketToken instead
 */
export function connectSocketWithToken(token) {
  setSocketToken(token);
}

/**
 * Disconnect the socket gracefully
 */
export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}

