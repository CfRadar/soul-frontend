import React from "react";

export function TopNavBar({
  me,
  socketStatus,
  onOpenGuide,
  onOpenNotifications,
  onLogout,
}) {
  return (
    <header className="undertale-box px-4 md:px-5 py-2.5 flex items-center justify-between w-full flex-shrink-0 z-20 font-pixel">
      {/* Left: Brand title & socket status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[#ff0000] text-sm animate-heartbeat">❤️</span>
          <h1 className="text-sm md:text-base font-bold tracking-wider text-white">
            SOUL DUEL
          </h1>
        </div>

        {me && socketStatus && (
          <div className="hidden sm:flex items-center gap-1.5 text-[9px] border-2 border-white/60 px-2 py-0.5">
            <span
              className={`w-2 h-2 ${
                socketStatus === "connected"
                  ? "bg-[#00ff00] shadow-[0_0_4px_#00ff00]"
                  : socketStatus === "reconnecting"
                  ? "bg-[#ffff00] animate-pulse"
                  : "bg-[#ff0000]"
              }`}
            />
            <span className="tracking-widest uppercase text-white/80">
              {socketStatus === "connected" ? "ONLINE" : socketStatus}
            </span>
          </div>
        )}
      </div>

      {/* Middle: Player HP meter in Undertale style (desktop only) */}
      {me && (
        <div className="hidden md:flex items-center gap-3 text-xs">
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

      {/* Right: Actions (only when logged in) */}
      {me && (
        <div className="flex items-center gap-2">
          {/* Guide button */}
          <button
            onClick={onOpenGuide}
            className="text-[10px] border-2 border-white px-2.5 py-1.5 hover:bg-white hover:text-black transition cursor-pointer"
          >
            [ GUIDE ]
          </button>

          {/* Bell Notifications button */}
          <button
            onClick={onOpenNotifications}
            className="border-2 border-white p-1.5 hover:bg-white hover:text-black transition cursor-pointer flex items-center justify-center"
            aria-label="Notifications"
            title="Notifications"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
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
            onClick={onLogout}
            className="text-[10px] border-2 border-[#ffff00] text-[#ffff00] px-2.5 py-1.5 hover:bg-[#ffff00] hover:text-black transition cursor-pointer"
          >
            [ EXIT ]
          </button>
        </div>
      )}
    </header>
  );
}

export default TopNavBar;
