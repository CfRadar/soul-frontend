import { io } from "socket.io-client";

// Socket URL - use VITE_SOCKET_URL, fallback to VITE_API_URL, then localhost
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001";

// Debug log in development
if (import.meta.env.DEV) {
  console.log("SOCKET_URL =", SOCKET_URL);
}

// Create socket instance with websocket + polling for production compatibility
export const socket = io(SOCKET_URL, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  upgrade: true,
  rememberUpgrade: true,
  withCredentials: false,
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 600,
  reconnectionDelayMax: 2500,
  timeout: 20000,
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
});

socket.io.on("reconnect_attempt", (attemptNumber) => {
  console.log("[socket] Reconnect attempt - count:", attemptNumber);
});

socket.io.on("reconnect", (attemptNumber) => {
  console.log("[socket] Reconnected after", attemptNumber, "attempts");
});

socket.io.on("error", (err) => {
  console.log("[socket] Error:", err);
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

