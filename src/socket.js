import { io } from "socket.io-client";

let SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

// Debug log in development
if (import.meta.env.DEV) {
  console.log("SOCKET_URL =", SOCKET_URL);
}

// if nobody provided a host and only a port, assume localhost first
if (SOCKET_URL.startsWith(":")) {
  SOCKET_URL = `http://localhost${SOCKET_URL}`;
}
// normalize same way as api.js
if (!SOCKET_URL.startsWith("http://") && !SOCKET_URL.startsWith("https://")) {
  SOCKET_URL = `http://${SOCKET_URL}`;
}

export const socket = io(SOCKET_URL, {
  autoConnect: false, // IMPORTANT: connect only after token is ready
  transports: ["websocket", "polling"],
});

export function setSocketToken(token) {
  socket.auth = { token };
  if (!socket.connected) socket.connect();
}

export function connectSocketWithToken(token) {
  socket.auth = { token };
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect();
}

