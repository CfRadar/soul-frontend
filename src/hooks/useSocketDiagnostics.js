import { useEffect, useState } from "react";
import { socket, connectSocketIfTokenExists } from "../socket";

export function useSocketDiagnostics() {
  const [socketStatus, setSocketStatus] = useState(() =>
    socket.connected ? "connected" : "disconnected"
  );

  useEffect(() => {
    connectSocketIfTokenExists();
  }, []);

  useEffect(() => {
    const onConnect = () => setSocketStatus("connected");
    const onDisconnect = (reason) => {
      setSocketStatus("disconnected");
      console.log("[Socket] Disconnected:", reason);
    };
    const onReconnectAttempt = (attempt) => {
      setSocketStatus("reconnecting");
      console.log("[Socket] Reconnect attempt:", attempt);
    };
    const onReconnect = () => {
      setSocketStatus("connected");
      console.log("[Socket] Reconnected");
    };
    const onError = (err) => {
      console.log("[Socket] Error:", err);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect", onReconnect);
    socket.io.on("error", onError);

    if (socket.connected) {
      setSocketStatus("connected");
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect", onReconnect);
      socket.io.off("error", onError);
    };
  }, []);

  return { socketStatus, socket };
}

export default useSocketDiagnostics;
