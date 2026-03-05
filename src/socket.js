// client/src/socket.js
import { io } from "socket.io-client";

let URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
// if nobody provided a host and only a port, assume localhost first
if (URL.startsWith(":")) {
  URL = `http://localhost${URL}`;
}
// normalize same way as api.js
if (!URL.startsWith("http://") && !URL.startsWith("https://")) {
  URL = `http://${URL}`;
}

export const socket = io(URL, {
  autoConnect: false, // IMPORTANT: connect only after token is ready
  transports: ["websocket"],
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