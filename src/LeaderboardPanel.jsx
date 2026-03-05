import { useEffect, useState } from "react";
import { getLeaderboard } from "./api";
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

// Defensive helper: strip email prefix from username if it accidentally contains @
function safeUsername(username) {
  if (!username) return "Player";
  if (username.includes("@")) {
    return username.split("@")[0];
  }
  return username;
}

function getWinrate(wins, losses) {
  const total = wins + losses;
  if (total === 0) return "0%";
  return Math.round((wins / total) * 100) + "%";
}

function RankIcon({ rank }) {
  const rankData = getRankData(rank);
  return <div className="flex-shrink-0 w-6 h-6">{rankData.icon}</div>;
}

export default function LeaderboardPanel({ me }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchLeaderboard() {
    try {
      const data = await getLeaderboard(10);
      if (data?.ok) {
        // Use leaderboard array (new response format) or fallback to players
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

  // Poll every 5 seconds
  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 5000);
    return () => clearInterval(interval);
  }, []);

  // Calculate current user's rank if they're in the list
  const myUid = me?.uid;

  return (
    <div className="w-full md:w-80 flex-shrink-0">
      <div className="border border-white/60 rounded-2xl p-4 bg-black/50">
        {/* Title */}
        <div className="text-sm font-mono tracking-widest border-b border-white/30 pb-2 mb-3">
          LEADERBOARD
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-8 text-center text-xs opacity-60 font-mono">
            Loading...
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="py-4 text-center text-xs text-red-400 font-mono">
            {error}
          </div>
        )}

        {/* List State */}
        {!loading && !error && players.length === 0 && (
          <div className="py-8 text-center text-xs opacity-60 font-mono">
            No players yet
          </div>
        )}

        {!loading && !error && players.length > 0 && (
          <div className="space-y-2">
            {players.map((player, index) => {
              const isMe = player.uid === myUid;
              return (
                <div
                  key={player.uid}
                  className={
                    "border rounded-xl px-3 py-2 flex items-center gap-2 font-mono text-xs " +
                    (isMe
                      ? "border-white bg-white/10"
                      : "border-white/30 hover:border-white/50")
                  }
                >
                  {/* Rank Number */}
                  <div className="w-6 text-center opacity-70">
                    {index + 1}
                  </div>

                  {/* Rank Icon */}
                  <RankIcon rank={player.rank} />

                  {/* Username */}
                  <div className="flex-1 truncate opacity-90">
                    {safeUsername(player.username)}
                  </div>

                  {/* Winrate */}
                  <div className="text-[10px] opacity-50">
                    {getWinrate(player.wins, player.losses)}
                  </div>

                  {/* Rating */}
                  <div className="text-right">
                    <div className="opacity-70">{player.rating}</div>
                  </div>

                  {/* Tier Label */}
                  <div className="text-[9px] opacity-50 w-14 text-right">
                    {rankLabel(player.rank)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 pt-2 border-t border-white/20 text-[10px] opacity-50 text-center font-mono">
          Updates every 5s
        </div>
      </div>
    </div>
  );
}

