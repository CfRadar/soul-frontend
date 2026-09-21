import React, { useEffect, useState } from "react";
import { getBossUnlocks } from "./api";

const BOSS_DATA = [
  {
    id: "boss_radiance",
    name: "Radiant Ascendant",
    description: "A being of pure, blinding light. Waves of luminous spears and swords.",
    icon: "☀",
  },
  {
    id: "boss_sans",
    name: "JUDGEMENT WRAITH",
    description: "A skeletal force of impossible pressure, blasters, and gravity slams.",
    icon: "💀",
  },
  {
    id: "boss_goddess",
    name: "THE ASCENDED BLADE",
    description: "An ancient warrior awakening from the void with her glowing greatsword.",
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
    <div className="w-full h-full undertale-box p-4 md:p-6 flex flex-col min-h-0 bg-black text-white">
      {/* Header section */}
      <div className="mb-4 pb-3 border-b-2 border-white flex items-center justify-between flex-shrink-0">
        <div>
          <div className="font-pixel text-sm md:text-base text-[#e0aaff]">
            * BOSS RUSH REMATCHES
          </div>
        </div>
        <button
          onClick={onBack}
          className="font-pixel text-xs border-2 border-white px-3 py-2 hover:bg-white hover:text-black transition cursor-pointer"
        >
          [ BACK TO MENU ]
        </button>
      </div>

      {loading && (
        <div className="py-12 text-center text-base opacity-60 font-dialogue">
          * Awakening dormant bosses...
        </div>
      )}
      {errorMsg && (
        <div className="font-pixel text-xs text-red-500 mb-3">
          * {errorMsg}
        </div>
      )}

      {/* Boss Grid */}
      {!loading && (
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-4 pr-1">
          {BOSS_DATA.map((boss) => {
            const isUnlocked =
              unlockedIds.includes(boss.id) ||
              (boss.id === "boss_sans" && unlockedIds.includes("boss_base"));

            return (
              <div
                key={boss.id}
                className={`border-2 p-4 flex flex-col justify-between transition ${
                  isUnlocked
                    ? "border-white bg-black hover:border-[#e0aaff]"
                    : "border-neutral-800 bg-neutral-950 opacity-50"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-3xl">{boss.icon}</span>
                    <span
                      className={`font-pixel text-[9px] px-2 py-0.5 border ${
                        isUnlocked
                          ? "border-[#00ff00] text-[#00ff00]"
                          : "border-neutral-700 text-neutral-600"
                      }`}
                    >
                      {isUnlocked ? "UNLOCKED" : "LOCKED"}
                    </span>
                  </div>

                  <h3 className="font-pixel text-xs text-white uppercase tracking-wide">
                    {isUnlocked ? boss.name : "UNKNOWN FOE"}
                  </h3>
                  {isUnlocked && (
                    <p className="font-dialogue text-base text-neutral-300 mt-2">
                      {boss.description}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-800 flex justify-end">
                  {isUnlocked ? (
                    <button
                      onClick={() => onStartBoss(boss.id)}
                      className="font-pixel text-xs border-2 border-[#e0aaff] text-[#e0aaff] hover:bg-[#e0aaff] hover:text-black px-4 py-2 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span className="text-[#ff0000]">❤️</span>
                      [ CHALLENGE ]
                    </button>
                  ) : (
                    <span className="font-pixel text-[10px] text-neutral-600">
                      [ LOCKED ]
                    </span>
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
