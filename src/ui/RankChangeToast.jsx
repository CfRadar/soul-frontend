// client/src/ui/RankChangeToast.jsx
import React, { useEffect, useState } from "react";
import { getRankData } from "./ranks";

export default function RankChangeToast({ delta, oldRating, newRating, oldRank, newRank, onComplete }) {
  const [visible, setVisible] = useState(true);
  const rankChanged = oldRank !== newRank;
  const isUp = rankChanged && getRankData(newRank).minRating > getRankData(oldRank).minRating;

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 300); // wait for fade out
    }, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
        visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full"
      }`}
    >
      <div className="bg-black/90 border border-white/50 rounded-lg p-4 font-mono text-sm">
        {rankChanged && (
          <div className={`text-center mb-2 text-lg font-bold ${isUp ? "text-green-400 animate-pulseGlow" : "text-red-400"}`}>
            {isUp ? "RANK UP!" : "RANK DOWN!"}
          </div>
        )}
        <div className="text-white/90">
          Rating: {oldRating} → {newRating} ({delta > 0 ? "+" : ""}{delta})
        </div>
        {rankChanged && (
          <div className="text-white/70 mt-1">
            {getRankData(oldRank).label} → {getRankData(newRank).label}
          </div>
        )}
      </div>
    </div>
  );
}