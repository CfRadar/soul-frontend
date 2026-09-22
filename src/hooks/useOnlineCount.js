import { useState, useEffect, useCallback, useRef } from "react";
import { socket } from "../socket";
import { API_URL } from "../api/client";

/**
 * Hook to retrieve and listen to real-time online players count.
 * Combines HTTP fallback polling with real-time WebSocket events.
 *
 * @param {object} [me] - Current logged-in player object (if any)
 * @returns {{ onlineCount: number, refreshOnlineCount: () => void }}
 */
export function useOnlineCount(me) {
  const [onlineCount, setOnlineCount] = useState(() => (me ? 1 : 0));
  const knownOnlineUidsRef = useRef(new Set());

  const fetchHttpCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/online-count`, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.count === "number") {
          setOnlineCount((prev) => {
            const minCount = me ? 1 : 0;
            return Math.max(minCount, data.count);
          });
        }
      }
    } catch {
      // Fallback silently if offline/error
    }
  }, [me]);

  useEffect(() => {
    fetchHttpCount();
    const interval = setInterval(fetchHttpCount, 25000);
    return () => clearInterval(interval);
  }, [fetchHttpCount]);

  useEffect(() => {
    // 1. Listen for direct broadcast of online count from backend
    const onOnlineCount = (payload) => {
      const count = typeof payload === "number" ? payload : payload?.count;
      if (typeof count === "number") {
        setOnlineCount((prev) => {
          const minCount = me ? 1 : 0;
          return Math.max(minCount, count);
        });
      }
    };

    // 2. Fallback tracking: player:statusChange
    const onStatusChange = ({ uid, online }) => {
      if (!uid) return;
      if (online) {
        knownOnlineUidsRef.current.add(uid);
      } else {
        knownOnlineUidsRef.current.delete(uid);
      }
      setOnlineCount((prev) => {
        const minCount = me ? 1 : 0;
        return Math.max(minCount, knownOnlineUidsRef.current.size, prev);
      });
    };

    // 3. Fallback tracking: query online friends/players list
    const queryOnline = () => {
      if (socket.connected) {
        socket.emit("friends:getOnline", (res) => {
          if (res?.ok && Array.isArray(res.onlineUids)) {
            res.onlineUids.forEach((u) => knownOnlineUidsRef.current.add(u));
            setOnlineCount((prev) => {
              const minCount = me ? 1 : 0;
              return Math.max(minCount, res.onlineUids.length);
            });
          }
        });
        socket.emit("server:getOnlineCount", (res) => {
          if (typeof res?.count === "number") {
            setOnlineCount((prev) => {
              const minCount = me ? 1 : 0;
              return Math.max(minCount, res.count);
            });
          }
        });
      }
    };

    socket.on("server:onlineCount", onOnlineCount);
    socket.on("player:statusChange", onStatusChange);
    socket.on("connect", queryOnline);

    if (socket.connected) {
      queryOnline();
    }

    return () => {
      socket.off("server:onlineCount", onOnlineCount);
      socket.off("player:statusChange", onStatusChange);
      socket.off("connect", queryOnline);
    };
  }, [me]);

  // Keep min count if me logs in
  useEffect(() => {
    if (me) {
      setOnlineCount((prev) => Math.max(1, prev));
    }
  }, [me]);

  return { onlineCount, refreshOnlineCount: fetchHttpCount };
}

export default useOnlineCount;
