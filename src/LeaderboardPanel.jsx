import { useEffect, useState } from "react";
import { getLeaderboard, getTimeTrialLeaderboard } from "./api";
import { getRankData } from "./ui/ranks";

function rankLabel(rank) {
  const map = {
    bronze: "BRONZE",
    silver: "SILVER",
    gold: "GOLD",
    platinum: "PLATINUM",
    diamond: "DIAMOND",
    legendary: "LEGENDARY",
    master: "MASTER",
    grandmaster: "GRANDMASTER",
  };
  return map[rank] || String(rank || "").toUpperCase();
}

// Client-side fallback to guarantee accurate time-trial tier determination
function getTimeTrialTier(bestMs, position) {
  const ms = Math.max(0, Number(bestMs) || 0);
  const pos = Number(position) || 0;
  if (pos === 1 && ms >= 60000) return { rank: "grandmaster", title: "APEX SURVIVOR" };
  if (pos > 1 && pos <= 3 && ms >= 60000) return { rank: "master", title: "ELITE DODGER" };
  if (ms >= 180000) return { rank: "legendary", title: "DETERMINED" };
  if (ms >= 120000) return { rank: "diamond", title: "BULLET MASTER" };
  if (ms >= 90000) return { rank: "platinum", title: "SURVIVOR" };
  if (ms >= 60000) return { rank: "gold", title: "ENDURER" };
  if (ms >= 30000) return { rank: "silver", title: "TRAINEE" };
  return { rank: "bronze", title: "NOVICE" };
}

// Defensive helper: strip email prefix from username if it accidentally contains @
function safeUsername(username) {
  if (!username) return "Human";
  if (username.includes("@")) {
    return username.split("@")[0];
  }
  return username;
}

function getWinrate(wins, losses) {
  const total = (wins || 0) + (losses || 0);
  if (total === 0) return "0%";
  return Math.round(((wins || 0) / total) * 100) + "%";
}

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function RankIcon({ rank }) {
  const rankData = getRankData(rank);
  return <div className="flex-shrink-0 w-6 h-6">{rankData.icon}</div>;
}

export default function LeaderboardPanel({ me }) {
  const [tab, setTab] = useState("timeTrial"); // Default to timeTrial
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchRanked() {
    try {
      const data = await getLeaderboard(20);
      if (data?.ok) {
        setPlayers(data.leaderboard || data.players || []);
        setError(null);
      } else {
        setError(data?.error || "Failed to load");
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function fetchTimeTrial() {
    try {
      const data = await getTimeTrialLeaderboard(50);
      if (data?.ok) {
        setPlayers(data.rows || []);
        setError(null);
      } else {
        setError(data?.error || "Failed to load");
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Poll every 5 seconds
  useEffect(() => {
    setLoading(true);
    if (tab === "ranked") {
      fetchRanked();
    } else {
      fetchTimeTrial();
    }
    
    const interval = setInterval(() => {
      if (tab === "ranked") {
        fetchRanked();
      } else {
        fetchTimeTrial();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [tab]);

  const myUid = me?.uid;

  return (
    <div className="w-full h-full undertale-box p-3 md:p-4 bg-black text-white flex flex-col min-h-0">
      {/* Title + Tabs Header */}
      <div className="flex flex-col gap-2.5 border-b-2 border-white pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="font-pixel text-xs tracking-wider text-white">
            * LEADERBOARD
          </span>
          <span className="font-pixel text-[9px] text-[#ffff00]">
            {tab === "timeTrial" ? "SURVIVORS" : "DUELISTS"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 font-pixel text-[10px]">
          <button
            onClick={() => setTab("ranked")}
            className={`py-2 px-1 border-2 transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              tab === "ranked"
                ? "border-[#ff9900] text-[#ff9900] bg-white/5"
                : "border-neutral-700 text-neutral-400 hover:border-white hover:text-white"
            }`}
          >
            {tab === "ranked" && <span className="text-[#ff0000] text-xs animate-heartbeat">❤️</span>}
            [ RANKED ]
          </button>
          <button
            onClick={() => setTab("timeTrial")}
            className={`py-2 px-1 border-2 transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              tab === "timeTrial"
                ? "border-[#00ffff] text-[#00ffff] bg-white/5"
                : "border-neutral-700 text-neutral-400 hover:border-white hover:text-white"
            }`}
          >
            {tab === "timeTrial" && <span className="text-[#ff0000] text-xs animate-heartbeat">❤️</span>}
            [ TIME TRIAL ]
          </button>
        </div>
      </div>

      {/* Middle Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2 my-2.5">
        {/* Loading State */}
        {loading && (
          <div className="py-12 text-center text-base opacity-60 font-dialogue">
            * Reading souls from the barrier...
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="py-6 text-center text-xs text-red-500 font-pixel">
            * {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && players.length === 0 && (
          <div className="py-12 text-center text-base opacity-60 font-dialogue">
            * But nobody came.
          </div>
        )}

        {/* Ranked Tab List */}
        {!loading && !error && players.length > 0 && tab === "ranked" && (
          <div className="space-y-2">
            {players.map((player, index) => {
              const isMe = player.uid === myUid;
              const pos = index + 1;
              const posColor =
                pos === 1
                  ? "text-[#ffff00] font-bold"
                  : pos === 2
                  ? "text-neutral-300 font-bold"
                  : pos === 3
                  ? "text-amber-500 font-bold"
                  : "text-neutral-400";

              return (
                <div
                  key={player.uid}
                  className={`border-2 p-2 flex items-center gap-2 text-xs transition ${
                    isMe
                      ? "border-[#ffff00] bg-white/10"
                      : "border-white/30 hover:border-white"
                  }`}
                >
                  <div className={`w-6 font-pixel text-[10px] text-center ${posColor} flex-shrink-0`}>
                    #{pos}
                  </div>

                  <RankIcon rank={player.rank} />

                  <div className="flex-1 truncate font-pixel text-[10px] text-white">
                    {safeUsername(player.username)}
                  </div>

                  <div className="text-[12px] font-dialogue text-neutral-400 flex-shrink-0">
                    {getWinrate(player.wins, player.losses)}
                  </div>

                  <div className="text-right font-pixel text-[10px] text-neutral-300 flex-shrink-0">
                    {player.rating} EXP
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Time Trial Tab List */}
        {!loading && !error && players.length > 0 && tab === "timeTrial" && (
          <div className="space-y-2">
            {players.map((player, index) => {
              const isMe = player.uid === myUid;
              const pos = index + 1;
              const timeStr = fmtMs(player.bestTimeTrialMs);

              // Calculate tier accurately client-side
              const calculatedTier = getTimeTrialTier(player.bestTimeTrialMs, pos);
              const rankKey =
                player.timeTrialRank && player.timeTrialRank !== "bronze"
                  ? player.timeTrialRank
                  : calculatedTier.rank;
              const title = player.timeTrialTitle || calculatedTier.title;

              const posColor =
                pos === 1
                  ? "text-[#ffff00] font-bold"
                  : pos === 2
                  ? "text-neutral-300 font-bold"
                  : pos === 3
                  ? "text-amber-500 font-bold"
                  : "text-neutral-400";

              return (
                <div
                  key={player.uid}
                  className={`border-2 p-2.5 flex items-center gap-2.5 transition ${
                    isMe
                      ? "border-[#00ffff] bg-white/10"
                      : "border-white/40 hover:border-white"
                  }`}
                >
                  <div className={`w-6 font-pixel text-[10px] text-center ${posColor} flex-shrink-0`}>
                    #{pos}
                  </div>

                  <RankIcon rank={rankKey} />

                  <div className="flex-1 min-w-0">
                    <div className="truncate font-pixel text-[11px] text-white">
                      {safeUsername(player.username)}
                    </div>
                    <div className="font-pixel text-[8px] text-neutral-400 tracking-wider">
                      {title}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="font-pixel text-xs text-[#00ff00]">
                      {timeStr}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
