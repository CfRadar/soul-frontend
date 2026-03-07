import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001";

function getStoredToken() {
  try {
    return localStorage.getItem("sd_token") || "";
  } catch {
    return "";
  }
}

const initialToken = getStoredToken();

export const socket = io(SOCKET_URL, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  withCredentials: false,
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 700,
  reconnectionDelayMax: 2500,
  timeout: 20000,
  auth: {
    token: initialToken,
  },
});

export function setSocketToken(token) {
  const safeToken = token || "";
  socket.auth = { token: safeToken };

  if (safeToken) {
    if (socket.connected) socket.disconnect();
    socket.connect();
  } else {
    if (socket.connected) socket.disconnect();
  }
}

export function connectSocketIfTokenExists() {
  const token = getStoredToken();
  if (!token) return;
  socket.auth = { token };
  if (!socket.connected) socket.connect();
}

socket.on("connect", () => console.log("socket connected:", socket.id));
socket.on("disconnect", (r) => console.log("socket disconnected:", r));
socket.on("connect_error", (e) => console.log("socket connect_error:", e.message));
