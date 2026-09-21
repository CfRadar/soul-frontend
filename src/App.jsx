import React, { useState, useEffect, useCallback, lazy } from "react";
import { API_URL } from "./api/client";
import { useAuth, AuthCard } from "./features/auth";
import { TopNavBar, MainMenu, UsernameModal } from "./features/menu";
import { useSocketDiagnostics } from "./hooks/useSocketDiagnostics";
import SuspenseLoader from "./components/SuspenseLoader";
import CursorTrail from "./components/CursorTrail";
import MenuBackground from "./components/MenuBackground";

// Lazy-loaded heavy components (frontend-expert code splitting)
const Game = lazy(() => import("./features/game"));
const FriendsPanel = lazy(() => import("./features/friends"));
const LeaderboardPanel = lazy(() => import("./features/leaderboard"));
const BossesMenu = lazy(() => import("./features/bosses"));
const NotificationsModal = lazy(() => import("./components/NotificationsModal"));
const GuidePanel = lazy(() => import("./components/GuidePanel"));

const VIEW = {
  MENU: "MENU",
  FRIENDS: "FRIENDS",
  BOSSES: "BOSSES",
  GAME: "GAME",
};

export default function App() {
  const {
    me,
    setMe,
    token,
    loading: authLoading,
    initialChecking,
    error: authError,
    setError: setAuthError,
    login,
    signup,
    logout,
    updateUsername,
  } = useAuth();

  const { socketStatus, socket } = useSocketDiagnostics();

  const [view, setView] = useState(VIEW.MENU);
  const [mode, setMode] = useState("ranked"); // ranked | friend | timeTrial | boss
  const [selectedBossId, setSelectedBossId] = useState(null);

  // Modals
  const [notifOpen, setNotifOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);

  // Wake backend server on load (e.g. Render spin-up)
  useEffect(() => {
    fetch(`${API_URL}/`, { method: "GET" }).catch(() => {});
  }, []);

  // Global socket listener: auto-navigate to GAME on match found
  useEffect(() => {
    const onMatchFound = (payload) => {
      const matchMode = payload?.mode || "ranked";
      setMode(matchMode === "friend" ? "friend" : "ranked");
      setView(VIEW.GAME);
    };

    socket.on("matchFound", onMatchFound);
    return () => socket.off("matchFound", onMatchFound);
  }, [socket]);

  // Navigation handlers
  const handleExitGame = useCallback(() => {
    setSelectedBossId(null);
    setView(VIEW.MENU);
  }, []);

  const handleStartRanked = useCallback(() => {
    setMode("ranked");
    setView(VIEW.GAME);
  }, []);

  const handleStartFriendMatch = useCallback(() => {
    setMode("friend");
    setView(VIEW.GAME);
  }, []);

  const handleStartTimeTrial = useCallback(() => {
    setMode("timeTrial");
    setView(VIEW.GAME);
  }, []);

  const handleStartBoss = useCallback((bossId) => {
    setMode("boss");
    setSelectedBossId(bossId);
    setView(VIEW.GAME);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setView(VIEW.MENU);
  }, [logout]);

  return (
    <div className="h-screen w-screen bg-black text-white relative overflow-hidden flex flex-col select-none font-dialogue">
      <MenuBackground />
      <CursorTrail />

      {/* FULL-SCREEN GAME VIEWPORT: Zero scrollbars, maximum screen coverage */}
      {view === VIEW.GAME && me ? (
        <div className="fixed inset-0 z-30 bg-black overflow-hidden flex flex-col items-center justify-center w-full h-full">
          <SuspenseLoader minHeight="100vh">
            <Game
              mode={mode}
              bossId={selectedBossId}
              token={token}
              onExit={handleExitGame}
              onBack={handleExitGame}
              me={me}
              onMeUpdate={(updatedMe) => {
                if (updatedMe) {
                  setMe((prev) => ({ ...prev, ...updatedMe }));
                }
              }}
            />
          </SuspenseLoader>
        </div>
      ) : (
        /* MAIN APPLICATION SHELL (Auth / Menu / Friends / Bosses) */
        <div className="relative z-10 w-full h-full flex flex-col overflow-hidden p-2.5 md:p-4">
          {/* Top Navigation Bar */}
          {me && (
            <div className="mb-2.5 md:mb-3 flex-shrink-0">
              <TopNavBar
                me={me}
                socketStatus={socketStatus}
                onOpenGuide={() => setGuideOpen(true)}
                onOpenNotifications={() => setNotifOpen(true)}
                onLogout={handleLogout}
              />
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 min-h-0 w-full overflow-hidden">
            {initialChecking ? (
              <SuspenseLoader minHeight="300px" />
            ) : !me ? (
              /* Auth View - Login / Sign Up centered */
              <div className="h-full w-full flex items-center justify-center overflow-auto p-4">
                <AuthCard
                  onLogin={login}
                  onSignup={signup}
                  loading={authLoading}
                  error={authError}
                  clearError={() => setAuthError("")}
                />
              </div>
            ) : (
              /* Authenticated Views */
              <SuspenseLoader minHeight="400px">
                {view === VIEW.MENU && (
                  <MainMenu
                    me={me}
                    onOpenUsernameModal={() => setUsernameModalOpen(true)}
                    onStartRanked={handleStartRanked}
                    onStartFriendMatch={handleStartFriendMatch}
                    onStartTimeTrial={handleStartTimeTrial}
                    onOpenFriends={() => setView(VIEW.FRIENDS)}
                    onOpenBosses={() => setView(VIEW.BOSSES)}
                    leaderboardSlot={
                      <SuspenseLoader minHeight="300px">
                        <LeaderboardPanel me={me} />
                      </SuspenseLoader>
                    }
                  />
                )}

                {view === VIEW.FRIENDS && (
                  <FriendsPanel me={me} onBack={() => setView(VIEW.MENU)} />
                )}

                {view === VIEW.BOSSES && (
                  <BossesMenu
                    me={me}
                    token={token}
                    onBack={() => setView(VIEW.MENU)}
                    onStartBoss={handleStartBoss}
                  />
                )}
              </SuspenseLoader>
            )}
          </div>
        </div>
      )}

      {/* Global Modals (Lazy Loaded with Suspense) */}
      <SuspenseLoader minHeight="0px">
        {notifOpen && (
          <NotificationsModal
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
          />
        )}

        {guideOpen && (
          <GuidePanel
            open={guideOpen}
            onClose={() => setGuideOpen(false)}
          />
        )}

        <UsernameModal
          open={usernameModalOpen}
          onClose={() => setUsernameModalOpen(false)}
          onSave={updateUsername}
        />
      </SuspenseLoader>
    </div>
  );
}
