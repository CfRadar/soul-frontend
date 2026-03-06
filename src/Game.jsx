// client/src/Game.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "./socket";
import { submitTimeTrial } from "./api";
import RankBadge from "./ui/RankBadge";
import RankChangeToast from "./ui/RankChangeToast";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const PHASE = {
  MENU: "MENU",
  QUEUE: "QUEUE",
  MATCH_FOUND: "MATCH_FOUND",
  COUNTDOWN: "COUNTDOWN",
  PLAYING: "PLAYING",
  MATCH_OVER: "MATCH_OVER",
  SUMMARY: "SUMMARY",
};

// deterministic RNG
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randSigned() {
  return (Math.random() * 2 - 1) || 0;
}

// normalize player order for all overlays (ensure you are always shown on left when available)
function normalizePlayers({ me, matchInfo, mySocketId }) {
  let left = null;
  let right = null;
  let iAmLeft = false;
  const meUid = me?.uid;

  if (matchInfo && matchInfo.p1 && matchInfo.p2) {
    const { p1, p2 } = matchInfo;
    if (meUid && p1?.uid === meUid) {
      left = p1;
      right = p2;
      iAmLeft = true;
    } else if (meUid && p2?.uid === meUid) {
      left = p2;
      right = p1;
      iAmLeft = true;
    } else {
      // me not in players or missing uid, just put me on left if available
      left = me
        ? { uid: me.uid, username: me.username, rating: me.rating, rank: me.rank }
        : p1;
      right = me ? (left?.uid === p1?.uid ? p2 : p1) : p2;
      iAmLeft = !!me;
    }
  } else {
    left = me
      ? { uid: me.uid, username: me.username, rating: me.rating, rank: me.rank }
      : { username: "YOU", rank: "bronze", rating: 0 };
    right = { username: "OPPONENT", rank: "bronze", rating: 0 };
    iAmLeft = true;
  }
  return { left, right, iAmLeft };
}

function rankLabel(rank) {
  const map = {
    bronze: "BRONZE",
    silver: "SILVER",
    gold: "GOLD",
    platinum: "PLATINUM",
    diamond: "DIAMOND",
    legendary: "LEGENDARY",
  };
  return map[rank] || String(rank || "").toUpperCase();
}

// Defensive helper: strip email prefix from username if it accidentally contains @
function safeUsername(username) {
  if (!username) return "Player";
  if (typeof username !== "string") return "Player";
  if (username.includes("@")) {
    return username.split("@")[0];
  }
  return username;
}

// Safe enemy identification
function getEnemyInfo({ p1, p2, me }) {
  const meUid = me?.uid;
  const left = p1 || null;
  const right = p2 || null;

  let enemy = null;
  if (meUid && left?.uid === meUid) {
    enemy = right;
  } else if (meUid && right?.uid === meUid) {
    enemy = left;
  } else {
    enemy = right || left;
  }

  return {
    enemy,
    enemyName: enemy?.username ? safeUsername(enemy.username) : "OPPONENT",
    enemyHp: 100, // Default enemy HP, will be updated via socket
    enemySocketId: enemy?.socketId || null,
  };
}

// Helper to get opponent name safely
function getOpponentName(me, matchInfo) {
  const meUid = me?.uid;
  const p1 = matchInfo?.p1;
  const p2 = matchInfo?.p2;

  // Prefer p2.username if I am p1
  if (meUid && p1?.uid === meUid) {
    return safeUsername(p2?.username) || "OPPONENT";
  }
  // Prefer p1.username if I am p2
  if (meUid && p2?.uid === meUid) {
    return safeUsername(p1?.username) || "OPPONENT";
  }
  // Fallback: prefer p2, then p1
  return safeUsername(p2?.username || p1?.username) || "OPPONENT";
}

// ========== HeaderBar Component (Internal) ==========
// Clean top HUD bar above canvas - shown during COUNTDOWN + PLAYING
function HeaderBar({ myName, oppName, hp, timerText, hpHitPulse, phase, guardStatus, corruptHealRem }) {
  const showBar = phase === PHASE.COUNTDOWN || phase === PHASE.PLAYING;

  if (!showBar) return null;

  const isCorruptActive = corruptHealRem > 0;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-black border-b border-white/20 min-h-[48px]">
      {/* Left: Names - w-[30%] min-w-0 */}
      <div className="w-[30%] min-w-0 flex items-center">
        <span className="font-mono text-sm text-white truncate">
          {myName}
        </span>
        <span className="mx-2 text-white/50 text-xs">VS</span>
        <span className="font-mono text-sm text-white truncate">
          {oppName}
        </span>
      </div>

      {/* Center: Timer - w-[32%] flex justify-center */}
      <div className="w-[32%] flex justify-center">
        <span className={`font-mono text-3xl text-white tabular-nums ${phase === PHASE.PLAYING ? 'animate-pulse' : ''}`}>
          {timerText}
        </span>
      </div>

      {/* Right: HP + Guard - w-[38%] flex justify-end */}
      <div className="w-[38%] flex justify-end items-center gap-3">
        {isCorruptActive && (
          <div className="text-xs font-bold text-purple-400 font-mono bg-purple-900/40 px-2 py-1 rounded animate-pulse">
            REVERSE: {corruptHealRem.toFixed(1)}s
          </div>
        )}
        <div className="flex items-center">
          <span className={`font-mono text-3xl tabular-nums transition-all duration-150 ${hpHitPulse ? 'text-red-400 scale-110' : 'text-white'}`}>
            {hp}
          </span>
          <span className="ml-1 text-xs text-white/50 font-mono">HP</span>
        </div>
        <div className="text-xs text-white/70 font-mono bg-white/10 px-2 py-1 rounded">
          GUARD: <span className={guardStatus === "READY" ? "text-lime-400" : "text-white/60"}>{guardStatus}</span>
        </div>
      </div>
    </div>
  );
}

export default function Game({
  me,
  mode = "ranked",
  friendTargetUid = null,
  onExit,
  onMeUpdate,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const keysRef = useRef(new Set());

  const lastHitAtRef = useRef(-9999);
  const phaseRef = useRef(PHASE.MENU);
  const roomIdRef = useRef(null);

  const surviveStartRef = useRef(0);
  const endAtRef = useRef(null); // Frozen timestamp when match ends

  // Guard skill timing
  const guardUntilRef = useRef(0); // When guard invincibility expires
  const guardCdUntilRef = useRef(0); // When guard cooldown expires
  // Corrupt Heal powerup timing
  const corruptHealUntilRef = useRef(0); // When corrupt heal expires

  // Track previous HP for hit animation
  const prevHpRef = useRef(100);
  const hpPulseRef = useRef(false);

  const [seed, setSeed] = useState(123456);
  const seedRef = useRef(123456);
  const rngRef = useRef(() => Math.random());

  const [socketStatus, setSocketStatus] = useState(
    socket.connected ? "connected" : "connecting..."
  );
  const [phase, setPhase] = useState(PHASE.MENU);

  const [roomId, setRoomId] = useState(null);
  const [startAt, setStartAt] = useState(null);

  const [countdownMs, setCountdownMs] = useState(0);
  const [myId, setMyId] = useState(socket.id || "");
  const [winnerId, setWinnerId] = useState(null);

  const [matchInfo, setMatchInfo] = useState(null);
  const lastResultRef = useRef(null);

  const [rankChangeToast, setRankChangeToast] = useState(null);

  const [hp, setHp] = useState(100);
  const [enemyHp, setEnemyHp] = useState(100);
  const [hitFlash, setHitFlash] = useState(false);
  const [hpPulse, setHpPulse] = useState(false);
  const [surviveStart, setSurviveStart] = useState(0);
  const [endAt, setEndAt] = useState(null); // Frozen end timestamp (freezes timer)
  const [nowMs, setNowMs] = useState(Date.now());

  // Enemy info state
  const [enemyName, setEnemyName] = useState("OPPONENT");
  const [enemySocketId, setEnemySocketId] = useState(null);

  // Fatal error state
  const [fatalErr, setFatalErr] = useState("");

  // Time Trial submission state
  const [timeTrialSubmissionStatus, setTimeTrialSubmissionStatus] = useState(null); // null | "submitting" | "success" | "error"
  const [timeTrialSubmissionMsg, setTimeTrialSubmissionMsg] = useState("");
  const [bestTimeTrialMs, setBestTimeTrialMs] = useState(0);
  const [timeTrialImproved, setTimeTrialImproved] = useState(false);

  const playerRef = useRef({ x: 0, y: 0, r: 10 });
  const bulletsRef = useRef([]);
  const spawnRef = useRef({ nextSpawnAtMs: 0 });
  const powerupRef = useRef({ active: null, nextSpawnAtMs: 10000, nextCorruptSpawnAtMs: 60000 });
  const healTextRef = useRef({ text: "", until: 0 });
  const bossRef = useRef({
    state: "IDLE",
    animTime: 0,
    projectiles: [],
    lasers: [],
    nextAttackMs: 0,
    attackCount: 0,
  });

  const shakeRef = useRef({ until: 0, amp: 0 });

  const maxHpRef = useRef(100);
  const radianceBossRef = useRef({
    triggered: false,
    warning: false,
    active: false,
    defeated: false,
    warningStartMs: 0,
    bossStartMs: 0,
    hp: 100,
    phaseTimeMs: 0,
    attackType: null,
    nextAttackAtMs: 0,
    homingOrbs: [],
    lasers: [],
    wallSpikes: [],
    orbCharge: 0,
    orbChargeMax: 5,
    collectibleOrb: null,
    sonicBoomActive: false,
    sonicBoomUntil: 0,
    bossPauseStart: 0,
    bossPauseTotal: 0,
  });
  
  // Visual particles for Radiance enhancements
  const radParticlesRef = useRef({
    ambient: [],
    sparks: [],
    booms: []
  });

  const audioCtxRef = useRef(null);
  const audioUnlockedRef = useRef(false);

  const iAmWinner = useMemo(
    () => winnerId && myId && winnerId === myId,
    [winnerId, myId]
  );

  // Compute my name safely
  const myName = me?.username ? safeUsername(me.username) : "YOU";
  // Compute opponent name safely
  const opponentName = getOpponentName(me, matchInfo);

  // Compute timer text - use frozen endAt timestamp if match has ended
  const shouldShowTimer = phase === PHASE.PLAYING || phase === PHASE.MATCH_OVER || phase === PHASE.SUMMARY;
  const effectiveNow = endAt ?? nowMs; // Use frozen timestamp if match ended
  let survivalMs = shouldShowTimer ? Math.max(0, effectiveNow - surviveStart) : 0;
  
  const radState = radianceBossRef.current;
  if (radState.triggered) {
      if (!radState.defeated) {
          survivalMs = radState.bossPauseStart;
      } else {
          survivalMs = Math.max(0, survivalMs - radState.bossPauseTotal);
      }
  }

  const timerText = fmtMs(survivalMs);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    seedRef.current = seed;
  }, [seed]);

  // Update now only during PLAYING phase to avoid unnecessary rerenders when match is frozen
  useEffect(() => {
    if (phase !== PHASE.PLAYING) return;
    const t = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(t);
  }, [phase]);

  function playBossWarningSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 1.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 1.2);
    } catch (err) {
      console.warn("audio error", err);
    }
  }

  function playLaserChargeSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.6);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.6);
    } catch (err) {
      console.warn("audio error", err);
    }
  }

  function playLaserFireSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch (err) {
      console.warn("audio error", err);
    }
  }

  function unlockAudio() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      audioUnlockedRef.current = true;
    } catch { }
  }

  function playHitSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square"; // more "retro" undertale-ish
      osc.frequency.value = 260;

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch { }
  }

  function playHealSound(amount = 20) {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      const now = ctx.currentTime;

      if (amount >= 50) {
        // Stronger boss heal
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
        gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else {
        // Soft collection chime
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.15); // C6
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch { }
  }

  function playBossWarningSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sawtooth";
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 1.5);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
      gain.gain.linearRampToValueAtTime(0, now + 1.5);
      
      osc.start(now);
      osc.stop(now + 1.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch { }
  }

  function playLaserChargeSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sine";
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.linearRampToValueAtTime(2000, now + 1.0);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 1.0);
      
      osc.start(now);
      osc.stop(now + 1.0);
      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch { }
  }

  function playLaserFireSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "square";
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.4);
      
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      
      osc.start(now);
      osc.stop(now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch { }
  }

  function addShake(amount = 10, ms = 140) {
    const now = Date.now();
    shakeRef.current.amp = Math.max(shakeRef.current.amp, amount);
    shakeRef.current.until = Math.max(shakeRef.current.until, now + ms);
  }

  // keyboard
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
        e.preventDefault();
      }

      // Guard skill activation (SPACE)
      if ((k === " " || k === "space") && !e.repeat) {
        const now = Date.now();
        if (phaseRef.current === PHASE.PLAYING && isGuardReady(now)) {
          guardUntilRef.current = now + 1000; // 1s invincibility
          guardCdUntilRef.current = now + 5000; // 5s cooldown
          addShake(4, 80); // Small shake for feedback
        }
        // Don't add space to movement keys
        return;
      }

      // Sonic Boom activation (r)
      if (k === "r" && !e.repeat) {
        const rad = radianceBossRef.current;
        if (phaseRef.current === PHASE.PLAYING && rad.active && rad.orbCharge >= rad.orbChargeMax) {
          rad.orbCharge = 0;
          rad.collectibleOrb = null;
          rad.sonicBoomActive = true;
          rad.sonicBoomUntil = Date.now() + 500;
          rad.hp = Math.max(0, rad.hp - 20);
          addShake(20, 600);
          playLaserFireSound(); 
          
          // Spawn boom visuals
          radParticlesRef.current.booms.push({ r: 10, maxR: Math.max(window.innerWidth || 900, window.innerHeight || 600), life: 0.5, elapsed: 0 });
          radParticlesRef.current.booms.push({ r: 5, maxR: Math.max(window.innerWidth || 900, window.innerHeight || 600) * 0.8, life: 0.6, elapsed: 0, delay: 0.1 });
          
          // Spawn boss hit sparks
          const bx = (window.innerWidth || 900) / 2;
          const by = 120;
          for(let i = 0; i < 30; i++) {
             const ang = Math.random() * Math.PI * 2;
             const spd = 200 + Math.random() * 400;
             radParticlesRef.current.sparks.push({
               x: bx, y: by, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
               life: 0.3 + Math.random() * 0.4, elapsed: 0, r: 2 + Math.random() * 3,
               color: Math.random() > 0.5 ? "white" : "gold"
             });
          }

          if (rad.hp <= 0 && !rad.defeated) {
            rad.active = true; // Keep active briefly for death anim
            rad.defeated = true;
            rad.bossDeathAnimUntil = Date.now() + 1500;
            const currentElapsed = Date.now() - surviveStartRef.current;
            rad.bossPauseTotal = currentElapsed - rad.bossPauseStart;
            rad.homingOrbs = [];
            rad.lasers = [];
            rad.wallSpikes = [];
            
            // INCREASE MAX HP TO 150
            maxHpRef.current = 150;
            setHp(150);
            healTextRef.current = { text: "MAX HP INCREASED!", until: Date.now() + 3000 };
            setHpPulse(true);
            setTimeout(() => setHpPulse(false), 500);
            
            // Death explosion particles
            for(let i = 0; i < 60; i++) {
               const ang = Math.random() * Math.PI * 2;
               const spd = 100 + Math.random() * 600;
               radParticlesRef.current.sparks.push({
                 x: bx, y: by, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                 life: 0.8 + Math.random() * 0.7, elapsed: 0, r: 3 + Math.random() * 5,
                 color: "white"
               });
            }
          }
        }
        return;
      }

      keysRef.current.add(k);
    };

    const up = (e) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);

    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // --- socket lifecycle ---
  useEffect(() => {
    function onConnect() {
      setSocketStatus("connected");
      setMyId(socket.id);
    }

    function onDisconnect() {
      setSocketStatus("disconnected");
      phaseRef.current = PHASE.MENU;
      setPhase(PHASE.MENU);
      setRoomId(null);
      setStartAt(null);
      setWinnerId(null);
      setMatchInfo(null);
      lastResultRef.current = null;
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    socket.on("server:hello", ({ id }) => setMyId(id));

    socket.on("matchFound", ({ roomId, startAt, seed, mode, p1, p2 }) => {
      try {
        console.log("[matchFound]", { roomId, startAt, seed, mode, p1, p2 });

        // starting a brand‑new match – clear any previous results
        lastResultRef.current = null;

        setRoomId(roomId);
        setStartAt(startAt);
        if (typeof seed === "number") setSeed(seed);

        // Safely set matchInfo with optional chaining
        setMatchInfo({ mode: mode || "ranked", p1: p1 || null, p2: p2 || null });

        // Safe enemy identification
        const { enemyName: enemy, enemySocketId: eSocketId } = getEnemyInfo({ p1, p2, me });
        setEnemyName(enemy);
        setEnemySocketId(eSocketId);
        setEnemyHp(100);

        // Reset HP tracking
        prevHpRef.current = 100;

        setWinnerId(null);
        phaseRef.current = PHASE.MATCH_FOUND;
        setPhase(PHASE.MATCH_FOUND);

        setTimeout(() => {
          phaseRef.current = PHASE.COUNTDOWN;
          setPhase(PHASE.COUNTDOWN);
        }, 900);
      } catch (err) {
        console.error("[matchFound] error:", err);
        setFatalErr(err.message || "Failed to start match");
      }
    });

    socket.on("game:start", ({ roomId, startAt, seed }) => {
      try {
        console.log("[game:start]", { roomId, startAt, seed });

        setRoomId(roomId);
        setStartAt(startAt);
        if (typeof seed === "number") setSeed(seed);

        beginMatch(startAt, typeof seed === "number" ? seed : seedRef.current);
      } catch (err) {
        console.error("[game:start] error:", err);
        setFatalErr(err.message || "Failed to start game");
      }
    });

    socket.on("hpUpdate", (data) => {
      try {
        console.log("[hpUpdate]", data);
        const { targetSocketId, hp: newHp } = data;

        // Update enemy HP if this is the enemy
        if (targetSocketId === enemySocketId) {
          setEnemyHp(newHp);
        }
      } catch (err) {
        console.error("[hpUpdate] error:", err);
      }
    });

    socket.on("game:matchOver", (data) => {
      try {
        const { winnerId, loserId, winner, loser, mode } = data;

        // stash the result for the summary screen
        const myOldRating = me?.rating || 0;
        const myOldRank = me?.rank || "bronze";
        lastResultRef.current = { winner, loser, mode, myOldRating, myOldRank };

        // update the matchInfo record so avatars/badges show new ratings
        setMatchInfo((prev) => {
          if (!prev) return prev;
          let { p1, p2 } = prev;
          if (winner) {
            if (p1?.uid === winner.uid) p1 = { ...p1, ...winner };
            else if (p2?.uid === winner.uid) p2 = { ...p2, ...winner };
          }
          if (loser) {
            if (p1?.uid === loser.uid) p1 = { ...p1, ...loser };
            else if (p2?.uid === loser.uid) p2 = { ...p2, ...loser };
          }
          return { ...prev, p1, p2 };
        });

        endMatch(winnerId);

        // Update me state if ranked match and we have updated stats
        if (mode === "ranked" && onMeUpdate && me) {
          const myPid = me.id || me._id;
          if (winner && winner.pid === myPid) {
            onMeUpdate({
              ...me,
              rating: winner.rating,
              rank: winner.rank,
              wins: winner.wins,
              losses: winner.losses,
            });
          } else if (loser && loser.pid === myPid) {
            onMeUpdate({
              ...me,
              rating: loser.rating,
              rank: loser.rank,
              wins: winner?.wins || me?.wins || 0,
              losses: loser.losses,
            });
          }
        }

        // Show rank change toast for ranked matches
        if (mode === "ranked" && me) {
          const myPid = me.id;
          if (winner && winner.pid === myPid) {
            const delta = (winner.rating || 0) - (me.rating || 0);
            setRankChangeToast({
              delta,
              oldRating: me.rating,
              newRating: winner.rating,
              oldRank: me.rank,
              newRank: winner.rank,
            });
          } else if (loser && loser.pid === myPid) {
            const delta = (loser.rating || 0) - (me.rating || 0);
            setRankChangeToast({
              delta,
              oldRating: me.rating,
              newRating: loser.rating,
              oldRank: me.rank,
              newRank: loser.rank,
            });
          }
        }
      } catch (err) {
        console.error("[game:matchOver] error:", err);
        setFatalErr(err.message || "Match ended with error");
      }
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("server:hello");
      socket.off("matchFound");
      socket.off("game:start");
      socket.off("hpUpdate");
      socket.off("game:matchOver");
    };
  }, [enemySocketId]);

  // --- Time Trial immediate start ---
  useEffect(() => {
    if (mode !== "timeTrial") return;

    // Start immediately for time trial
    const localSeed = Math.floor(Math.random() * 1e9);
    setSeed(localSeed);

    setTimeout(() => {
      phaseRef.current = PHASE.COUNTDOWN;
      setPhase(PHASE.COUNTDOWN);

      const countdownStart = Date.now();
      const countdownDuration = 3000;
      const gameStart = countdownStart + countdownDuration;
      setStartAt(gameStart);

      setTimeout(() => {
        beginMatch(gameStart, localSeed);
      }, countdownDuration);
    }, 100);
  }, [mode]);

  useEffect(() => {
    if (phase !== PHASE.COUNTDOWN || !startAt) return;

    const t = setInterval(() => {
      const ms = startAt - Date.now();
      setCountdownMs(ms);
      if (ms <= 0) setCountdownMs(0);
    }, 50);

    return () => clearInterval(t);
  }, [phase, startAt]);

  // --- Time Trial: submit score when entering SUMMARY phase ---
  useEffect(() => {
    if (mode !== "timeTrial" || phase !== PHASE.SUMMARY) return;

    // Calculate survival time using frozen endAt timestamp
    const s = surviveStart;
    if (s <= 0) return;

    const finalTime = endAt ?? nowMs; // Use frozen endAt if available
    let survivalMs = finalTime - s;
    const radState = radianceBossRef.current;
    if (radState.triggered) {
        if (!radState.defeated) {
            survivalMs = radState.bossPauseStart;
        } else {
            survivalMs = Math.max(0, survivalMs - radState.bossPauseTotal);
        }
    }
    
    if (survivalMs > 0) {
      submitTimeTrialScore(survivalMs);
    }
  }, [mode, phase, surviveStart, endAt, nowMs]);

  function resetGameState() {
    setHp(100);
    setEnemyHp(100);
    setHitFlash(false);
    setHpPulse(false);
    bulletsRef.current = [];
    spawnRef.current = { nextSpawnAtMs: 0 };
    powerupRef.current = { active: null, nextSpawnAtMs: 10000, nextCorruptSpawnAtMs: 60000 };
    healTextRef.current = { text: "", until: 0 };
    bossRef.current = {
      state: "IDLE",
      animTime: 0,
      projectiles: [],
      lasers: [],
      nextAttackMs: 0,
      attackCount: 0,
    };
    lastHitAtRef.current = -9999;
    prevHpRef.current = 100;

    // Reset guard skill
    guardUntilRef.current = 0;
    guardCdUntilRef.current = 0;
    corruptHealUntilRef.current = 0;

    shakeRef.current = { until: 0, amp: 0 };
    maxHpRef.current = 100;
    radianceBossRef.current = {
      triggered: false,
      warning: false,
      active: false,
      defeated: false,
      warningStartMs: 0,
      bossStartMs: 0,
      hp: 100,
      phaseTimeMs: 0,
      attackType: null,
      nextAttackAtMs: 0,
      homingOrbs: [],
      lasers: [],
      wallSpikes: [],
      orbCharge: 0,
      orbChargeMax: 5,
      collectibleOrb: null,
      sonicBoomActive: false,
      sonicBoomUntil: 0,
      bossPauseStart: 0,
      bossPauseTotal: 0,
    };
    radParticlesRef.current = {
      ambient: [],
      sparks: [],
      booms: []
    };

    const c = canvasRef.current;
    const w = c?.width || 900;
    const h = c?.height || 520;

    playerRef.current = { x: w / 2, y: h / 2, r: 10 };
  }

  function beginMatch(serverStartAt, seedValue) {
    resetGameState();

    rngRef.current = mulberry32(Number(seedValue) || 123456);

    const base = serverStartAt || Date.now();
    surviveStartRef.current = base;
    setSurviveStart(base);

    // Reset end timestamp for new match
    endAtRef.current = null;
    setEndAt(null);

    setWinnerId(null);

    phaseRef.current = PHASE.PLAYING;
    setPhase(PHASE.PLAYING);

    loop._lastNow = undefined;

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }

  function endMatch(wid) {
    // Freeze the timer at the exact moment match ends
    const now = Date.now();
    endAtRef.current = now;
    setEndAt(now);

    setWinnerId(wid);
    phaseRef.current = PHASE.MATCH_OVER;
    setPhase(PHASE.MATCH_OVER);

    setTimeout(() => {
      cancelAnimationFrame(rafRef.current);
      phaseRef.current = PHASE.SUMMARY;
      setPhase(PHASE.SUMMARY);
    }, 1800);
  }

  function exitToMenu() {
    // ✅ If you leave mid-ranked match, count as forfeit (server will apply rating change)
    const rid = roomIdRef.current;
    lastResultRef.current = null;

    if (mode === "ranked" && phaseRef.current === PHASE.PLAYING && rid) {
      socket.emit("game:forfeit", { roomId: rid });
    }

    cancelAnimationFrame(rafRef.current);

    try {
      if (phaseRef.current === PHASE.QUEUE && mode !== "timeTrial") {
        socket.emit("matchmaking:leave");
      }
    } catch { }

    onExit?.();
  }

  function joinQueue() {
    unlockAudio();

    // TimeTrial mode: start immediately
    if (mode === "timeTrial") {
      return;
    }

    phaseRef.current = PHASE.QUEUE;
    setPhase(PHASE.QUEUE);
    socket.emit("matchmaking:join", { mode });
  }

  function leaveQueue() {
    socket.emit("matchmaking:leave");
    phaseRef.current = PHASE.MENU;
    setPhase(PHASE.MENU);
  }

  async function submitTimeTrialScore(timeMs) {
    try {
      setTimeTrialSubmissionStatus("submitting");
      setTimeTrialSubmissionMsg("Submitting...");

      const result = await submitTimeTrial(timeMs);

      if (result?.ok) {
        setBestTimeTrialMs(result.bestTimeTrialMs);
        setTimeTrialImproved(result.improved);

        if (result.improved) {
          setTimeTrialSubmissionStatus("success");
          setTimeTrialSubmissionMsg("New Personal Best! 🎉");
        } else {
          setTimeTrialSubmissionStatus("success");
          setTimeTrialSubmissionMsg("Time submitted");
        }
      } else {
        setTimeTrialSubmissionStatus("error");
        setTimeTrialSubmissionMsg(result?.error || "Could not submit time (offline?)");
      }
    } catch (e) {
      setTimeTrialSubmissionStatus("error");
      setTimeTrialSubmissionMsg("Error: " + String(e.message || e));
    }
  }

  // --- game loop ---
  function spawnBullets(w, h, difficulty = 0) {
    const rand = rngRef.current;
    const pattern = Math.floor(rand() * 3);

    // Scale particle count based on difficulty (4 to 12, slower growth)
    const scaledCount = Math.floor(4 + difficulty * 8);
    // Scale speed based on difficulty (60 to 150, slower growth)
    const speedScale = 60 + difficulty * 90;

    if (pattern === 0) {
      const cx = 80 + rand() * (w - 160);
      const cy = 80 + rand() * (h - 160);
      const count = scaledCount;
      const baseSpeed = 60 + difficulty * 50;
      const speed = baseSpeed + rand() * 90;

      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        bulletsRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          r: 6 + rand() * 3,
          alpha: 0.5 + difficulty * 0.5,
        });
      }
    } else if (pattern === 1) {
      const fromLeft = rand() < 0.5;
      // Scale rows from 3 to 8 based on difficulty (slower growth)
      const rows = Math.floor(3 + difficulty * 5);
      const baseSpeed = 60 + difficulty * 75;
      const speed = baseSpeed + rand() * 120;

      for (let i = 0; i < rows; i++) {
        const y = (i + 1) * (h / (rows + 1));
        bulletsRef.current.push({
          x: fromLeft ? -10 : w + 10,
          y,
          vx: fromLeft ? speed : -speed,
          vy: (rand() - 0.5) * 40,
          r: 7,
          alpha: 0.5 + difficulty * 0.5,
        });
      }
    } else {
      // Scale count from 3 to 11 based on difficulty (slower growth)
      const count = Math.floor(3 + difficulty * 8);
      const baseSpeed = 60 + difficulty * 90;
      const speed = baseSpeed + rand() * 120;

      for (let i = 0; i < count; i++) {
        bulletsRef.current.push({
          x: rand() * w,
          y: -12 - rand() * 120,
          vx: (rand() - 0.5) * 40,
          vy: speed,
          r: 6 + rand() * 2,
          alpha: 0.5 + difficulty * 0.5,
        });
      }
    }
  }

  function isIFrameActive(now) {
    return now - lastHitAtRef.current < 650;
  }

  function isGuardActive(now) {
    return now < guardUntilRef.current;
  }

  function isCorruptHealActive(now) {
    return now < corruptHealUntilRef.current;
  }

  function isGuardReady(now) {
    return now >= guardCdUntilRef.current;
  }

  function updateBoss(w, h, dt, elapsedMs) {
    const boss = bossRef.current;
    const p = playerRef.current;
    boss.animTime += dt;

    if (elapsedMs >= boss.nextAttackMs) {
      boss.attackCount++;
      const rand = rngRef.current;
      const attackType = Math.floor(rand() * 4);

      if (attackType === 0) {
        const isHoriz = rand() > 0.5;
        const gapSize = 140;
        const gapStart = 40 + rand() * (isHoriz ? h - 220 : w - 220);
        const speed = 250;
        const fromLeftOrTop = rand() > 0.5;

        const count = isHoriz ? h / 35 : w / 35;
        for (let i = 0; i <= count; i++) {
          const pos = i * 35;
          if (pos > gapStart && pos < gapStart + gapSize) continue;
          boss.projectiles.push({
            type: 'bone',
            x: isHoriz ? (fromLeftOrTop ? -30 : w + 30) : pos,
            y: isHoriz ? pos : (fromLeftOrTop ? -30 : h + 30),
            vx: isHoriz ? (fromLeftOrTop ? speed : -speed) : 0,
            vy: isHoriz ? 0 : (fromLeftOrTop ? speed : -speed),
            r: 12,
          });
        }
      } else if (attackType === 1) {
        const isHoriz = rand() > 0.5;
        boss.lasers.push({
          x: isHoriz ? w / 2 : p.x,
          y: isHoriz ? p.y : h / 2,
          isHoriz,
          chargeTime: 0.8,
          activeTime: 0.3,
          elapsed: 0,
          thick: 90,
        });
        playLaserChargeSound();
      } else if (attackType === 2) {
        const cx = w / 2;
        const cy = h / 2;
        const numBullets = 18;
        const angleOffset = rand() * Math.PI * 2;
        for (let i = 0; i < numBullets; i++) {
          boss.projectiles.push({
            type: 'ring',
            cx, cy,
            angle: angleOffset + (i / numBullets) * Math.PI * 2,
            radius: 500,
            r: 8,
            speed: 1.2,
            contractSpeed: 100
          });
        }
      } else if (attackType === 3) {
        const shiftX = (rand() - 0.5) * 100;
        const shiftY = (rand() - 0.5) * 100;
        boss.lasers.push({ x: p.x + shiftX, y: h / 2, isHoriz: false, chargeTime: 0.9, activeTime: 0.4, elapsed: 0, thick: 60 });
        boss.lasers.push({ x: w / 2, y: p.y + shiftY, isHoriz: true, chargeTime: 0.9, activeTime: 0.4, elapsed: 0, thick: 60 });
        playLaserChargeSound();
      }

      boss.nextAttackMs = Math.max(elapsedMs + 2200, elapsedMs + 1000 + rand() * 1200);
      if (attackType === 3 || attackType === 1) boss.nextAttackMs -= 400;
    }

    for (let i = boss.projectiles.length - 1; i >= 0; i--) {
      const pr = boss.projectiles[i];
      if (pr.type === 'bone') {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (pr.x < -100 || pr.x > w + 100 || pr.y < -100 || pr.y > h + 100) boss.projectiles.splice(i, 1);
      } else if (pr.type === 'ring') {
        pr.angle += pr.speed * dt;
        pr.radius -= pr.contractSpeed * dt;
        pr.x = pr.cx + Math.cos(pr.angle) * pr.radius;
        pr.y = pr.cy + Math.sin(pr.angle) * pr.radius;
        if (pr.radius <= 15) boss.projectiles.splice(i, 1);
      }
    }

    for (let i = boss.lasers.length - 1; i >= 0; i--) {
      const L = boss.lasers[i];
      const wasCharging = L.elapsed < L.chargeTime;
      L.elapsed += dt;
      const isCharging = L.elapsed < L.chargeTime;

      if (wasCharging && !isCharging) {
        playLaserFireSound();
        addShake(18, 200);
      }
      if (L.elapsed >= L.chargeTime + L.activeTime) {
        boss.lasers.splice(i, 1);
      }
    }
  }

  function loop() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    const now = Date.now();
    const prevNow = loop._lastNow ?? now;
    const dt = Math.min(0.03, (now - prevNow) / 1000);
    loop._lastNow = now;

    const keys = keysRef.current;
    const slow = keys.has("shift");
    let ax = 0,
      ay = 0;

    if (keys.has("w") || keys.has("arrowup")) ay -= 1;
    if (keys.has("s") || keys.has("arrowdown")) ay += 1;
    if (keys.has("a") || keys.has("arrowleft")) ax -= 1;
    if (keys.has("d") || keys.has("arrowright")) ax += 1;

    const len = Math.hypot(ax, ay) || 1;
    ax /= len;
    ay /= len;

    const speed = slow ? 150 : 260;

    const p = playerRef.current;
    p.x = clamp(p.x + ax * speed * dt, 18, w - 18);
    p.y = clamp(p.y + ay * speed * dt, 18, h - 18);
    // Calculate difficulty factor: 0 at start, 1 at 120 seconds (slower progression)
    let difficulty = 0;
    const base = surviveStartRef.current;
    if (base > 0) {
      const elapsedMs = now - base;
      difficulty = clamp(elapsedMs / 120000, 0, 1);

      const boss = bossRef.current;
      if (boss.state === "IDLE" && elapsedMs >= 30000) {
        boss.state = "WARNING";
        bulletsRef.current = []; // clear existing bullets cleanly
        addShake(20, 1500);
        playBossWarningSound();
      } else if (boss.state === "WARNING" && elapsedMs >= 33000) {
        boss.state = "ACTIVE";
        boss.nextAttackMs = elapsedMs + 1000;
      } else if (boss.state === "ACTIVE" && elapsedMs >= 63000) {
        boss.state = "DONE";
        boss.projectiles = [];
        boss.lasers = [];
        spawnRef.current.nextSpawnAtMs = elapsedMs + 1000; // brief pause after boss
        addShake(15, 500);

        // BOSS FIGHT HEAL
        setHp((old) => {
          const newHp = Math.min(maxHpRef.current, old + 50);
          if (newHp > old) playHealSound(50);
          return newHp;
        });
        healTextRef.current = { text: "+50 HP RESTORED", until: now + 2500 };
        setHpPulse(true);
        setTimeout(() => setHpPulse(false), 300);
      }

      const rad = radianceBossRef.current;
      if (!rad.triggered && elapsedMs >= 90000 && !rad.defeated) {
        rad.triggered = true;
        rad.warning = true;
        rad.warningStartMs = elapsedMs;
        rad.bossPauseStart = elapsedMs;
        bulletsRef.current = [];
        addShake(30, 3000);
        playBossWarningSound();
      } else if (rad.warning && elapsedMs >= rad.warningStartMs + 3000) {
        rad.warning = false;
        rad.active = true;
        rad.bossStartMs = elapsedMs;
        rad.phaseTimeMs = elapsedMs;
        rad.nextAttackAtMs = elapsedMs + 1500;
        rad.hp = 100;
        rad.orbCharge = 0;
        rad.collectibleOrb = { x: 50 + rngRef.current() * (w - 100), y: 50 + rngRef.current() * (h - 100), r: 10 };
      }

      if (rad.active && !rad.defeated) {
        // Handle Radiance Attacks
        if (elapsedMs >= rad.nextAttackAtMs) {
          const attackType = Math.floor(rngRef.current() * 3);
          rad.attackType = attackType;
          if (attackType === 0) {
             // following orbs
             rad.homingOrbs.push({ x: w/2, y: 100, vx: 0, vy: 0, r: 10 });
             rad.homingOrbs.push({ x: w/2 - 50, y: 100, vx: 0, vy: 0, r: 10 });
             rad.homingOrbs.push({ x: w/2 + 50, y: 100, vx: 0, vy: 0, r: 10 });
          } else if (attackType === 1) {
             // spikes at walls
             const isVert = rngRef.current() > 0.5;
             if (isVert) {
               rad.wallSpikes.push({ isVert: true, x: 20 + rngRef.current()*(w-40), y: 0, width: 50, length: 0, maxLength: h, state: "WARN", timer: 0 });
               rad.wallSpikes.push({ isVert: true, x: 20 + rngRef.current()*(w-40), y: 0, width: 50, length: 0, maxLength: h, state: "WARN", timer: 0 });
             } else {
               rad.wallSpikes.push({ isVert: false, x: 0, y: 20 + rngRef.current()*(h-40), width: 50, length: 0, maxLength: w, state: "WARN", timer: 0 });
               rad.wallSpikes.push({ isVert: false, x: 0, y: 20 + rngRef.current()*(h-40), width: 50, length: 0, maxLength: w, state: "WARN", timer: 0 });
             }
          } else if (attackType === 2) {
             // rotating lasers
             rad.lasers.push({ cx: w/2, cy: 120, angle: 0, rotSpeed: 1.5, length: 800, thick: 40, chargeTime: 1.0, activeTime: 2.0, elapsed: 0 });
             rad.lasers.push({ cx: w/2, cy: 120, angle: Math.PI, rotSpeed: 1.5, length: 800, thick: 40, chargeTime: 1.0, activeTime: 2.0, elapsed: 0 });
             playLaserChargeSound();
          }
          rad.nextAttackAtMs = elapsedMs + 3500 + rngRef.current() * 1500;
        }

        // Update attacks
        for (let i = rad.homingOrbs.length - 1; i >= 0; i--) {
           const orb = rad.homingOrbs[i];
           const dx = p.x - orb.x;
           const dy = p.y - orb.y;
           const dist = Math.hypot(dx, dy) || 1;
           const targetSpeed = 100;
           orb.vx += (dx / dist) * 150 * dt;
           orb.vy += (dy / dist) * 150 * dt;
           const curSpeed = Math.hypot(orb.vx, orb.vy);
           if (curSpeed > targetSpeed) {
              orb.vx = (orb.vx / curSpeed) * targetSpeed;
              orb.vy = (orb.vy / curSpeed) * targetSpeed;
           }
           orb.x += orb.vx * dt;
           orb.y += orb.vy * dt;
           if (elapsedMs > rad.bossStartMs + 60000 && curSpeed > 300) rad.homingOrbs.splice(i, 1);
        }

        for (let i = rad.wallSpikes.length - 1; i >= 0; i--) {
           const sp = rad.wallSpikes[i];
           sp.timer += dt;
           if (sp.state === "WARN" && sp.timer > 1.0) {
              sp.state = "EXTEND";
              sp.timer = 0;
           } else if (sp.state === "EXTEND") {
              sp.length += 800 * dt;
              if (sp.length >= sp.maxLength) { sp.length = sp.maxLength; sp.state = "RETRACT"; }
           } else if (sp.state === "RETRACT") {
              sp.length -= 400 * dt;
              if (sp.length <= 0) rad.wallSpikes.splice(i, 1);
           }
        }

        for (let i = rad.lasers.length - 1; i >= 0; i--) {
           const L = rad.lasers[i];
           const wasCharging = L.elapsed < L.chargeTime;
           L.elapsed += dt;
           if (wasCharging && L.elapsed >= L.chargeTime) {
               playLaserFireSound();
               addShake(12, 200);
           }
           if (L.elapsed >= L.chargeTime + L.activeTime) {
               rad.lasers.splice(i, 1);
           } else if (L.elapsed >= L.chargeTime) {
               L.angle += L.rotSpeed * dt;
           }
        }
        
        // Orb collection logic
        if (rad.collectibleOrb && !rad.sonicBoomActive) {
           const orb = rad.collectibleOrb;
           const dist = Math.hypot(p.x - orb.x, p.y - orb.y);
           if (dist < p.r + orb.r) {
              rad.orbCharge = Math.min(rad.orbChargeMax, rad.orbCharge + 1);
              playHealSound(20);
              rad.collectibleOrb = null;
              if (rad.orbCharge < rad.orbChargeMax) {
                 setTimeout(() => {
                    if (radianceBossRef.current.active && !radianceBossRef.current.sonicBoomActive) {
                       radianceBossRef.current.collectibleOrb = { x: 50 + rngRef.current() * (w - 100), y: 50 + rngRef.current() * (h - 100), r: 10 };
                    }
                 }, 600);
              }
           }
        }
        
        // Sonic boom ending
        if (rad.sonicBoomActive && Date.now() > rad.sonicBoomUntil) {
           rad.sonicBoomActive = false;
           rad.collectibleOrb = { x: 50 + rngRef.current() * (w - 100), y: 50 + rngRef.current() * (h - 100), r: 10 };
        }
      }

      const isBossTime = boss.state === "WARNING" || boss.state === "ACTIVE" || rad.warning || rad.active;

      let guard = 0;
      while (elapsedMs >= spawnRef.current.nextSpawnAtMs && guard < 50) {
        if (!isBossTime) {
          spawnBullets(w, h, difficulty);
        }
        // Scale gap: starts at 800ms, decreases to 500ms at max difficulty (slower decrease)
        let gap = 800 - difficulty * 300;
        gap = Math.max(350, gap);
        spawnRef.current.nextSpawnAtMs += gap;
        guard++;
      }

      if (boss.state === "ACTIVE") {
        updateBoss(w, h, dt, elapsedMs);
      }

      // POWERUP SPAWNING
      const pRef = powerupRef.current;
      if (!isBossTime) {
        if (elapsedMs >= pRef.nextCorruptSpawnAtMs) {
          if (!pRef.active) {
            const rand = rngRef.current;
            pRef.active = {
              x: 60 + rand() * (w - 120),
              y: 60 + rand() * (h - 120),
              r: 12,
              spawnedAtMs: elapsedMs,
              expiresAtMs: elapsedMs + 5000,
              kind: "CORRUPT_HEAL"
            };
          }
          pRef.nextCorruptSpawnAtMs = elapsedMs + 60000;
        } else if (elapsedMs >= pRef.nextSpawnAtMs) {
          if (!pRef.active) {
            const rand = rngRef.current;
            pRef.active = {
              x: 60 + rand() * (w - 120),
              y: 60 + rand() * (h - 120),
              r: 12,
              spawnedAtMs: elapsedMs,
              expiresAtMs: elapsedMs + 3000,
              kind: "HEAL"
            };
          }
          pRef.nextSpawnAtMs = elapsedMs + 10000; // next check in 10s
        }
      }

      // POWERUP EXPIRY
      if (pRef.active && elapsedMs > pRef.active.expiresAtMs) {
        pRef.active = null;
      }

    }

    const bullets = bulletsRef.current;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < -80 || b.x > w + 80 || b.y < -120 || b.y > h + 120) {
        bullets.splice(i, 1);
      }
    }

    function applyDamage(dmg, knockbackSource) {
      if (isCorruptHealActive(now)) {
        setHp((old) => {
          const nextHp = Math.min(maxHpRef.current, old + dmg);
          if (nextHp > old) playHealSound(20);
          return nextHp;
        });
        healTextRef.current = { text: `+${dmg} HP`, until: now + 1500 };
        setHpPulse(true);
        setTimeout(() => setHpPulse(false), 200);
        return;
      }

      lastHitAtRef.current = now;
      addShake(12, 160);
      playHitSound();

      // Trigger hit flash and pulse animation
      setHitFlash(true);
      setHpPulse(true);
      setTimeout(() => setHitFlash(false), 150);
      setTimeout(() => setHpPulse(false), 150);

      setHp((old) => {
        const nextHp = Math.max(0, old - dmg);

        // Check if HP decreased for animation
        if (nextHp < prevHpRef.current) {
          setHpPulse(true);
          setTimeout(() => setHpPulse(false), 150);
        }
        prevHpRef.current = nextHp;

        // Emit HP update to server (or locally for timeTrial)
        if (mode === "timeTrial") {
          if (nextHp === 0) {
            endMatch(socket.id);
          }
        } else {
          socket.emit("game:hp", { roomId: roomIdRef.current, hp: nextHp });
          if (nextHp === 0) {
            socket.emit("game:death", { roomId: roomIdRef.current });
          }
        }
        return nextHp;
      });

      if (knockbackSource) {
        const dx = knockbackSource.x - p.x;
        const dy = knockbackSource.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const push = 10;
        if (knockbackSource.r !== undefined) {
          knockbackSource.x += (dx / dist) * push;
          knockbackSource.y += (dy / dist) * push;
        }
      }
    }

    const invincible = isGuardActive(now) || isIFrameActive(now);
    const rad = radianceBossRef.current;
    
    if (!invincible) {
      let tookHit = false;

      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        const dist = Math.hypot(b.x - p.x, b.y - p.y);
        const hitRadius = p.r + b.r;
        if (dist < hitRadius) {
          tookHit = true;
          applyDamage(12, b);
          break;
        }
      }

      if (!tookHit && bossRef.current) {
        const boss = bossRef.current;
        for (let i = 0; i < boss.projectiles.length; i++) {
          const pr = boss.projectiles[i];
          const dist = Math.hypot(pr.x - p.x, pr.y - p.y);
          if (dist < p.r + pr.r - 2) {
            tookHit = true;
            applyDamage(12, pr);
            break;
          }
        }
      }

      if (!tookHit && bossRef.current) {
        const boss = bossRef.current;
        for (let i = 0; i < boss.lasers.length; i++) {
          const L = boss.lasers[i];
          if (L.elapsed > L.chargeTime) {
            const hit = L.isHoriz
              ? Math.abs(p.y - L.y) < L.thick / 2 + p.r - 2
              : Math.abs(p.x - L.x) < L.thick / 2 + p.r - 2;
            if (hit) {
              tookHit = true;
              applyDamage(20, null);
              break;
            }
          }
        }
      }

      if (!tookHit && rad.active && !rad.defeated) {
         // homing orbs
         for (const orb of rad.homingOrbs) {
            if (Math.hypot(orb.x - p.x, orb.y - p.y) < p.r + orb.r - 2) {
               tookHit = true; applyDamage(15, orb); break;
            }
         }
         // wall spikes
         if (!tookHit) {
            for (const sp of rad.wallSpikes) {
               if (sp.state === "EXTEND" || sp.state === "RETRACT") {
                  if (sp.isVert) {
                     if (Math.abs(p.x - sp.x) < sp.width/2 + p.r - 2 && p.y < sp.length) { tookHit = true; applyDamage(18, null); break; }
                  } else {
                     if (Math.abs(p.y - sp.y) < sp.width/2 + p.r - 2 && p.x < sp.length) { tookHit = true; applyDamage(18, null); break; }
                  }
               }
            }
         }
         // lasers
         if (!tookHit) {
            for (const L of rad.lasers) {
               if (L.elapsed >= L.chargeTime) {
                  const dx = p.x - L.cx;
                  const dy = p.y - L.cy;
                  const distToLine = Math.abs(dx * Math.sin(-L.angle) + dy * Math.cos(-L.angle));
                  const forwardDist = dx * Math.cos(L.angle) + dy * Math.sin(L.angle);
                  if (distToLine < L.thick/2 + p.r - 2 && forwardDist > 0 && forwardDist < L.length) {
                     tookHit = true; applyDamage(20, null); break;
                  }
               }
            }
         }
      }
    }
      
    // Update Visual Particles
    const rParticles = radParticlesRef.current;
      for (let i = rParticles.ambient.length - 1; i >= 0; i--) {
         const pVar = rParticles.ambient[i];
         pVar.elapsed += dt;
         pVar.y -= pVar.speed * dt;
         if (pVar.elapsed >= pVar.life) rParticles.ambient.splice(i, 1);
      }
      for (let i = rParticles.sparks.length - 1; i >= 0; i--) {
         const pVar = rParticles.sparks[i];
         pVar.elapsed += dt;
         pVar.x += pVar.vx * dt;
         pVar.y += pVar.vy * dt;
         pVar.vx *= 0.95; // drag
         pVar.vy *= 0.95;
         if (pVar.elapsed >= pVar.life) rParticles.sparks.splice(i, 1);
      }
      for (let i = rParticles.booms.length - 1; i >= 0; i--) {
         const b = rParticles.booms[i];
         if (b.delay && b.delay > 0) {
             b.delay -= dt;
         } else {
             b.elapsed += dt;
             b.r = (b.elapsed / b.life) * b.maxR;
             if (b.elapsed >= b.life) rParticles.booms.splice(i, 1);
         }
      }
      
      // Spawn Boss Ambient Particles
      if (rad.active && !rad.defeated) {
         if (rParticles.ambient.length < 80 && Math.random() > 0.5) {
            rParticles.ambient.push({
               x: w/2 + (Math.random()-0.5) * 600,
               y: 120 + (Math.random()-0.5) * 300,
               life: 2 + Math.random() * 3,
               elapsed: 0,
               speed: 10 + Math.random() * 30,
               r: 1 + Math.random() * 3,
               opacity: 0.2 + Math.random() * 0.4
            });
         }
      }

    // POWERUP COLLECTION
    const pRef = powerupRef.current;
    if (pRef.active) {
      const dist = Math.hypot(pRef.active.x - p.x, pRef.active.y - p.y);
      if (dist < p.r + pRef.active.r) {
        if (pRef.active.kind === "HEAL") {
          setHp((old) => {
            const nextHp = Math.min(maxHpRef.current, old + 20);
            if (nextHp > old) playHealSound(20);
            return nextHp;
          });
          healTextRef.current = { text: "+20 HP", until: now + 1500 };
          setHpPulse(true);
          setTimeout(() => setHpPulse(false), 200);
        } else if (pRef.active.kind === "CORRUPT_HEAL") {
          corruptHealUntilRef.current = now + 5000;
          playHealSound(50); // play slightly louder sound for pickup
          addShake(8, 200);
        }
        pRef.active = null; // consume
      }
    }

    ctx.clearRect(0, 0, w, h);

    // screen shake
    let sx = 0,
      sy = 0;
    if (now < shakeRef.current.until) {
      const remain = shakeRef.current.until - now;
      const t01 = clamp(remain / 160, 0, 1);
      const amp = shakeRef.current.amp * t01;
      sx = randSigned() * amp;
      sy = randSigned() * amp;
    } else {
      shakeRef.current.amp = 0;
    }

    ctx.save();
    ctx.translate(sx, sy);

    // ====== THEME: BLACK + WHITE LINES (keep heart color unchanged) ======
    // background
    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect(0, 0, w, h);

    // arena border (white)
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    // inner thin lines for undertale-ish vibe
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(18, 18, w - 36, h - 36);
    ctx.strokeRect(28, 28, w - 56, h - 56);

    // subtle scanlines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let y = 12; y < h; y += 8) {
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
    }

    // bullets (white outlines with difficulty-based brightness)
    ctx.fillStyle = "rgba(0,0,0,0)"; // no fill
    for (const b of bullets) {
      // Scale alpha with difficulty for visual intensity
      const alpha = b.alpha !== undefined ? b.alpha : (0.5 + difficulty * 0.5);
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, alpha)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const boss = bossRef.current;
    if (boss && boss.state === "WARNING") {
      ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
      ctx.fillRect(0, 0, w, h);

      const flash = Math.floor(now / 150) % 2 === 0;
      if (flash) {
        ctx.fillStyle = "white";
        ctx.font = "900 64px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("WARNING", w / 2, h / 2 - 40);
        ctx.fillStyle = "red";
        ctx.font = "900 48px monospace";
        ctx.fillText("BOSS INCOMING", w / 2, h / 2 + 30);
      }
    }

    if (boss && boss.state === "ACTIVE") {
      ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("BOSS PHASE", w / 2, 30);

      const bx = w / 2;
      const by = 80 + Math.sin(boss.animTime * 3) * 10;

      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(bx, by, 30, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "black";
      ctx.beginPath();
      ctx.arc(bx - 12, by - 5, 8, 0, Math.PI * 2);
      ctx.arc(bx + 12, by - 5, 8, 0, Math.PI * 2);
      ctx.fill();

      if (rngRef.current() > 0.95) {
        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.arc(bx - 12, by - 5, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "black";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(bx, by + 5, 12, 0.2, Math.PI - 0.2);
      ctx.stroke();

      for (const pr of boss.projectiles) {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const L of boss.lasers) {
        if (L.elapsed < L.chargeTime) {
          ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
          if (L.isHoriz) {
            ctx.fillRect(0, L.y - 2, w, 4);
          } else {
            ctx.fillRect(L.x - 2, 0, 4, h);
          }
        } else {
          const activeRatio = (L.elapsed - L.chargeTime) / L.activeTime;
          const fade = 1 - activeRatio;
          ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
          ctx.shadowColor = "red";
          ctx.shadowBlur = 15;
          const th = L.thick * (1 - activeRatio * 0.2);
          if (L.isHoriz) {
            ctx.fillRect(0, L.y - th / 2, w, th);
          } else {
            ctx.fillRect(L.x - th / 2, 0, th, h);
          }
          ctx.shadowBlur = 0;
        }
      }
    }

    if (rad.warning) {
       ctx.fillStyle = "rgba(255, 230, 100, 0.15)";
       ctx.fillRect(0, 0, w, h);
       const flash = Math.floor(now / 150) % 2 === 0;
       if (flash) {
         ctx.fillStyle = "white";
         ctx.font = "900 64px monospace";
         ctx.textAlign = "center";
         ctx.textBaseline = "middle";
         ctx.shadowColor = "gold";
         ctx.shadowBlur = 20;
         ctx.fillText("DIVINE PRESENCE", w / 2, h / 2 - 40);
         ctx.fillStyle = "gold";
         ctx.font = "900 48px monospace";
         ctx.fillText("APPROACHING", w / 2, h / 2 + 30);
         ctx.shadowBlur = 0;
       }
    }

    if (rad.active) {
       // Arena Glow
       ctx.fillStyle = rad.defeated ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 240, 180, 0.05)";
       ctx.fillRect(0, 0, w, h);

       const bx = w / 2;
       const by = 120 + Math.sin(now / 500) * 15;
       
       // Draw Boss Entity
       if (!rad.defeated) {
          ctx.save();
          ctx.translate(bx, by);
          
          // Outer Halo
          ctx.shadowColor = "gold";
          ctx.shadowBlur = 40;
          ctx.fillStyle = "rgba(255, 255, 200, 0.2)";
          ctx.beginPath();
          ctx.arc(0, 0, 100 + Math.sin(now/200)*10, 0, Math.PI*2);
          ctx.fill();

          // Rotating Aura Ring
          ctx.rotate(now / 1500);
          ctx.strokeStyle = "rgba(255, 215, 0, 0.5)";
          ctx.lineWidth = 4;
          for (let i = 0; i < 8; i++) {
             ctx.beginPath();
             ctx.moveTo(80, 0);
             ctx.lineTo(110, 0);
             ctx.stroke();
             ctx.rotate((Math.PI * 2) / 8);
          }
          
          ctx.rotate(-now / 1500 * 2); // reverse core rotation
          // Crown / Sun Spikes
          ctx.fillStyle = "white";
          for (let i = 0; i < 12; i++) {
             ctx.beginPath();
             ctx.moveTo(30, 0);
             ctx.lineTo(15, 15);
             ctx.lineTo(80 + Math.sin(now/150 + i)*15, 0);
             ctx.lineTo(15, -15);
             ctx.fill();
             ctx.rotate((Math.PI * 2) / 12);
          }

          // Core Body
          ctx.shadowBlur = 20;
          ctx.shadowColor = "white";
          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(0, 0, 35, 0, Math.PI * 2);
          ctx.fill();

          // Inner Eye
          ctx.fillStyle = "rgba(255, 200, 0, 0.8)";
          ctx.beginPath();
          ctx.ellipse(0, 0, 10, 20, 0, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
          
          // Boss HUD
          ctx.fillStyle = "gold";
          ctx.font = "bold 20px monospace";
          ctx.textAlign = "center";
          ctx.fillText("RADIANCE", w / 2, 30);
          
          // Boss HP Bar
          ctx.fillStyle = "rgba(50, 0, 0, 0.5)";
          ctx.fillRect(w/2 - 150, 45, 300, 15);
          ctx.fillStyle = "rgba(255, 215, 0, 0.9)";
          const hpRatio = rad.hp / 100;
          ctx.fillRect(w/2 - 150, 45, 300 * hpRatio, 15);
          ctx.strokeStyle = "white";
          ctx.lineWidth = 2;
          ctx.strokeRect(w/2 - 150, 45, 300, 15);
          
          // Orb Charge UI
          if (!rad.sonicBoomActive) {
             const chargeText = rad.orbCharge >= rad.orbChargeMax ? "PRESS R - SONIC BOOM READY" : `CHARGE: ${rad.orbCharge} / ${rad.orbChargeMax}`;
             ctx.fillStyle = rad.orbCharge >= rad.orbChargeMax ? "white" : "gold";
             ctx.font = rad.orbCharge >= rad.orbChargeMax ? "bold 24px monospace" : "18px monospace";
             ctx.shadowColor = "gold";
             ctx.shadowBlur = rad.orbCharge >= rad.orbChargeMax ? 15 : 0;
             if (rad.orbCharge >= rad.orbChargeMax && Math.floor(now/100)%2===0) {
                 ctx.shadowBlur = 25;
                 ctx.fillStyle = "rgba(255, 255, 200, 1)";
             }
             ctx.fillText(chargeText, w / 2, h - 30);
             ctx.shadowBlur = 0;
          }
       }

       // Radiance Particles
       const rPart = radParticlesRef.current;
       ctx.save();
       ctx.globalCompositeOperation = "screen";
       for (const pVar of rPart.ambient) {
          ctx.fillStyle = `rgba(255, 240, 150, ${pVar.opacity})`;
          ctx.beginPath(); ctx.arc(pVar.x, pVar.y, pVar.r, 0, Math.PI*2); ctx.fill();
       }
       for (const pVar of rPart.sparks) {
          ctx.fillStyle = pVar.color;
          ctx.shadowColor = pVar.color;
          ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(pVar.x, pVar.y, pVar.r, 0, Math.PI*2); ctx.fill();
       }
       for (const b of rPart.booms) {
          if (!b.delay || b.delay <= 0) {
              ctx.strokeStyle = `rgba(255, 255, 255, ${1 - b.elapsed/b.life})`;
              ctx.lineWidth = 15 * (1 - b.elapsed/b.life);
              ctx.shadowColor = "white";
              ctx.shadowBlur = 20;
              ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI*2); ctx.stroke();
          }
       }
       ctx.restore();

       // Draw Attacks
       for (const orb of rad.homingOrbs) {
          ctx.shadowColor = "gold";
          ctx.shadowBlur = 15;
          ctx.fillStyle = "white";
          ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = "gold"; ctx.lineWidth = 3; ctx.stroke();
          ctx.shadowBlur = 0;
       }

       for (const sp of rad.wallSpikes) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.shadowColor = "gold"; ctx.shadowBlur = 15;
          if (sp.isVert) {
             if (sp.state === "WARN") {
                ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
                ctx.fillRect(sp.x - sp.width/2, 0, sp.width, h);
             } else {
                ctx.fillRect(sp.x - sp.width/2, 0, sp.width, sp.length);
             }
          } else {
             if (sp.state === "WARN") {
                ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
                ctx.fillRect(0, sp.y - sp.width/2, w, sp.width);
             } else {
                ctx.fillRect(0, sp.y - sp.width/2, sp.length, sp.width);
             }
          }
          ctx.shadowBlur = 0;
       }

       for (const L of rad.lasers) {
          if (L.elapsed < L.chargeTime) {
             ctx.fillStyle = "rgba(255, 215, 0, 0.2)";
             ctx.save(); ctx.translate(L.cx, L.cy); ctx.rotate(L.angle);
             ctx.fillRect(0, -L.thick/2, L.length, L.thick);
             ctx.restore();
          } else {
             const activeRatio = (L.elapsed - L.chargeTime) / L.activeTime;
             const fade = 1 - activeRatio;
             ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
             ctx.shadowColor = "gold"; ctx.shadowBlur = 25;
             ctx.save(); ctx.translate(L.cx, L.cy); ctx.rotate(L.angle);
             const th = L.thick * (1 - activeRatio * 0.3);
             ctx.fillRect(0, -th/2, L.length, th);
             ctx.restore();
             ctx.shadowBlur = 0;
          }
       }

       // Collectible Radiant Orbs
       if (rad.collectibleOrb && !rad.sonicBoomActive) {
          const orb = rad.collectibleOrb;
          ctx.shadowColor = "white"; ctx.shadowBlur = 15;
          ctx.fillStyle = "gold";
          ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r + Math.sin(now/100)*2, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = "white";
          ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r*0.4, 0, Math.PI*2); ctx.fill();
          ctx.shadowBlur = 0;
       }
    }

    // Draw Powerup
    const powerup = powerupRef.current?.active;
    if (powerup) {
      const pr = powerup.r;
      const px = powerup.x;
      const py = powerup.y;

      // Subtle pulse animation
      const pAlpha = 0.6 + 0.4 * Math.abs(Math.sin(now / 150));

      ctx.save();
      ctx.translate(px, py);

      if (powerup.kind === "HEAL") {
        // Highlight aura
        ctx.shadowColor = "rgba(100, 255, 100, 0.8)";
        ctx.shadowBlur = 10;

        // Plus sign (Green/White)
        ctx.fillStyle = `rgba(200, 255, 200, ${pAlpha})`;
        const th = pr * 0.4;
        ctx.fillRect(-pr, -th / 2, pr * 2, th); // Horizontal
        ctx.fillRect(-th / 2, -pr, th, pr * 2); // Vertical

        // Outline around plus sign
        ctx.strokeStyle = `rgba(255, 255, 255, ${pAlpha * 0.8})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, pr + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else if (powerup.kind === "CORRUPT_HEAL") {
        // Rotating glitchy diamond for corrupt heal
        ctx.shadowColor = "rgba(180, 50, 255, 0.8)";
        ctx.shadowBlur = 15;

        ctx.rotate(now / 300);

        ctx.fillStyle = `rgba(180, 50, 255, ${pAlpha})`;
        ctx.beginPath();
        ctx.moveTo(0, -pr - 4);
        ctx.lineTo(pr + 4, 0);
        ctx.lineTo(0, pr + 4);
        ctx.lineTo(-pr - 4, 0);
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 200, 255, ${pAlpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner core
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.arc(0, 0, pr * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Glitch effect
        if (Math.random() > 0.8) {
          ctx.fillStyle = "rgba(255, 0, 0, 0.6)";
          ctx.fillRect(-pr, -3, pr * 2, 6);
        }
      }

      ctx.restore();
    }

    // Draw guard ring if active
    if (isGuardActive(now)) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw corrupt heal ring if active
    if (isCorruptHealActive(now)) {
      ctx.strokeStyle = `rgba(180, 50, 255, ${0.4 + 0.4 * Math.sin(now / 100)})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // player heart (KEEP ORIGINAL COLOR)
    const iframe = isIFrameActive(now);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = iframe ? 0.55 : 1;
    ctx.fillStyle = "rgba(255, 80, 120, 0.98)"; // ✅ unchanged
    drawHeart(ctx, 0, 0, 12);
    ctx.restore();

    // Draw Heal Floating Text (HUD level)
    const healMsg = healTextRef.current;
    if (now < healMsg.until) {
      const remain = healMsg.until - now;
      const tAlpha = clamp(remain / 400, 0, 1);
      const floatY = 40 - clamp((1500 - remain) / 30, 0, 15);

      ctx.fillStyle = `rgba(150, 255, 150, ${tAlpha})`;
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0, 255, 0, 0.5)";
      ctx.shadowBlur = 5;

      // Draw centered above player if +20, or high up if +50
      if (healMsg.text.includes("50")) {
        ctx.fillText(healMsg.text, w / 2, h / 2 - 80 - (2500 - remain) / 50);
      } else {
        ctx.fillText(healMsg.text, p.x, p.y - floatY);
      }
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    if (phaseRef.current === PHASE.PLAYING) {
      rafRef.current = requestAnimationFrame(loop);
    }
  }

  // normalize left/right order once per render
  const { left, right, iAmLeft } = normalizePlayers({
    me,
    matchInfo,
    mySocketId: myId,
  });
  const vsMode = matchInfo?.mode || mode;
  const vsLeft = left;
  const vsRight = right;

  // Compute guard status for HUD display
  const guardCdRem = Math.max(0, guardCdUntilRef.current - nowMs);
  const guardStatus = guardCdRem <= 0 ? "READY" : (guardCdRem / 1000).toFixed(1) + "s";

  // derive text for summary card
  const lastResult = lastResultRef.current;
  let rankChangeText = vsMode === "ranked" ? "" : "— (friend match)";
  let summaryText = "";
  if (lastResult) {
    if (lastResult.mode === "ranked") {
      const myPid = me?.id || me?._id;
      let delta = 0;
      let newRank;
      if (lastResult.winner && lastResult.winner.pid === myPid) {
        delta = (lastResult.winner.rating || 0) - (lastResult.myOldRating || 0);
        newRank = lastResult.winner.rank;
      } else if (lastResult.loser && lastResult.loser.pid === myPid) {
        delta = (lastResult.loser.rating || 0) - (lastResult.myOldRating || 0);
        newRank = lastResult.loser.rank;
      }
      rankChangeText = delta >= 0 ? `+${delta}` : `${delta}`;
      if (lastResult.myOldRank && newRank && newRank !== lastResult.myOldRank) {
        rankChangeText += ` (${rankLabel(lastResult.myOldRank)}→${rankLabel(newRank)})`;
      }
    }

    if (lastResult.winner) {
      const winnerName = safeUsername(lastResult.winner.username);
      const loserName = safeUsername(lastResult.loser?.username || "");
      const myPid = me?.id || me?._id;
      if (lastResult.winner.pid === myPid) {
        summaryText = `You defeated ${loserName}`;
      } else if (lastResult.loser && lastResult.loser.pid === myPid) {
        summaryText = `Lost to ${winnerName}`;
      } else {
        summaryText = `${winnerName} defeated ${loserName}`;
      }
    }
  }

  // === FATAL ERROR FALLBACK UI ===
  if (fatalErr) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-red-500 mb-4">Error</div>
          <div className="text-white/80 mb-6">{fatalErr}</div>
          <button
            onClick={() => {
              setFatalErr("");
              exitToMenu();
            }}
            className="px-6 py-3 rounded-xl border-2 border-white hover:bg-white/10 font-semibold"
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  // Determine if we should show the header bar (COUNTDOWN or PLAYING)
  const showHeaderBar = phase === PHASE.COUNTDOWN || phase === PHASE.PLAYING;

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-5xl">
        {/* Top info bar - hidden during PLAYING to reduce clutter */}
        {phase !== PHASE.PLAYING && (
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-white/80">
              <span className="font-semibold text-white">
                Soul Duel {vsMode === "ranked" ? "• Ranked" : vsMode === "friend" ? "• Friend" : "• Solo Time Trial"}
              </span>{" "}
              <span className="opacity-70">•</span>{" "}
              <span className="opacity-80">socket:</span> {socketStatus}
            </div>
            <div className="text-xs text-white/60">
              id: <span className="text-white/80">{myId || "..."}</span>
            </div>
          </div>
        )}

        <div className="relative rounded-2xl border border-white/30 bg-black shadow-xl overflow-hidden">
          {/* Header Bar - shown during COUNTDOWN and PLAYING */}
          <HeaderBar
            myName={myName}
            oppName={opponentName}
            hp={hp}
            timerText={timerText}
            hpHitPulse={hpPulse}
            phase={phase}
            guardStatus={guardStatus}
            corruptHealRem={Math.max(0, (corruptHealUntilRef.current - nowMs) / 1000)}
          />

          {/* Menu Phase: Top HUD */}
          {phase === PHASE.MENU && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
              <div className="flex items-center gap-3">
                <div className="text-sm">
                  <div className="text-white/60 text-xs">HP</div>
                  <div className="font-semibold">{hp}</div>
                </div>
                <div className="h-8 w-px bg-white/20" />
                <div className="text-sm">
                  <div className="text-white/60 text-xs">Survival</div>
                  <div className="font-semibold">0:00</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-white/60">
                  Controls: <span className="text-white">WASD/Arrows</span> •{" "}
                  <span className="text-white">Shift</span> slow
                </div>
                <button
                  onClick={exitToMenu}
                  className="ml-3 px-3 py-1.5 rounded-lg border border-white/30 hover:bg-white/10 text-xs"
                >
                  Exit
                </button>
              </div>
            </div>
          )}

          {/* Non-PLAYING phases: show room info when applicable */}
          {phase !== PHASE.PLAYING && phase !== PHASE.MENU && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/20 bg-black/40">
              <div className="text-xs text-white/60">
                Room: <span className="text-white/80 font-mono">{roomId ? roomId.slice(0, 20) + "…" : "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-white/60">
                  Controls: <span className="text-white">WASD/Arrows</span> •{" "}
                  <span className="text-white">Shift</span> slow
                </div>
                <button
                  onClick={exitToMenu}
                  className="ml-3 px-3 py-1.5 rounded-lg border border-white/30 hover:bg-white/10 text-xs"
                >
                  Exit
                </button>
              </div>
            </div>
          )}

          {/* Fixed canvas wrapper - px-4 pb-4 */}
          <div className="px-4 pb-4">
            <canvas
              ref={canvasRef}
              width={980}
              height={540}
              className="w-full rounded-xl border border-white/25 bg-black"
            />
          </div>

          {/* MENU Overlay - not shown for time trial */}
          {phase === PHASE.MENU && mode !== "timeTrial" && (
            <Overlay>
              <div className="text-center">
                <div className="text-4xl font-extrabold tracking-tight">SOUL DUEL</div>
                <div className="mt-2 text-white/80">
                  {vsMode === "ranked"
                    ? "Ranked matchmaking. Win +10, Lose -20."
                    : "Friend match. No rank change."}
                </div>

                <button
                  onClick={joinQueue}
                  className="mt-6 px-6 py-3 rounded-xl border-2 border-white hover:bg-white/10 font-semibold"
                >
                  {vsMode === "ranked" ? "Start Ranked Match" : "Find Friend Match"}
                </button>

                <button
                  onClick={exitToMenu}
                  className="mt-3 px-6 py-2 rounded-xl border border-white/40 hover:bg-white/10"
                >
                  Back to Main Menu
                </button>

                <div className="mt-2 text-[11px] text-white/50">
                  Seed: <span className="text-white/80">{seed}</span>
                </div>
              </div>
            </Overlay>
          )}

          {/* QUEUE Overlay - not shown for time trial */}
          {phase === PHASE.QUEUE && mode !== "timeTrial" && (
            <Overlay>
              <div className="text-center">
                <div className="text-2xl font-bold">Finding match…</div>
                <div className="mt-2 text-white/80">
                  {vsMode === "ranked"
                    ? "Queued for ranked. Waiting for another player."
                    : "Waiting for a friend invite / pairing."}
                </div>

                <button
                  onClick={leaveQueue}
                  className="mt-6 px-5 py-2 rounded-xl border border-white/40 hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </Overlay>
          )}

          {/* MATCH_FOUND Overlay - clean centered layout */}
          {phase === PHASE.MATCH_FOUND && (
            <Overlay>
              <div className="text-center">
                <div className="text-[56px] leading-none font-black tracking-[0.12em]">
                  MATCH FOUND
                </div>

                {/* Clean names line - truncate if too long */}
                <div className="mt-8 text-3xl font-black font-mono tracking-wider text-white max-w-full truncate">
                  {myName} VS {opponentName}
                </div>

                <div className="mt-6 text-white/70 uppercase tracking-widest text-xs">
                  LOCKING AGENTS • PREPARING ARENA
                </div>
              </div>
            </Overlay>
          )}

          {/* COUNTDOWN Overlay - center countdown, below show names */}
          {phase === PHASE.COUNTDOWN && (
            <Overlay>
              <div className="text-center">
                <div className="text-2xl font-bold">Match starting</div>
                <div className="mt-2 text-white/80">Get ready…</div>

                <div className="mt-6 text-6xl font-extrabold tabular-nums">
                  {Math.max(0, Math.ceil(countdownMs / 1000))}
                </div>

                <div className="mt-3 text-xs text-white/60 uppercase tracking-widest">
                  Do not alt-tab. Dodge everything.
                </div>
              </div>
            </Overlay>
          )}

          {/* MATCH_OVER Overlay */}
          {phase === PHASE.MATCH_OVER && (
            <Overlay>
              <div className="text-center">
                <div
                  className={
                    "text-5xl font-black tracking-tight " +
                    (iAmWinner ? "animate-pulse" : "opacity-90")
                  }
                >
                  {iAmWinner ? "MATCH WON" : "MATCH LOST"}
                </div>
                <div className="mt-3 text-white/80">
                  {iAmWinner ? "Clean dodges." : "You got clipped."}
                </div>
                <div className="mt-4 text-2xl font-bold font-mono text-white/70">
                  Time: {timerText}
                </div>
              </div>
            </Overlay>
          )}

          {/* SUMMARY Overlay */}
          {phase === PHASE.SUMMARY && (
            <Overlay>
              <div className="text-center max-w-xl">
                {mode === "timeTrial" ? (
                  <>
                    <div className="text-3xl font-extrabold">
                      {hp > 0 ? "Survived" : "Game Over"}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-left">
                      <Stat label="Survival Time" value={timerText} />
                      <Stat label="HP Remaining" value={String(hp)} />
                      {bestTimeTrialMs > 0 && (
                        <>
                          <Stat label="Best Time" value={fmtMs(bestTimeTrialMs)} />
                          <Stat
                            label="Status"
                            value={timeTrialImproved ? "New Best!" : "Submitted"}
                          />
                        </>
                      )}
                    </div>

                    {timeTrialSubmissionStatus && (
                      <div className={`mt-3 text-sm font-mono ${timeTrialSubmissionStatus === "success" ? "text-green-400" :
                          timeTrialSubmissionStatus === "error" ? "text-red-400" :
                            "text-white/80"
                        }`}>
                        {timeTrialSubmissionMsg}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-extrabold">
                      {iAmWinner ? "Victory" : "Defeat"}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-left">
                      <Stat label="Survival Time" value={timerText} />
                      <Stat label="HP Remaining" value={String(hp)} />
                      <Stat label="Rank Change" value={rankChangeText || "—"} />
                      <Stat label="Summary" value={summaryText || ""} />
                    </div>
                  </>
                )}

                <button
                  onClick={exitToMenu}
                  className="mt-6 px-5 py-2 rounded-xl border-2 border-white hover:bg-white/10 font-semibold"
                >
                  Back to Main Menu
                </button>
              </div>
            </Overlay>
          )}
        </div>
      </div>

      {rankChangeToast && (
        <RankChangeToast
          {...rankChangeToast}
          onComplete={() => setRankChangeToast(null)}
        />
      )}
    </div>
  );
}

/* ---------- helpers/components ---------- */

function Overlay({ children }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/85 backdrop-blur-[1px] pointer-events-none">
      <div className="px-6 py-8 pointer-events-auto">{children}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-white/30 bg-black p-3">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

// Canvas heart shape
function drawHeart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s / 4);
  ctx.bezierCurveTo(x, y, x - s / 2, y, x - s / 2, y + s / 4);
  ctx.bezierCurveTo(x - s / 2, y + s / 2, x, y + (s * 3) / 4, x, y + s);
  ctx.bezierCurveTo(
    x,
    y + (s * 3) / 4,
    x + s / 2,
    y + s / 2,
    x + s / 2,
    y + s / 4
  );
  ctx.bezierCurveTo(x + s / 2, y, x, y, x, y + s / 4);
  ctx.closePath();
  ctx.fill();
}

