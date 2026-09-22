import React from "react";
import { useFullscreen } from "../../../hooks/useFullscreen";

export function TopNavBar({
  me,
  socketStatus,
  onlineCount = 0,
  onOpenGuide,
  onOpenNotifications,
  onLogout,
}) {
  const { isFullscreen, toggle: toggleFs } = useFullscreen();

  return (
    <header className="undertale-box px-2 sm:px-4 md:px-5 py-1.5 sm:py-2 flex items-center justify-between w-full flex-shrink-0 z-20 font-pixel overflow-hidden">
      {/* Left: Brand title & real-time online souls badge */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <span className="text-[#ff0000] text-xs sm:text-sm animate-heartbeat">❤️</span>
          <h1 className="text-[11px] sm:text-sm md:text-base font-bold tracking-wider text-white whitespace-nowrap">
            SOUL DUEL
          </h1>
        </div>

        {/* Real-time Online Souls Count Badge */}
        <div
          className="flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[10px] border border-white/60 sm:border-2 px-1.5 sm:px-2 py-0.5 bg-black/60 select-none flex-shrink-0"
          title={`${onlineCount} active player${onlineCount === 1 ? "" : "s"} online`}
        >
          <span
            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0 ${
              socketStatus === "connected"
                ? "bg-[#00ff00] shadow-[0_0_6px_#00ff00] animate-pulse"
                : socketStatus === "reconnecting"
                ? "bg-[#ffff00] animate-pulse"
                : "bg-[#ff0000]"
            }`}
          />
          <span className="tracking-wider uppercase text-white/90 whitespace-nowrap">
            {onlineCount} <span className="hidden sm:inline">SOUL{onlineCount === 1 ? "" : "S"}</span> ONLINE
          </span>
        </div>
      </div>

      {/* Middle: Player HP meter in Undertale style (desktop only) */}
      {me && (
        <div className="hidden lg:flex items-center gap-3 text-xs flex-shrink-0">
          <span className="text-white">LV 1</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#ff9900]">HP</span>
            <div className="w-24 h-4 bg-[#880000] border-2 border-white relative overflow-hidden">
              <div className="h-full bg-[#ffff00] w-full" />
            </div>
            <span className="text-[11px] text-white">100/100</span>
          </div>
        </div>
      )}

      {/* Right: Actions */}
      {me && (
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Fullscreen / Windowed Mode Button */}
          <button
            type="button"
            onClick={() => toggleFs()}
            className={`text-[8px] sm:text-[10px] border sm:border-2 px-1.5 sm:px-2.5 py-1 sm:py-1.5 transition cursor-pointer flex items-center gap-1 active:scale-95 touch-manipulation select-none ${
              isFullscreen
                ? "border-[#00ffff] text-[#00ffff] bg-[#00ffff]/10 shadow-[0_0_8px_rgba(0,255,255,0.4)]"
                : "border-white/80 text-white hover:bg-white hover:text-black"
            }`}
            title={isFullscreen ? "Exit Fullscreen Mode" : "Enter Fullscreen Mode"}
            aria-label="Toggle Fullscreen"
          >
            <span>{isFullscreen ? "⊠" : "⛶"}</span>
            <span className="hidden sm:inline">{isFullscreen ? "EXIT FS" : "FULLSCREEN"}</span>
          </button>

          {/* Guide button */}
          <button
            type="button"
            onClick={onOpenGuide}
            className="text-[8px] sm:text-[10px] border sm:border-2 border-white px-1.5 sm:px-2.5 py-1 sm:py-1.5 hover:bg-white hover:text-black transition cursor-pointer active:scale-95 touch-manipulation select-none"
            title="Open Undertale Guide"
          >
            <span className="sm:hidden">?</span>
            <span className="hidden sm:inline">[ GUIDE ]</span>
          </button>

          {/* Bell Notifications button */}
          <button
            type="button"
            onClick={onOpenNotifications}
            className="border sm:border-2 border-white p-1 sm:p-1.5 hover:bg-white hover:text-black transition cursor-pointer flex items-center justify-center active:scale-95 touch-manipulation select-none"
            aria-label="Notifications"
            title="Notifications"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="sm:w-3.5 sm:h-3.5"
            >
              <path
                d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
            </svg>
          </button>

          {/* Logout button */}
          <button
            type="button"
            onClick={onLogout}
            className="text-[8px] sm:text-[10px] border sm:border-2 border-[#ffff00] text-[#ffff00] px-1.5 sm:px-3 py-1 sm:py-1.5 hover:bg-[#ffff00] hover:text-black transition cursor-pointer active:scale-95 flex-shrink-0 touch-manipulation select-none"
            title="Log out and return to Login"
          >
            <span className="sm:hidden">✕</span>
            <span className="hidden sm:inline">[ EXIT ]</span>
          </button>
        </div>
      )}
    </header>
  );
}

export default TopNavBar;
