import React, { useState, useEffect, useCallback, lazy } from "react";
import { API_URL } from "./api/client";
import { useAuth, AuthCard } from "./features/auth";
import { TopNavBar, MainMenu, UsernameModal } from "./features/menu";
import { useSocketDiagnostics } from "./hooks/useSocketDiagnostics";
import { useOnlineCount } from "./hooks/useOnlineCount";
import SuspenseLoader from "./components/SuspenseLoader";
import CursorTrail from "./components/CursorTrail";
import MenuBackground from "./components/MenuBackground";

import FriendInviteToast from "./components/FriendInviteToast";
import PlayWithFriendModal from "./components/PlayWithFriendModal";
import FloatingFullscreenButton from "./components/FloatingFullscreenButton";

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
  const { onlineCount } = useOnlineCount(me);

  const [view, setView] = useState(VIEW.MENU);
  const [mode, setMode] = useState("ranked"); // ranked | friend | timeTrial | boss
  const [selectedBossId, setSelectedBossId] = useState(null);
  const [initialMatchData, setInitialMatchData] = useState(null);

  // Modals
  const [notifOpen, setNotifOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [friendModalOpen, setFriendModalOpen] = useState(false);

  // Wake backend server on load (e.g. Render spin-up)
  useEffect(() => {
    fetch(`${API_URL}/`, { method: "GET" }).catch(() => {});
  }, []);

  // Global socket listener: auto-navigate to GAME on match found
  useEffect(() => {
    const onMatchFound = (payload) => {
      console.log("[App] matchFound event received:", payload);
      const matchMode = payload?.mode || "ranked";
      setInitialMatchData(payload);
      setMode(matchMode === "friend" ? "friend" : "ranked");
      setFriendModalOpen(false);
      setView(VIEW.GAME);
    };

    socket.on("matchFound", onMatchFound);
    return () => socket.off("matchFound", onMatchFound);
  }, [socket]);

  // Navigation handlers
  const handleExitGame = useCallback(() => {
    setSelectedBossId(null);
    setInitialMatchData(null);
    setView(VIEW.MENU);
  }, []);

  const handleStartRanked = useCallback(() => {
    setMode("ranked");
    setInitialMatchData(null);
    setView(VIEW.GAME);
  }, []);

  const handleStartFriendMatch = useCallback(() => {
    setFriendModalOpen(true);
  }, []);

  const handleStartTimeTrial = useCallback(() => {
    setMode("timeTrial");
    setInitialMatchData(null);
    setView(VIEW.GAME);
  }, []);

  const handleStartBoss = useCallback((bossId) => {
    setMode("boss");
    setSelectedBossId(bossId);
    setInitialMatchData(null);
    setView(VIEW.GAME);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setView(VIEW.MENU);
  }, [logout]);

  return (
    <div className="h-screen h-[100dvh] w-screen bg-black text-white relative overflow-hidden flex flex-col select-none font-dialogue">
      <MenuBackground />
      <CursorTrail />

      {/* Global Side Toast for Friend Duel Invites */}
      <FriendInviteToast onAccepted={() => setFriendModalOpen(false)} />

      {/* Global Quick Fullscreen Exit Button (only for logged-out / auth screen if in fullscreen) */}
      {!me && <FloatingFullscreenButton />}

      {/* FULL-SCREEN GAME VIEWPORT: Zero scrollbars, maximum screen coverage */}
      {view === VIEW.GAME && me ? (
        <div className="fixed inset-0 z-30 bg-black overflow-hidden flex flex-col items-center justify-center w-full h-full">
          <SuspenseLoader minHeight="100vh">
            <Game
              mode={mode}
              bossId={selectedBossId}
              token={token}
              initialMatchData={initialMatchData}
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
        <div
          style={{
            paddingLeft: "max(6px, env(safe-area-inset-left, 6px))",
            paddingRight: "max(6px, env(safe-area-inset-right, 6px))",
            paddingTop: "max(4px, env(safe-area-inset-top, 4px))",
            paddingBottom: "max(4px, env(safe-area-inset-bottom, 4px))",
          }}
          className="relative z-10 w-full h-full flex flex-col overflow-hidden box-border"
        >
          {/* Top Navigation Bar */}
          {me && (
            <div className="mb-1 sm:mb-1.5 md:mb-2 flex-shrink-0">
              <TopNavBar
                me={me}
                socketStatus={socketStatus}
                onlineCount={onlineCount}
                onOpenGuide={() => setGuideOpen(true)}
                onOpenNotifications={() => setNotifOpen(true)}
                onLogout={handleLogout}
              />
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden">
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
                  onlineCount={onlineCount}
                />
              </div>
            ) : (
              /* Authenticated Views */
              <SuspenseLoader minHeight="400px">
                {view === VIEW.MENU && (
                  <MainMenu
                    me={me}
                    onlineCount={onlineCount}
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

        <PlayWithFriendModal
          open={friendModalOpen}
          onClose={() => setFriendModalOpen(false)}
          me={me}
        />
      </SuspenseLoader>
    </div>
  );
}
