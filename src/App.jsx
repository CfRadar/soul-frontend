import { useEffect, useState } from "react";
import { getMe, requestOtp, verifyOtp, updateUsername } from "./api";
import Game from "./Game";
import { setSocketToken, connectSocketIfTokenExists, socket } from "./socket";
import FriendsPanel from "./FriendsPanel";
import LeaderboardPanel from "./LeaderboardPanel";
import NotificationsModal from "./NotificationsModal";
import GuidePanel from "./GuidePanel";
import CursorTrail from "./components/CursorTrail";
import MenuBackground from "./components/MenuBackground";
import RankBadge from "./ui/RankBadge";
import BossesMenu from "./BossesMenu";
// Get API URL for wake server call
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Debug: Verify environment values are loaded
console.log("API_URL:", import.meta.env.VITE_API_URL);
console.log("SOCKET_URL:", import.meta.env.VITE_SOCKET_URL);

const VIEW = {
  LOGIN: "LOGIN",
  OTP: "OTP",
  MENU: "MENU",
  FRIENDS: "FRIENDS",
  BOSSES: "BOSSES",
  GAME: "GAME",
};

function rankLabel(rank) {
  const map = {
    bronze: "BRONZE",
    silver: "SILVER",
    gold: "GOLD",
    platinum: "PLATINUM",
    diamond: "DIAMOND",
    legendary: "LEGENDARY",
  };
  return map[rank] || String(rank || "").toUpperCase();
}

// Defensive helper: strip email prefix from username if it accidentally contains @
function safeUsername(username) {
  if (!username) return "Player";
  // If username looks like an email prefix (contains @), strip it
  if (username.includes("@")) {
    return username.split("@")[0];
  }
  return username;
}

export default function App() {
  const [view, setView] = useState(VIEW.LOGIN);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [token, setToken] = useState(localStorage.getItem("sd_token") || "");
  const [me, setMe] = useState(null);

  const [mode, setMode] = useState("ranked"); // ranked | friend | timeTrial | boss
  const [selectedBossId, setSelectedBossId] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Change username modal state
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [usernameMsg, setUsernameMsg] = useState("");
  const [usernameLoading, setUsernameLoading] = useState(false);

  // Socket connection status for diagnostics
  const [socketStatus, setSocketStatus] = useState("disconnected");

  // Wake server on app load (for Render free tier)
  useEffect(() => {
    fetch(`${API_URL}/`, { method: "GET" }).catch(() => {});
  }, []);

  useEffect(() => {
    connectSocketIfTokenExists();
  }, []);

  // Socket connection diagnostics
  useEffect(() => {
    const onConnect = () => setSocketStatus("connected");
    const onDisconnect = (reason) => {
      setSocketStatus("disconnected");
      console.log("[App] Socket disconnected:", reason);
    };
    const onReconnectAttempt = (attempt) => {
      setSocketStatus("reconnecting");
      console.log("[App] Socket reconnect attempt:", attempt);
    };
    const onReconnect = () => {
      setSocketStatus("connected");
      console.log("[App] Socket reconnected");
    };
    const onError = (err) => {
      console.log("[App] Socket error:", err);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect", onReconnect);
    socket.io.on("error", onError);

    // Set initial status
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

  // auto-login if token exists
  useEffect(() => {
    if (!token) return;
    (async () => {
      const r = await getMe(token);
      if (r?.ok) {
        setMe(r.player);
        setSocketToken(token);
        setView(VIEW.MENU);
      } else {
        localStorage.removeItem("sd_token");
        setToken("");
      }
    })();
  }, [token]);

  // ✅ IMPORTANT: global socket listener
  // If match is found while user is on MENU or FRIENDS, jump into GAME automatically.
  useEffect(() => {
    const onMatchFound = (payload) => {
      const m = payload?.mode || "ranked";
      if (m === "friend") setMode("friend");
      else setMode("ranked");

      // go to game automatically if not already there
      setView((cur) => (cur === VIEW.GAME ? cur : VIEW.GAME));
    };

    socket.on("matchFound", onMatchFound);
    return () => socket.off("matchFound", onMatchFound);
  }, []);

  async function onSendOtp() {
    setMsg("");
    setLoading(true);
    try {
      const r = await requestOtp(email);
      if (!r?.ok) throw new Error(r?.error || "Failed");
      setView(VIEW.OTP);
      setMsg("OTP sent (dev: check server console).");
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function onVerify() {
    setMsg("");
    setLoading(true);
    try {
      const r = await verifyOtp({ email, otp });
      if (!r?.ok) throw new Error(r?.error || "Verify failed");

      localStorage.setItem("sd_token", r.token);
      setToken(r.token);
      setSocketToken(r.token);
      setMe(r.player);
      setView(VIEW.MENU);
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("sd_token");
    setToken("");
    setSocketToken("");
    setMe(null);
    setView(VIEW.LOGIN);
  }

  // Handle username change
  async function onChangeUsername() {
    if (!newUsername.trim()) {
      setUsernameMsg("Please enter a username");
      return;
    }
    setUsernameMsg("");
    setUsernameLoading(true);
    try {
      const r = await updateUsername(token, newUsername);
      if (!r?.ok) {
        if (r?.error === "invalid_username") {
          setUsernameMsg("Invalid: 3-16 chars, letters/numbers/_ only");
        } else if (r?.error === "username_taken") {
          setUsernameMsg("Username already taken");
        } else {
          setUsernameMsg(r?.error || "Failed to update");
        }
        setUsernameLoading(false);
        return;
      }
      // Success - update me state
      setMe(r.player);
      setShowUsernameModal(false);
      setNewUsername("");
      setUsernameMsg("");
    } catch (e) {
      setUsernameMsg(String(e.message || e));
    } finally {
      setUsernameLoading(false);
    }
  }

  function openUsernameModal() {
    setNewUsername(me?.username || "");
    setUsernameMsg("");
    setShowUsernameModal(true);
  }

  // ✅ GAME
  if (view === VIEW.GAME && me) {
    return (
      <Game
        me={me}
        token={token}
        mode={mode}
        bossId={selectedBossId}
        onExit={() => {
            setView(mode === "boss" ? VIEW.BOSSES : VIEW.MENU);
            setSelectedBossId(null);
        }}
        onMeUpdate={setMe}
      />
    );
  }

  // ✅ FRIENDS
  if (view === VIEW.FRIENDS && me) {
    return (
      <FriendsPanel
        me={me}
        onBack={() => setView(VIEW.MENU)}
      />
    );
  }

  // UI wrapper - Full-screen black box layout for MENU, compact for LOGIN/OTP
  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-6 relative">
      {/* Cursor trail effect */}
      <CursorTrail />
      
      {/* Background effects - positioned absolute, no pointer events */}
      <MenuBackground />
      
      {/* Main container - no border box */}
      <div className="min-h-[calc(100vh-2rem)] md:min-h-[calc(100vh-3rem)] flex flex-col relative">
        
        {/* Top header bar - always visible */}
        <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-white/40">
          {/* Left: Title */}
          <div className="font-mono text-lg md:text-xl tracking-widest">SOUL DUEL</div>
          
          {/* Center: Mode label (only on MENU) + Socket status */}
          <div className="hidden md:flex items-center gap-4">
            {view === VIEW.MENU && (
              <div className="font-mono text-sm opacity-60 tracking-wider">
                MAIN MENU
              </div>
            )}
            {/* Socket status indicator */}
            {me && (
              <div className={`flex items-center gap-1.5 text-xs font-mono ${
                socketStatus === "connected" ? "text-green-400" :
                socketStatus === "reconnecting" ? "text-yellow-400" :
                "text-red-400"
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  socketStatus === "connected" ? "bg-green-400" :
                  socketStatus === "reconnecting" ? "bg-yellow-400 animate-pulse" :
                  "bg-red-400"
                }`}></span>
                {socketStatus}
              </div>
            )}
          </div>
          
          {/* Right: Notification bell + Logout (only when logged in) */}
          {me && (
            <div className="flex items-center gap-3">
              {/* Guide button */}
              <button
                onClick={() => setGuideOpen(true)}
                className="font-mono text-xs border border-white/60 px-3 py-2 rounded-lg hover:bg-white hover:text-black transition flex items-center gap-2"
              >
                <span>GUIDE</span>
              </button>

              {/* Bell icon button */}
              <button
                onClick={() => setNotifOpen(true)}
                className="w-9 h-9 flex items-center justify-center border border-white/60 rounded-lg hover:bg-white/10 transition"
                aria-label="Notifications"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>
              </button>
              
              {/* Logout button */}
              <button
                onClick={logout}
                className="font-mono text-xs border border-white/60 px-3 py-2 rounded-lg hover:bg-white hover:text-black transition"
              >
                LOGOUT
              </button>
            </div>
          )}
        </div>

        {/* Main content area */}
        <div className="flex-1 p-4 md:p-6 overflow-auto">
          {/* LOGIN view */}
          {view === VIEW.LOGIN && (
            <div className="max-w-md mx-auto font-mono">
              <div className="text-sm opacity-80 mb-4">LOGIN / SIGNUP</div>

              <div>
                <div className="text-xs opacity-70 mb-2">EMAIL</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black border border-white/50 rounded-xl px-4 py-3 outline-none"
                  placeholder="you@gmail.com"
                />
              </div>

              <button
                disabled={loading}
                onClick={onSendOtp}
                className="mt-5 w-full border border-white/70 rounded-xl px-4 py-3 hover:bg-white hover:text-black transition disabled:opacity-50"
              >
                {loading ? "SENDING..." : "SEND OTP"}
              </button>

              {msg && <div className="mt-4 text-xs opacity-80">{msg}</div>}
            </div>
          )}

          {/* OTP view */}
          {view === VIEW.OTP && (
            <div className="max-w-md mx-auto font-mono">
              <div className="text-sm opacity-80 mb-2">VERIFY OTP</div>
              <div className="text-xs opacity-70 mb-4">Email: {email}</div>

              <div>
                <div className="text-xs opacity-70 mb-2">OTP</div>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full bg-black border border-white/50 rounded-xl px-4 py-3 outline-none"
                  placeholder="6-digit code"
                />
              </div>

              <button
                disabled={loading}
                onClick={onVerify}
                className="mt-5 w-full border border-white/70 rounded-xl px-4 py-3 hover:bg-white hover:text-black transition disabled:opacity-50"
              >
                {loading ? "VERIFYING..." : "VERIFY & CONTINUE"}
              </button>

              <button
                disabled={loading}
                onClick={() => setView(VIEW.LOGIN)}
                className="mt-3 w-full border border-white/30 rounded-xl px-4 py-3 hover:bg-white hover:text-black transition disabled:opacity-50"
              >
                BACK
              </button>

              {msg && <div className="mt-4 text-xs opacity-80">{msg}</div>}
            </div>
          )}

          {/* MENU view - 2 column layout */}
          {view === VIEW.MENU && me && (
            <div className="font-mono h-full">
              {/* Mobile: stacked layout, Desktop: 2 columns */}
              <div className="flex flex-col lg:flex-row gap-6 h-full">
                {/* Left column: Menu options */}
                <div className="flex-1 flex flex-col">
                  {/* User info header */}
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="text-sm opacity-80">MAIN MENU</div>
                      <div className="mt-2 text-xs opacity-70">
                        Welcome, <span className="opacity-100">{safeUsername(me.username)}</span>
                        <button
                          onClick={openUsernameModal}
                          className="ml-2 text-[10px] opacity-50 hover:opacity-100 underline"
                        >
                          Change
                        </button>
                      </div>
                      <div className="mt-1 text-xs opacity-70">
                        UID: <span className="opacity-100">{me.uid}</span>
                      </div>
                      <div className="mt-1 text-xs opacity-70">
                        Wins: {me.wins || 0} | Losses: {me.losses || 0} | Winrate: {me.wins + me.losses > 0 ? Math.round((me.wins / (me.wins + me.losses)) * 100) : 0}%
                      </div>
                    </div>

                    <div className="text-right">
                      <RankBadge rank={me.rank} rating={me.rating} animated={true} />
                    </div>
                  </div>

                  <div className="h-px bg-white/30 mb-4" />

                  {/* Menu buttons */}
                  <div className="grid gap-3 flex-1 content-start">
                    <button
                      onClick={() => {
                        setMode("ranked");
                        setView(VIEW.GAME);
                      }}
                      className="text-left border border-white/60 rounded-xl p-4 hover:bg-white/10 transition"
                    >
                      <div className="text-sm">START MATCH — RANKED</div>
                      <div className="text-xs opacity-70 mt-1">+10 win / -20 loss</div>
                    </button>

                    <button
                      onClick={() => {
                        setMode("friend");
                        setView(VIEW.GAME);
                      }}
                      className="text-left border border-white/60 rounded-xl p-4 hover:bg-white/10 transition"
                    >
                      <div className="text-sm">PLAY WITH FRIEND</div>
                      <div className="text-xs opacity-70 mt-1">Invites enabled</div>
                    </button>

                    <button
                      onClick={() => {
                        setMode("timeTrial");
                        setView(VIEW.GAME);
                      }}
                      className="text-left border border-white/60 rounded-xl p-4 hover:bg-white/10 transition"
                    >
                      <div className="text-sm">TIME TRIAL — SOLO</div>
                      <div className="text-xs opacity-70 mt-1">Survival challenge</div>
                    </button>

                    <button
                      onClick={() => setView(VIEW.FRIENDS)}
                      className="text-left border border-white/60 rounded-xl p-4 hover:bg-white/10 transition"
                    >
                      <div className="text-sm">FRIENDS</div>
                      <div className="text-xs opacity-70 mt-1">Send/accept requests + invite</div>
                    </button>

                    <button
                      onClick={() => setView(VIEW.BOSSES)}
                      className="text-left border border-white/60 rounded-xl p-4 hover:bg-white/10 transition"
                    >
                      <div className="text-sm">BOSSES</div>
                      <div className="text-xs opacity-70 mt-1">Fight unlocked bosses again</div>
                    </button>
                  </div>
                </div>

                {/* Right column: Leaderboard */}
                <div className="w-full lg:w-80 flex-shrink-0">
                  <LeaderboardPanel me={me} />
                </div>
              </div>
            </div>
          )}

          {/* BOSSES view */}
          {view === VIEW.BOSSES && me && (
            <BossesMenu
              me={me}
              token={token}
              onBack={() => setView(VIEW.MENU)}
              onStartBoss={(bid) => {
                setMode("boss");
                setSelectedBossId(bid);
                setView(VIEW.GAME);
              }}
            />
          )}
        </div>
      </div>

      {/* Notifications Modal */}
      <NotificationsModal open={notifOpen} onClose={() => setNotifOpen(false)} />

      {/* Change Username Modal */}
      {showUsernameModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm border border-white/60 rounded-xl bg-black p-5">
            <div className="text-sm font-mono tracking-widest mb-4">CHANGE USERNAME</div>
            
            <div>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full bg-black border border-white/50 rounded-lg px-3 py-2 outline-none font-mono text-sm"
                placeholder="3-16 chars, letters/numbers/_"
                autoFocus
              />
            </div>

            {usernameMsg && (
              <div className="mt-2 text-xs text-red-400">{usernameMsg}</div>
            )}

            <div className="mt-4 flex gap-3">
              <button
                onClick={onChangeUsername}
                disabled={usernameLoading}
                className="flex-1 border border-white/60 rounded-lg px-3 py-2 hover:bg-white/10 font-mono text-xs disabled:opacity-50"
              >
                {usernameLoading ? "SAVING..." : "SAVE"}
              </button>
              <button
                onClick={() => {
                  setShowUsernameModal(false);
                  setNewUsername("");
                  setUsernameMsg("");
                }}
                disabled={usernameLoading}
                className="flex-1 border border-white/30 rounded-lg px-3 py-2 hover:bg-white/10 font-mono text-xs disabled:opacity-50"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Panel Modal */}
      <GuidePanel open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
