import React, { useState } from "react";
import { RANKS } from "../ui/ranks";// Helper components for the visual cards
const Card = ({ children, title, className = "" }) => (
  <div className={`border border-white/40 bg-black/50 p-4 rounded-xl ${className}`}>
    {title && <div className="text-xs font-bold tracking-widest text-white/70 mb-3 border-b border-white/20 pb-2">{title}</div>}
    {children}
  </div>
);

const Key = ({ label }) => (
  <span className="inline-flex items-center justify-center border border-white/60 rounded px-2 py-0.5 text-xs font-mono mx-0.5 bg-white/10">
    {label}
  </span>
);

export default function GuidePanel({ open, onClose }) {
  const [activeTab, setActiveTab] = useState("overview");

  if (!open) return null;

  const tabs = [
    { id: "overview", label: "OVERVIEW" },
    { id: "controls", label: "CONTROLS" },
    { id: "survival", label: "SURVIVAL" },
    { id: "abilities", label: "ABILITIES" },
    { id: "powerups", label: "POWERUPS" },
    { id: "modes", label: "GAME MODES" },
    { id: "ranked", label: "RANKED SYSTEM" },
    { id: "mobile", label: "MOBILE PLAY" },
    { id: "tips", label: "STRATEGY" },
  ];

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 z-50 font-mono text-white animate-in fade-in duration-200">
      
      {/* Main Container */}
      <div className="w-full max-w-5xl h-full max-h-[90vh] border border-white/60 flex flex-col rounded-xl overflow-hidden bg-black shadow-[0_0_30px_rgba(255,255,255,0.1)] relative">
        
        {/* Header */}
        <div className="flex-none p-4 border-b border-white/40 flex justify-between items-center bg-black/50">
          <div className="text-lg md:text-xl font-bold tracking-widest">SOUL DUEL // CODEX</div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border border-white/60 hover:bg-white hover:text-black transition rounded"
          >
            ✕
          </button>
        </div>

        {/* Body - Flex row on Desktop, Column on Mobile */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Side Nav / Top Nav on mobile */}
          <div className="flex-none w-full md:w-56 border-b md:border-b-0 md:border-r border-white/20 flex md:flex-col overflow-x-auto md:overflow-y-auto hide-scrollbar bg-black">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-none text-left px-4 py-3 text-sm transition whitespace-nowrap md:whitespace-normal
                  ${activeTab === tab.id 
                    ? "bg-white text-black font-bold" 
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#050505] space-y-6 scroll-smooth">
            
            {/* OVERVIEW */}
            {activeTab === "overview" && (
              <div className="space-y-4 animate-in slide-in-from-right-2 duration-300">
                <h2 className="text-xl font-bold tracking-widest mb-4 border-b border-white/40 pb-2">WHAT IS SOUL DUEL?</h2>
                <p className="opacity-80 leading-relaxed max-w-2xl">
                  Soul Duel is a high-speed, skill-based, bullet-hell survival game heavily inspired by Undertale's battle system. 
                  Your objective is simple: <strong>survive as long as possible while avoiding overwhelming barrages of projectiles.</strong>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                  <Card title="THE SOUL">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full border border-white flex items-center justify-center shadow-[0_0_10px_rgba(255,255,255,0.8)] text-red-500 text-sm">
                        ❤️
                      </div>
                      <div className="text-sm opacity-80">You control the SOUL. If its HP hits 0, you lose.</div>
                    </div>
                  </Card>
                  <Card title="THE THREAT">
                    <div className="flex items-center gap-4">
                      <div className="w-6 h-6 rounded-full border border-white bg-white/10 flex items-center justify-center shadow-[0_0_10px_rgba(255,255,255,0.8)] text-white text-[10px]">
                        ⚪
                      </div>
                      <div className="text-sm opacity-80">Dodge everything white or glowing. Movement is your only true defense.</div>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* CONTROLS */}
            {activeTab === "controls" && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold tracking-widest mb-4 border-b border-white/40 pb-2">CONTROLS</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card title="DESKTOP LAYOUT">
                    <div className="flex flex-col items-center gap-4 text-center mt-2 mb-4">
                      <div>
                        <Key label="W" /><br/>
                        <Key label="A" /><Key label="S" /><Key label="D" />
                      </div>
                      <div className="text-sm opacity-70">MOVEMENT</div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span><Key label="SHIFT" /></span>
                        <span className="opacity-80">Dash (if cooled down)</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span><Key label="SPACE" /></span>
                        <span className="opacity-80">Invincibility Shield</span>
                      </div>
                    </div>
                  </Card>

                  <Card title="MOBILE LAYOUT">
                    <div className="flex justify-between items-center mt-6">
                      {/* Fake Left Joystick */}
                      <div className="w-16 h-16 rounded-full border border-white/30 flex items-center justify-center relative">
                        <div className="w-6 h-6 rounded-full bg-white/50 absolute top-2 left-2"></div>
                        <span className="absolute -bottom-6 text-xs opacity-70">MOVE</span>
                      </div>

                      {/* Fake Right Buttons */}
                      <div className="flex gap-2 relative">
                         <div className="w-12 h-12 rounded-full border border-white flex justify-center items-center text-xs">🛡️</div>
                         <div className="w-12 h-12 rounded-full border border-white flex justify-center items-center text-xs">💨</div>
                         <span className="absolute -bottom-6 right-6 text-xs opacity-70">ABILITIES</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* SURVIVAL */}
            {activeTab === "survival" && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold tracking-widest border-b border-white/40 pb-2">CORE SURVIVAL</h2>
                
                <Card title="THE HUD EXPLAINED">
                  <div className="border border-white/50 p-3 rounded-lg flex flex-col gap-2 relative bg-black">
                    {/* Fake HP Bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold w-6">HP</span>
                      <div className="flex-1 h-3 border border-white/50 bg-black/50 p-[1px]">
                        <div className="w-3/4 h-full bg-white"></div>
                      </div>
                    </div>
                    {/* Fake Timer */}
                    <div className="absolute right-3 top-2 text-xs font-bold opacity-80">01:45:20</div>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm opacity-80 list-disc list-inside px-2">
                    <li>Start with 100 Max HP.</li>
                    <li>Surviving longer increases difficulty.</li>
                  </ul>
                </Card>

                <div className="grid grid-cols-2 gap-4">
                  <Card title="COLLISION RULES">
                    <p className="text-xs opacity-80 leading-relaxed">
                      Only the exact center of your SOUL takes damage. Grazing a bullet does not hurt you. Watch the core!
                    </p>
                  </Card>
                  <Card title="I-FRAMES">
                    <p className="text-xs opacity-80 leading-relaxed">
                      Taking damage grants a short invincibility window. The SOUL will blink while protected. Use this time to reposition.
                    </p>
                  </Card>
                </div>
              </div>
            )}

            {/* ABILITIES */}
            {activeTab === "abilities" && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold tracking-widest border-b border-white/40 pb-2">ABILITIES</h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <Card title="DASH (SHIFT)">
                    <div className="flex gap-4 items-center mb-4">
                      <div className="w-10 h-10 border border-white/50 rounded flex items-center justify-center shadow-[inset_0_0_10px_rgba(255,255,255,0.5)]">💨</div>
                      <div>
                        <div className="text-sm font-bold">Cooldown: 2.0s</div>
                        <div className="text-xs text-white/50">Travels instantly</div>
                      </div>
                    </div>
                    <p className="text-sm opacity-80">
                      Instantly dash in the direction you are moving. Leaves a white trail. 
                      Extremely useful to pierce through thick horizontal or vertical laser walls.
                    </p>
                  </Card>

                  <Card title="SHIELD (SPACE)">
                     <div className="flex gap-4 items-center mb-4">
                      <div className="w-10 h-10 border border-white/50 rounded flex flex-col items-center justify-center">
                         <span className="text-xs">🛡️</span>
                      </div>
                      <div>
                        <div className="text-sm font-bold">Duration: 1.0s</div>
                        <div className="text-sm font-bold opacity-70">Cooldown: 5.0s</div>
                      </div>
                    </div>
                    <p className="text-sm opacity-80">
                      Creates a barrier around the SOUL. You take exactly 0 damage while active. 
                      Because of the long cooldown, save this for unavoidable attacks or correcting positioning.
                    </p>
                  </Card>
                </div>
              </div>
            )}

            {/* POWERUPS */}
            {activeTab === "powerups" && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold tracking-widest border-b border-white/40 pb-2">POWERUPS & DROPS</h2>
                
                <p className="text-sm opacity-80">During matches, random items will float across the arena. Grab them before they disappear.</p>

                <div className="space-y-4">
                  <Card>
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full border border-green-400 text-green-400 flex items-center justify-center font-bold text-xs shadow-[0_0_10px_rgba(74,222,128,0.3)]">
                        +
                      </div>
                      <div>
                        <strong className="text-sm text-green-300">HP RESTORATION</strong>
                        <p className="text-xs opacity-70 mt-1">Restores 20 HP. Spawns every 10-15 seconds dynamically. Cap is 100 HP normally.</p>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded border border-purple-400 flex items-center justify-center rotate-45 shadow-[0_0_10px_rgba(192,132,252,0.3)]">
                        <span className="rotate-[-45deg] text-xs text-purple-400">⚡</span>
                      </div>
                      <div>
                        <strong className="text-sm text-purple-300">CORRUPT HEAL</strong>
                        <p className="text-xs opacity-70 mt-1">For 5 seconds, taking damage actually HEALS you instead. A purple aura will surround you.</p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* GAME MODES */}
            {activeTab === "modes" && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold tracking-widest border-b border-white/40 pb-2">GAME MODES</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card title="🏆 RANKED">
                    <p className="text-xs opacity-80 mb-2">PvP Survival. You and an opponent dodge the same pattern.</p>
                    <ul className="text-xs text-white/60 space-y-1 list-disc list-inside">
                      <li>First to die loses.</li>
                      <li>Win: +10 to +20 Rating</li>
                      <li>Loss: -10 to -20 Rating</li>
                      <li>Leaderboard positioning active.</li>
                    </ul>
                  </Card>
                  
                  <Card title="👥 FRIEND MATCH">
                    <p className="text-xs opacity-80 mb-2">Unranked PvP. Invite players from your Friends List.</p>
                    <ul className="text-xs text-white/60 space-y-1 list-disc list-inside">
                      <li>No rating changes.</li>
                      <li>Ideal for practicing patterns.</li>
                      <li>Opponent's HP is visible.</li>
                    </ul>
                  </Card>

                  <Card title="⏱️ TIME TRIAL">
                    <p className="text-xs opacity-80 mb-2">Solo Survival Mode.</p>
                    <ul className="text-xs text-white/60 space-y-1 list-disc list-inside">
                      <li>Survive as many seconds as possible.</li>
                      <li>Submit personal best to Global Time Trial Leaderboard.</li>
                      <li>Extremely difficult late-game scaling.</li>
                    </ul>
                  </Card>
                </div>
              </div>
            )}

            {/* RANKED */}
            {activeTab === "ranked" && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold tracking-widest border-b border-white/40 pb-2">RANKED SYSTEM</h2>
                
                <p className="text-sm opacity-80">
                  Winning Ranked matches climbs you up the competitive ladder. The more rating points you have, the higher your visual badge.
                </p>

                <div className="flex flex-col gap-2 p-4 border border-white/20 bg-black/40 rounded mt-4">
                  <div className="flex justify-between items-center border-b border-white/10 pb-1">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 flex justify-center items-center">{RANKS.bronze.icon}</div>
                       <span className="text-[10px] text-[#CD7F32]">BRONZE</span>
                    </div>
                    <span className="text-xs font-mono">0 - 74</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/10 pb-1">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 flex justify-center items-center">{RANKS.silver.icon}</div>
                       <span className="text-[10px] text-[#C0C0C0]">SILVER</span>
                    </div>
                    <span className="text-xs font-mono">75 - 149</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/10 pb-1">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 flex justify-center items-center">{RANKS.gold.icon}</div>
                       <span className="text-[10px] text-[#FFD700]">GOLD</span>
                    </div>
                    <span className="text-xs font-mono">150 - 249</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/10 pb-1">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 flex justify-center items-center">{RANKS.platinum.icon}</div>
                       <span className="text-[10px] text-[#00FFFF]">PLATINUM</span>
                    </div>
                    <span className="text-xs font-mono">250 - 349</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/10 pb-1">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 flex justify-center items-center">{RANKS.diamond.icon}</div>
                       <span className="text-[10px] text-[#FF00FF]">DIAMOND</span>
                    </div>
                    <span className="text-xs font-mono">350 - 449</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/10 pb-1">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 flex justify-center items-center">{RANKS.legendary.icon}</div>
                       <span className="text-[10px] text-[#FF0000]">LEGENDARY</span>
                    </div>
                    <span className="text-xs font-mono">450 - 549</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/10 pb-1">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 flex justify-center items-center">{RANKS.master.icon}</div>
                       <span className="text-[10px] text-[#8B008B]">MASTER</span>
                    </div>
                    <span className="text-xs font-mono">550+ (Top 10)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 flex justify-center items-center">{RANKS.grandmaster.icon}</div>
                       <span className="text-[10px] text-white">GRANDMASTER</span>
                    </div>
                    <span className="text-xs font-mono">Top 1</span>
                  </div>
                </div>

                <Card title="FORFEIT RULES">
                   <p className="text-xs opacity-80">Leaving the queue early is safe. Leaving mid-match will automatically count as a loss and deduct exactly 20 points from your rating.</p>
                </Card>
              </div>
            )}

            {/* MOBILE PLAY */}
            {activeTab === "mobile" && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold tracking-widest border-b border-white/40 pb-2">MOBILE OPTIMIZATION</h2>
                
                <p className="opacity-80 text-sm">Soul Duel is fully playable on touchscreen devices.</p>

                <div className="flex flex-col gap-4 mt-6">
                  <div className="bg-white/5 border border-white/20 p-4 rounded-lg">
                    <strong className="text-sm">Analog Movement</strong>
                    <p className="text-xs opacity-70 mt-1">A virtual joystick appears on the left half of the screen. Simply drag anywhere on the left side to instantly establish a pivot and move the SOUL.</p>
                  </div>
                  
                  <div className="bg-white/5 border border-white/20 p-4 rounded-lg">
                    <strong className="text-sm">Right-Hand Actions</strong>
                    <p className="text-xs opacity-70 mt-1">Dash and Shield buttons sit comfortably under the right thumb. Muscle memory will develop quickly.</p>
                  </div>
                </div>
              </div>
            )}

            {/* TIPS / STRATEGY */}
            {activeTab === "tips" && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold tracking-widest border-b border-white/40 pb-2">STRATEGY & TIPS</h2>
                
                <ul className="space-y-4">
                  <li className="flex gap-4 items-start">
                     <span className="text-lg">👁️</span>
                     <div>
                       <strong className="text-sm">WATCH THE CENTER</strong>
                       <p className="text-xs opacity-70 mt-1">Look at your SOUL, not the edges of the screen. Use peripheral vision for incoming attacks.</p>
                     </div>
                  </li>
                  <li className="flex gap-4 items-start">
                     <span className="text-lg">🏃</span>
                     <div>
                       <strong className="text-sm">MICRO-MOVEMENTS</strong>
                       <p className="text-xs opacity-70 mt-1">Huge sweeping movements get you killed. Tap keys to make micro-adjustments and slip between bullet corridors.</p>
                     </div>
                  </li>
                  <li className="flex gap-4 items-start">
                     <span className="text-lg">💨</span>
                     <div>
                       <strong className="text-sm">EVASIVE DASH (I-FRAMES!)</strong>
                       <p className="text-xs opacity-70 mt-1">Dashing provides instant distance and speed. Use it to phase through Radiance's missile laser strikes, undying vortexes, or sweeping lasers. 1.7s cooldown.</p>
                     </div>
                  </li>
                  <li className="flex gap-4 items-start">
                     <span className="text-lg">🛡️</span>
                     <div>
                       <strong className="text-sm">PANIC SHIELD</strong>
                       <p className="text-xs opacity-70 mt-1">Shield has a 5-second cooldown. DO NOT use it for single bullet mistakes. Use it when trapped.</p>
                     </div>
                  </li>
                </ul>

              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}

