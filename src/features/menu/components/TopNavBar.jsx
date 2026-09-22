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
    <header
      style={{
        paddingLeft: "max(6px, env(safe-area-inset-left, 6px))",
        paddingRight: "max(6px, env(safe-area-inset-right, 6px))",
        paddingTop: "max(2px, env(safe-area-inset-top, 2px))",
      }}
      className="undertale-box py-1 flex items-center justify-between w-full h-8 sm:h-9 flex-shrink-0 z-20 font-pixel overflow-hidden select-none box-border gap-1 sm:gap-2"
    >
      {/* Left: Brand title & compact real-time online souls badge */}
      <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-shrink">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          <span className="text-[#ff0000] text-[9px] sm:text-xs animate-heartbeat flex-shrink-0">❤️</span>
          <h1 className="text-[9px] sm:text-xs md:text-sm font-bold tracking-wider text-white whitespace-nowrap">
            SOUL DUEL
          </h1>
        </div>

        {/* Real-time Online Souls Count Indicator */}
        <div
          className="flex items-center gap-1 text-[7px] sm:text-[8.5px] border border-white/50 px-1 sm:px-1.5 py-0.5 bg-black/70 select-none flex-shrink-0"
          title={`${onlineCount} active player${onlineCount === 1 ? "" : "s"} online`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              socketStatus === "connected"
                ? "bg-[#00ff00] shadow-[0_0_5px_#00ff00] animate-pulse"
                : socketStatus === "reconnecting"
                ? "bg-[#ffff00] animate-pulse"
                : "bg-[#ff0000]"
            }`}
          />
          <span className="tracking-wider uppercase text-white/90 whitespace-nowrap">
            {onlineCount} <span className="hidden md:inline">ONLINE</span>
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
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {/* Fullscreen / Windowed Mode Button */}
          <button
            type="button"
            onClick={() => toggleFs()}
            className={`h-5 sm:h-6 px-1.5 sm:px-2 text-[7.5px] sm:text-[9px] border transition cursor-pointer flex items-center justify-center gap-1 active:scale-95 leading-none flex-shrink-0 ${
              isFullscreen
                ? "border-[#00ffff] text-[#00ffff] bg-[#00ffff]/10"
                : "border-white/70 text-white hover:bg-white hover:text-black"
            }`}
            title={isFullscreen ? "Exit Fullscreen Mode" : "Enter Fullscreen Mode"}
            aria-label="Toggle Fullscreen"
          >
            <span>{isFullscreen ? "⊠" : "⛶"}</span>
            <span className="hidden md:inline">{isFullscreen ? "EXIT FS" : "FULLSCREEN"}</span>
          </button>

          {/* Guide button */}
          <button
            type="button"
            onClick={onOpenGuide}
            className="h-5 sm:h-6 px-1.5 sm:px-2 text-[7.5px] sm:text-[9px] border border-white hover:bg-white hover:text-black transition cursor-pointer flex items-center justify-center active:scale-95 leading-none flex-shrink-0"
            title="Open Undertale Guide"
          >
            <span className="md:hidden">?</span>
            <span className="hidden md:inline">[ GUIDE ]</span>
          </button>

          {/* Bell Notifications button */}
          <button
            type="button"
            onClick={onOpenNotifications}
            className="h-5 sm:h-6 w-5 sm:w-6 border border-white hover:bg-white hover:text-black transition cursor-pointer flex items-center justify-center active:scale-95 leading-none flex-shrink-0"
            aria-label="Notifications"
            title="Notifications"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="sm:w-3 sm:h-3"
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
            className="h-5 sm:h-6 px-1.5 sm:px-2 text-[7.5px] sm:text-[9px] border border-[#ffff00] text-[#ffff00] hover:bg-[#ffff00] hover:text-black transition cursor-pointer flex items-center justify-center active:scale-95 leading-none flex-shrink-0"
            title="Log out and return to Login"
          >
            <span className="md:hidden">✕</span>
            <span className="hidden md:inline">[ EXIT ]</span>
          </button>
        </div>
      )}
    </header>
  );
}

export default TopNavBar;
