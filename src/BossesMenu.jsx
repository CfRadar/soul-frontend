import React, { useEffect, useState } from "react";
import { getBossUnlocks } from "./api";

const BOSS_DATA = [
  {
    id: "boss_radiance",
    name: "Radiant Ascendant",
    description: "A being of pure, blinding light.",
    icon: "☀",
  },
  {
    id: "boss_sans",
    name: "JUDGEMENT WRAITH",
    description: "A skeletal force of impossible pressure, blasters, and bone storms.",
    icon: "💀",
  },
  {
    id: "boss_goddess",
    name: "THE ASCENDED BLADE",
    description: "An ancient valkyrie awakening from the void with her glowing greatsword.",
    icon: "⚔️",
  },
];

export default function BossesMenu({ me, token, onBack, onStartBoss }) {
  const [unlockedIds, setUnlockedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await getBossUnlocks(token);
        if (res?.ok) {
          setUnlockedIds(res.unlocked || []);
        } else {
          setErrorMsg(res?.error || "Failed to load unlocks");
        }
      } catch (err) {
        setErrorMsg("Network error loading boss data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  return (
    <div className="flex-1 flex flex-col font-mono mt-4">
      {/* Header section */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-widest text-white">BOSSES</h2>
          <p className="text-sm text-white/60 mt-1">Fight unlocked bosses again.</p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 border border-white/40 hover:bg-white/10 rounded-xl transition"
        >
          BACK TO MENU
        </button>
      </div>

      {loading && <div className="text-white/50 animate-pulse">Loading boss data...</div>}
      {errorMsg && <div className="text-red-400 text-sm mb-4">{errorMsg}</div>}

      {/* Boss Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BOSS_DATA.map((boss) => {
            const isUnlocked = unlockedIds.includes(boss.id) || 
              (boss.id === "boss_sans" && unlockedIds.includes("boss_base")) ||
              (boss.id === "boss_goddess" && unlockedIds.includes("boss_radiance")); // Optionally unlock her early if radiance unlocked, or require explicit unlock

            return (
              <div
                key={boss.id}
                className={`border rounded-xl p-5 flex flex-col justify-between transition ${isUnlocked
                    ? "border-white/60 bg-black hover:border-white shadow-lg shadow-white/5"
                    : "border-white/10 bg-white/5 opacity-70"
                  }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 flex items-center justify-center rounded-lg text-2xl border ${isUnlocked
                        ? "border-white/40 bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                        : "border-white/10 bg-black text-white/30"
                      }`}
                  >
                    {isUnlocked ? boss.icon : "🔒"}
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-lg font-bold ${isUnlocked ? "text-white" : "text-white/40"}`}>
                      {isUnlocked ? boss.name : "UNKNOWN ENTITY"}
                    </h3>
                    <p className={`text-xs mt-1 ${isUnlocked ? "text-white/60" : "text-white/30"}`}>
                      {isUnlocked ? boss.description : "Encounter this foe in Ranked or Time Trial to unlock."}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex justify-between items-center">
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded ${isUnlocked
                        ? "bg-green-900/40 text-green-400 border border-green-500/30"
                        : "bg-red-900/30 text-red-500/60 border border-red-500/20"
                      }`}
                  >
                    {isUnlocked ? "UNLOCKED" : "LOCKED"}
                  </span>

                  {isUnlocked && (
                    <button
                      onClick={() => onStartBoss(boss.id)}
                      className="px-4 py-2 bg-white text-black hover:bg-white/80 font-bold rounded-lg text-sm transition"
                    >
                      FIGHT
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
