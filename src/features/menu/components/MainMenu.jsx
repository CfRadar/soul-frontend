import React, { useState } from "react";
import RankBadge from "../../../ui/RankBadge";

function safeUsername(username) {
  if (!username) return "Human";
  if (username.includes("@")) {
    return username.split("@")[0];
  }
  return username;
}

export function MainMenu({
  me,
  onlineCount = 0,
  onOpenUsernameModal,
  onStartRanked,
  onStartFriendMatch,
  onStartTimeTrial,
  onOpenFriends,
  onOpenBosses,
  leaderboardSlot,
}) {
  const [hoveredBtn, setHoveredBtn] = useState(null);
  const totalGames = (me?.wins || 0) + (me?.losses || 0);
  const winrate = totalGames > 0 ? Math.round(((me?.wins || 0) / totalGames) * 100) : 0;

  return (
    <div className="w-full h-auto lg:h-full lg:min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-3 md:gap-4 pb-6 lg:pb-0 overflow-x-hidden">
      {/* Left Column: Player Status Tile + 5 Action Tiles */}
      <div className="lg:col-span-7 xl:col-span-8 h-auto lg:h-full lg:min-h-0 flex flex-col gap-2.5 sm:gap-3 md:gap-4">
        {/* Bento Tile 1: Player Soul Status & Narrator Dialogue */}
        <div className="undertale-box p-2.5 sm:p-3.5 md:p-4 flex-shrink-0 flex flex-col justify-between">
          <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[#ff0000] text-xs sm:text-sm animate-heartbeat flex-shrink-0">❤️</span>
                <span className="font-pixel text-[11px] sm:text-xs md:text-sm text-white uppercase font-bold tracking-wider truncate">
                  {safeUsername(me.username)}
                </span>
                <button
                  type="button"
                  onClick={onOpenUsernameModal}
                  className="font-pixel text-[8px] sm:text-[9px] text-neutral-400 hover:text-white underline cursor-pointer ml-1 flex-shrink-0 touch-manipulation"
                >
                  [RENAME]
                </button>
              </div>

              <div className="mt-1 font-dialogue text-sm sm:text-base md:text-xl text-neutral-300 flex flex-wrap gap-x-2.5 sm:gap-x-4 gap-y-0.5 leading-tight">
                <span>* LV 1</span>
                <span>* HP 100/100</span>
                <span>* EXP {me.rating || 0}</span>
                <span>* RECORD {me.wins || 0}W - {me.losses || 0}L ({winrate}%)</span>
                <span className="text-[#00ff00] inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00ff00] animate-pulse" />
                  * SOULS ONLINE: {onlineCount}
                </span>
              </div>
            </div>

            <div className="flex-shrink-0">
              <div className="sm:hidden">
                <RankBadge rank={me.rank} rating={me.rating} size="sm" animated={true} />
              </div>
              <div className="hidden sm:block">
                <RankBadge rank={me.rank} rating={me.rating} size="md" animated={true} />
              </div>
            </div>
          </div>
        </div>

        {/* Bento Tiles 2-6: 5 Action Commands Grid - 2 COLUMNS ON MOBILE */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4 lg:flex-1 lg:min-h-0 lg:grid-rows-[1fr_1fr_auto]">
          {/* Tile 2: FIGHT (Orange) */}
          <button
            type="button"
            onClick={onStartRanked}
            onMouseEnter={() => setHoveredBtn("fight")}
            onMouseLeave={() => setHoveredBtn(null)}
            className="undertale-box-orange p-2.5 sm:p-3.5 md:p-4 text-left transition-all group hover:bg-[#ff9900]/10 flex flex-col justify-between cursor-pointer min-h-[74px] sm:min-h-[85px] md:min-h-[95px] active:scale-[0.98] touch-manipulation"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                <span className={`text-[#ff0000] text-xs sm:text-sm flex-shrink-0 transition-opacity ${hoveredBtn === "fight" ? "opacity-100 animate-heartbeat" : "opacity-0"}`}>
                  ❤️
                </span>
                <span className="font-pixel text-[10px] sm:text-xs md:text-sm font-bold text-[#ff9900] tracking-wider whitespace-nowrap truncate">
                  [ FIGHT ]
                </span>
              </div>
              <span className="font-pixel text-[8px] sm:text-[9px] text-[#ff9900] border border-[#ff9900]/50 px-1 py-0.5 whitespace-nowrap hidden xs:inline-block">
                RANKED
              </span>
            </div>
            <div className="mt-1 sm:mt-2">
              <div className="font-dialogue text-base sm:text-xl md:text-2xl text-white font-bold tracking-wide leading-tight truncate">
                PvP Duel
              </div>
              <div className="font-pixel text-[7.5px] sm:text-[9px] text-[#ff9900]/80 mt-0.5">
                +10 / -20 EXP
              </div>
            </div>
          </button>

          {/* Tile 3: ACT (Cyan) */}
          <button
            type="button"
            onClick={onStartFriendMatch}
            onMouseEnter={() => setHoveredBtn("act")}
            onMouseLeave={() => setHoveredBtn(null)}
            className="undertale-box-cyan p-2.5 sm:p-3.5 md:p-4 text-left transition-all group hover:bg-[#00ffff]/10 flex flex-col justify-between cursor-pointer min-h-[74px] sm:min-h-[85px] md:min-h-[95px] active:scale-[0.98] touch-manipulation"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                <span className={`text-[#ff0000] text-xs sm:text-sm flex-shrink-0 transition-opacity ${hoveredBtn === "act" ? "opacity-100 animate-heartbeat" : "opacity-0"}`}>
                  ❤️
                </span>
                <span className="font-pixel text-[10px] sm:text-xs md:text-sm font-bold text-[#00ffff] tracking-wider whitespace-nowrap truncate">
                  [ ACT ]
                </span>
              </div>
              <span className="font-pixel text-[8px] sm:text-[9px] text-[#00ffff] border border-[#00ffff]/50 px-1 py-0.5 whitespace-nowrap hidden xs:inline-block">
                ROOM
              </span>
            </div>
            <div className="mt-1 sm:mt-2">
              <div className="font-dialogue text-base sm:text-xl md:text-2xl text-white font-bold tracking-wide leading-tight truncate">
                Duel Friend
              </div>
              <div className="font-pixel text-[7.5px] sm:text-[9px] text-[#00ffff]/80 mt-0.5">
                Code / Invite
              </div>
            </div>
          </button>

          {/* Tile 4: SURVIVE (Yellow) */}
          <button
            type="button"
            onClick={onStartTimeTrial}
            onMouseEnter={() => setHoveredBtn("survive")}
            onMouseLeave={() => setHoveredBtn(null)}
            className="undertale-box-yellow p-2.5 sm:p-3.5 md:p-4 text-left transition-all group hover:bg-[#ffff00]/10 flex flex-col justify-between cursor-pointer min-h-[74px] sm:min-h-[85px] md:min-h-[95px] active:scale-[0.98] touch-manipulation"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                <span className={`text-[#ff0000] text-xs sm:text-sm flex-shrink-0 transition-opacity ${hoveredBtn === "survive" ? "opacity-100 animate-heartbeat" : "opacity-0"}`}>
                  ❤️
                </span>
                <span className="font-pixel text-[10px] sm:text-xs md:text-sm font-bold text-[#ffff00] tracking-wider whitespace-nowrap truncate">
                  [ SURVIVE ]
                </span>
              </div>
              <span className="font-pixel text-[8px] sm:text-[9px] text-[#ffff00] border border-[#ffff00]/50 px-1 py-0.5 whitespace-nowrap hidden xs:inline-block">
                SOLO
              </span>
            </div>
            <div className="mt-1 sm:mt-2">
              <div className="font-dialogue text-base sm:text-xl md:text-2xl text-white font-bold tracking-wide leading-tight truncate">
                Time Trial
              </div>
              <div className="font-pixel text-[7.5px] sm:text-[9px] text-[#ffff00]/80 mt-0.5">
                Bullet Hell
              </div>
            </div>
          </button>

          {/* Tile 5: SOULS (Green) */}
          <button
            type="button"
            onClick={onOpenFriends}
            onMouseEnter={() => setHoveredBtn("friends")}
            onMouseLeave={() => setHoveredBtn(null)}
            className="undertale-box-green p-2.5 sm:p-3.5 md:p-4 text-left transition-all group hover:bg-[#00ff00]/10 flex flex-col justify-between cursor-pointer min-h-[74px] sm:min-h-[85px] md:min-h-[95px] active:scale-[0.98] touch-manipulation"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                <span className={`text-[#ff0000] text-xs sm:text-sm flex-shrink-0 transition-opacity ${hoveredBtn === "friends" ? "opacity-100 animate-heartbeat" : "opacity-0"}`}>
                  ❤️
                </span>
                <span className="font-pixel text-[10px] sm:text-xs md:text-sm font-bold text-[#00ff00] tracking-wider whitespace-nowrap truncate">
                  [ SOULS ]
                </span>
              </div>
              <span className="font-pixel text-[8px] sm:text-[9px] text-[#00ff00] border border-[#00ff00]/50 px-1 py-0.5 whitespace-nowrap hidden xs:inline-block">
                SOCIAL
              </span>
            </div>
            <div className="mt-1 sm:mt-2">
              <div className="font-dialogue text-base sm:text-xl md:text-2xl text-white font-bold tracking-wide leading-tight truncate">
                Friends & Allies
              </div>
              <div className="font-pixel text-[7.5px] sm:text-[9px] text-[#00ff00]/80 mt-0.5">
                Manage List
              </div>
            </div>
          </button>

          {/* Tile 6: BOSS RUSH (Purple, full width of action grid) */}
          <button
            type="button"
            onClick={onOpenBosses}
            onMouseEnter={() => setHoveredBtn("bosses")}
            onMouseLeave={() => setHoveredBtn(null)}
            className="col-span-2 undertale-box-purple p-2 sm:p-3 md:p-3.5 text-left transition-all group hover:bg-[#e0aaff]/10 flex items-center justify-between cursor-pointer flex-shrink-0 min-h-[50px] sm:min-h-[58px] active:scale-[0.98] touch-manipulation"
          >
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className={`text-[#ff0000] text-xs sm:text-sm flex-shrink-0 transition-opacity ${hoveredBtn === "bosses" ? "opacity-100 animate-heartbeat" : "opacity-0"}`}>
                ❤️
              </span>
              <div>
                <div className="font-pixel text-[10px] sm:text-xs md:text-sm font-bold text-[#e0aaff] tracking-wider whitespace-nowrap">
                  [ BOSS RUSH ]
                </div>
                <div className="font-dialogue text-sm sm:text-base text-neutral-300 leading-none mt-0.5">
                  Rematch unlocked legendary bosses
                </div>
              </div>
            </div>
            <span className="font-pixel text-[8px] sm:text-[9px] text-[#e0aaff] border border-[#e0aaff]/50 px-1.5 sm:px-2 py-0.5 sm:py-1 whitespace-nowrap">
              REMATCH
            </span>
          </button>
        </div>
      </div>

      {/* Right Column: Leaderboard Bento Tile */}
      <div className="lg:col-span-5 xl:col-span-4 h-[350px] sm:h-[400px] lg:h-full lg:min-h-0 flex flex-col">
        {leaderboardSlot}
      </div>
    </div>
  );
}

export default MainMenu;
