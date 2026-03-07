// client/src/Game.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "./socket";
import { submitTimeTrial, unlockBoss } from "./api";
import RankBadge from "./ui/RankBadge";
import RankChangeToast from "./ui/RankChangeToast";
import radianceMusicAsset from "../assets/music/RadiantBossFight.mp3";

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
function HeaderBar({
  myName, oppName,
  hp, enemyHp,
  timerText,
  hpHitPulse, enemyHitFlash, enemyHpPulse, enemyHealFlash,
  phase, guardStatus, corruptHealRem,
  isCompetitive, isStandaloneSans
}) {
  const showBar = phase === PHASE.COUNTDOWN || phase === PHASE.PLAYING;

  if (!showBar) return null;

  const isCorruptActive = corruptHealRem > 0;
  const showEnemyHp = isCompetitive || isStandaloneSans;

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

      {/* Right: HP + Guard - w-[38%] flex justify-end gap-6 */}
      <div className="w-[38%] flex justify-end items-center gap-6">
        {/* Opponent HP Display (Competitive) */}
        {showEnemyHp && oppName && (
          <div className="flex flex-col items-end opacity-80">
            <div className="text-[10px] text-white/50 mb-[-4px]">{isStandaloneSans ? 'BOSS HP' : 'OPP HP'}</div>
            <div className={`font-mono text-2xl tabular-nums transition-all duration-150 ${enemyHitFlash ? 'text-red-400 scale-110' : enemyHealFlash ? 'text-lime-300 scale-110' : 'text-gray-300'}`}>
              {enemyHpPulse ? '...' : enemyHp}
            </div>
          </div>
        )}

        {/* My HP Display */}
        <div className="flex items-center gap-2 border-l border-white/20 pl-4">
          <div className="flex flex-col items-center">
            {isCorruptActive && (
              <div className="text-[10px] font-bold text-purple-400 font-mono bg-purple-900/40 px-1 rounded animate-pulse absolute -top-4">
                REV: {corruptHealRem.toFixed(1)}s
              </div>
            )}
            <div className="flex items-center">
              <span className={`font-mono text-3xl tabular-nums transition-all duration-150 ${hpHitPulse ? 'text-red-400 scale-110' : 'text-white'}`}>
                {hp}
              </span>
              <span className="ml-1 text-xs text-white/50 font-mono">HP</span>
            </div>
          </div>
          <div className="text-xs text-white/70 font-mono bg-white/10 px-2 py-1 rounded hidden sm:block">
            GUARD: <span className={guardStatus === "READY" ? "text-lime-400" : "text-white/60"}>{guardStatus}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Game({
  me,
  token,
  mode = "ranked",
  bossId = null,
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

  // ====== Radiance Boss Music Setup ======
  const radianceMusicRef = useRef(null);
  const radianceFadeRef = useRef(null);
  const radianceMusicStartedRef = useRef(false);

  useEffect(() => {
    const audio = new Audio(radianceMusicAsset);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = "auto";
    radianceMusicRef.current = audio;

    return () => {
      ensureRadianceMusicStoppedImmediately();
      radianceMusicRef.current = null;
    };
  }, []);

  function startRadianceMusic() {
    if (!radianceMusicRef.current || radianceMusicStartedRef.current) return;
    radianceMusicStartedRef.current = true;
    
    const audio = radianceMusicRef.current;
    
    // Clear any existing fades
    if (radianceFadeRef.current) clearInterval(radianceFadeRef.current);
    
    audio.volume = 0.02;
    audio.play().catch(() => {});
    
    // Fade in over 5s to 0.4
    fadeAudioTo(audio, 0.4, 5000);
  }

  function fadeAudioTo(audio, targetVolume, durationMs, onDone) {
    if (radianceFadeRef.current) clearInterval(radianceFadeRef.current);
    
    const startVol = audio.volume;
    const diff = targetVolume - startVol;
    const steps = 20;
    const stepTime = durationMs / steps;
    const volStep = diff / steps;
    
    let currentStep = 0;
    radianceFadeRef.current = setInterval(() => {
      currentStep++;
      let nextVol = startVol + (volStep * currentStep);
      nextVol = clamp(nextVol, 0, 1);
      
      try { audio.volume = nextVol; } catch (e) {}

      if (currentStep >= steps) {
        clearInterval(radianceFadeRef.current);
        radianceFadeRef.current = null;
        if (targetVolume === 0) {
          audio.pause();
        }
        if (onDone) onDone();
      }
    }, stepTime);
  }

  function stopRadianceMusic() {
    if (!radianceMusicRef.current || !radianceMusicStartedRef.current) return;
    radianceMusicStartedRef.current = false;
    fadeAudioTo(radianceMusicRef.current, 0, 2000, () => {
      if (radianceMusicRef.current) {
        radianceMusicRef.current.pause();
        radianceMusicRef.current.currentTime = 0;
      }
    });
  }

  function ensureRadianceMusicStoppedImmediately() {
    radianceMusicStartedRef.current = false;
    if (radianceFadeRef.current) {
      clearInterval(radianceFadeRef.current);
      radianceFadeRef.current = null;
    }
    const audio = radianceMusicRef.current;
    if (audio) {
      try { audio.volume = 0; } catch (e) {}
      audio.pause();
      audio.currentTime = 0;
    }
  }


  const surviveStartRef = useRef(0);
  const endAtRef = useRef(null); // Frozen timestamp when match ends

  // Guard skill timing
  const guardUntilRef = useRef(0); // When guard invincibility expires
  const guardCdUntilRef = useRef(0); // When guard cooldown expires
  // Corrupt Heal powerup timing
  const corruptHealUntilRef = useRef(0); // When corrupt heal expires

  // Track if a boss unlock event was fired to prevent API spam
  const bossUnlockFiredRef = useRef({
    boss_base: false,
    boss_radiance: false
  });

  // ========== LASER ROUND STATE ==========
  const laserRoundRef = useRef({
    triggered: false,
    warning: false,
    active: false,
    finished: false,
    warningStartMs: 0,
    startMs: 0,
    endMs: 0,
    nextWaveAtMs: 0,
    lasers: []
  });

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

  // hard clean music if unmounted or phase changes away from PLAYING
  useEffect(() => {
    if (phase !== PHASE.PLAYING) {
      ensureRadianceMusicStoppedImmediately();
    }
  }, [phase]);

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

  const [enemyHitFlash, setEnemyHitFlash] = useState(false);
  const [enemyHpPulse, setEnemyHpPulse] = useState(false);
  const [enemyHealFlash, setEnemyHealFlash] = useState(false);
  const prevEnemyHpRef = useRef(100);

  const [surviveStart, setSurviveStart] = useState(0);
  const [endAt, setEndAt] = useState(null); // Frozen end timestamp (freezes timer)
  const [nowMs, setNowMs] = useState(Date.now());

  // Radiance Boss Ranked Sync
  const [radianceWaiting, setRadianceWaiting] = useState(false);
  const radianceRankedFinishedRef = useRef(false);

  // Goddess Boss Ranked Sync
  const [goddessWaiting, setGoddessWaiting] = useState(false);
  const goddessRankedFinishedRef = useRef(false);

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

  const goddessBossRef = useRef({
    triggered: false,
    calmPhase: false,
    swordFalling: false,
    introActive: false,
    active: false,
    defeated: false,
    startedAtMs: 0,
    calmStartMs: 0,
    swordStartMs: 0,
    introStartMs: 0,
    dialogueTimeMs: 0,
    dialogue: "",
    hp: 100,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    swordY: -200, // drops from sky
    attackType: null,
    attackState: null,
    nextAttackAtMs: 0,
    orbCharge: 0,
    orbChargeMax: 4,
    collectibleOrb: null,
    shockwaveReady: false,
    staggeredUntilMs: 0,
    bodyTouchCdUntilMs: 0,
    bossTouchDamageCdUntilMs: 0,
    bloodStreams: [],
    slashEffects: [],
    auraParticles: [],
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
  const opponentName = mode === "boss" ? (
      bossId === "boss_sans" ? "JUDGEMENT WRAITH" : 
      bossId === "boss_goddess" ? "THE ASCENDED BLADE" :
      bossId === "boss_radiance" ? "RADIANT ASCENDANT" : "BOSS ENTITY"
    ) : getOpponentName(me, matchInfo);

  // Compute timer text - use frozen endAt timestamp if match has ended
  const shouldShowTimer = phase === PHASE.PLAYING || phase === PHASE.MATCH_OVER || phase === PHASE.SUMMARY;
  const effectiveNow = endAt ?? nowMs; // Use frozen timestamp if match ended
  let survivalMs = shouldShowTimer ? Math.max(0, effectiveNow - surviveStart) : 0;

  const radState = radianceBossRef.current;
  if (radState.triggered && mode !== "boss") {
    if (!radState.defeated) {
      survivalMs = radState.bossPauseStart;
    } else {
      survivalMs = Math.max(0, survivalMs - radState.bossPauseTotal);
    }
  }

  const godState = goddessBossRef.current;
  if (godState.triggered && mode !== "boss") {
    if (!godState.defeated) {
      survivalMs = Math.min(survivalMs, godState.bossPauseStart);
    } else {
      survivalMs = Math.max(0, survivalMs - godState.bossPauseTotal);
    }
  }

  const isStandaloneSans = mode === "boss" && bossId === "boss_sans";
  if (isStandaloneSans) {
    const timeSpent = Math.max(0, effectiveNow - surviveStart);
    survivalMs = Math.max(0, 30000 - timeSpent);
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
      // Guarantee audio context unlocks on first keypress (critical for instant-start modes like Boss and TimeTrial)
      unlockAudio();

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

      // Sonic Boom / Shockwave activation (r)
      if (k === "r" && !e.repeat) {
        if (phaseRef.current === PHASE.PLAYING) {
           const rad = radianceBossRef.current;
           const god = goddessBossRef.current;
           
           if (rad.active && rad.orbCharge >= rad.orbChargeMax) {
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
              for (let i = 0; i < 30; i++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = 200 + Math.random() * 400;
                radParticlesRef.current.sparks.push({
                  x: bx, y: by, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                  life: 0.3 + Math.random() * 0.4, elapsed: 0, r: 2 + Math.random() * 3,
                  color: Math.random() > 0.5 ? "white" : "gold"
                });
              }
           }
           
           if (god.active && god.orbCharge >= god.orbChargeMax) {
              god.orbCharge = 0;
              god.collectibleOrb = null;
              god.hp = Math.max(0, god.hp - 20);
              // Calculate elapsedMs manually for timeline synchronization
              const currentElapsed = Date.now() - surviveStartRef.current;
              // Stagger boss natively for 3 seconds of timeline
              god.staggeredUntilMs = currentElapsed + 3500;
              
              addShake(30, 800);
              playLaserFireSound();
              
              // Emit massive blood-red boom visual natively from player
              radParticlesRef.current.booms.push({ r: 10, maxR: 1200, life: 0.6, elapsed: 0 });
              
              // Spark particles around boss
              for (let i = 0; i < 30; i++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = 200 + Math.random() * 400;
                radParticlesRef.current.sparks.push({
                  x: god.x, y: god.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                  life: 0.3 + Math.random() * 0.4, elapsed: 0, r: 2 + Math.random() * 3,
                  color: "white" // Flashing white
                });
              }
            }
         }
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

    socket.on("game:hpInit", ({ hpMap }) => {
      try {
        console.log("[game:hpInit]", hpMap);
        if (enemySocketId && hpMap[enemySocketId] !== undefined) {
          setEnemyHp(hpMap[enemySocketId]);
          prevEnemyHpRef.current = hpMap[enemySocketId];
        }
      } catch (err) {
        console.error("[game:hpInit] error:", err);
      }
    });

    socket.on("game:hpSync", (data) => {
      try {
        console.log("[game:hpSync]", data);
        const { socketId, hp: newHp } = data;

        // Update enemy HP if this is the enemy
        if (socketId === enemySocketId) {
          if (newHp < prevEnemyHpRef.current) {
            setEnemyHitFlash(true);
            setEnemyHpPulse(true);
            setTimeout(() => setEnemyHitFlash(false), 150);
            setTimeout(() => setEnemyHpPulse(false), 500);
          } else if (newHp > prevEnemyHpRef.current) {
            setEnemyHealFlash(true);
            setEnemyHpPulse(true);
            setTimeout(() => setEnemyHealFlash(false), 150);
            setTimeout(() => setEnemyHpPulse(false), 500);
          }
          setEnemyHp(newHp);
          prevEnemyHpRef.current = newHp;
        }
      } catch (err) {
        console.error("[game:hpSync] error:", err);
      }
    });

    socket.on("radiance:wait", () => {
      setRadianceWaiting(true);
      // Wait phase: slightly reduce volume
      if (radianceMusicRef.current && radianceMusicStartedRef.current) {
        fadeAudioTo(radianceMusicRef.current, 0.25, 1000);
      }
    });

    socket.on("radiance:resumeNormal", ({ resumeAt }) => {
      const delay = Math.max(0, (resumeAt || Date.now()) - Date.now());
      setTimeout(() => {
        setRadianceWaiting(false);
        stopRadianceMusic(); // Clean fade out on resume
      }, delay);
    });

    socket.on("goddess:wait", () => {
      setGoddessWaiting(true);
    });

    socket.on("goddess:resumeNormal", ({ resumeAt }) => {
      const delay = Math.max(0, (resumeAt || Date.now()) - Date.now());
      setTimeout(() => {
        setGoddessWaiting(false);
      }, delay);
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
      socket.off("game:hpInit");
      socket.off("game:hpSync");
      socket.off("game:matchOver");
      socket.off("radiance:wait");
      socket.off("radiance:resumeNormal");
    };
  }, [enemySocketId]);

  // --- Broadcast local HP changes to opponent ---
  useEffect(() => {
    const isCompetitive = mode === "ranked" || mode === "friend";
    if (isCompetitive && roomIdRef.current && phase === PHASE.PLAYING) {
      socket.emit("game:hpUpdate", { roomId: roomIdRef.current, hp, maxHp: maxHpRef.current });
    }
  }, [hp, phase, mode]);

  // --- Time Trial / Boss immediate start ---
  useEffect(() => {
    if (mode !== "timeTrial" && mode !== "boss") return;

    // Start immediately for time trial or bosses
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
    laserRoundRef.current = {
      triggered: false,
      warning: false,
      active: false,
      finished: false,
      warningStartMs: 0,
      startMs: 0,
      endMs: 0,
      nextWaveAtMs: 0,
      lasers: []
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
    if (!document.hidden) {
      rafRef.current = requestAnimationFrame(loop);
    } else {
      // Force it to start ticking if match begins while alt-tabbed
      if (!window.bgTicker) {
        window.bgTicker = setInterval(loop, 100);
      }
    }
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

    // TimeTrial & Boss mode: start immediately
    if (mode === "timeTrial" || mode === "boss") {
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

  // Handle visibility return for smooth dt catching and background simulation
  useEffect(() => {
    const handleVisChange = () => {
      if (!document.hidden) {
        // Returning to focus
        if (window.bgTicker) {
          clearInterval(window.bgTicker);
          window.bgTicker = null;
        }
        loop._lastNow = Date.now();
        if (phaseRef.current === PHASE.PLAYING) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(loop);
        }
      } else {
        // Going to background
        cancelAnimationFrame(rafRef.current);
        if (!window.bgTicker && phaseRef.current === PHASE.PLAYING) {
          window.bgTicker = setInterval(loop, 100); // 10 FPS logic in background
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisChange);
      if (window.bgTicker) {
        clearInterval(window.bgTicker);
        window.bgTicker = null;
      }
    };
  }, []);

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
          spawnedAtMs: elapsedMs,
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
        boss.lasers.push({ x: p.x + shiftX, y: h / 2, isHoriz: false, chargeTime: 0.9, activeTime: 0.4, elapsed: 0, spawnedAtMs: elapsedMs, thick: 60 });
        boss.lasers.push({ x: w / 2, y: p.y + shiftY, isHoriz: true, chargeTime: 0.9, activeTime: 0.4, elapsed: 0, spawnedAtMs: elapsedMs, thick: 60 });
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
      const prevElapsed = L.elapsed;
      const curElapsed = (elapsedMs - L.spawnedAtMs) / 1000;
      L.elapsed = curElapsed;
      const wasCharging = prevElapsed < L.chargeTime;
      const isCharging = curElapsed < L.chargeTime;

      if (wasCharging && !isCharging) {
        playLaserFireSound();
        addShake(18, 200);
      }
      if (curElapsed >= L.chargeTime + L.activeTime) {
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
    const dt = Math.min(0.05, (now - prevNow) / 1000);
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
    let elapsedMs = 0;
    const base = surviveStartRef.current;
    if (base > 0) {
      elapsedMs = now - base;

      // Fast-forward script time for standalone Bosses mode to trigger phases instantly
      if (mode === "boss" && bossId) {
        if (bossId === "boss_base" && elapsedMs < 30000) elapsedMs += 30000;
        if (bossId === "boss_sans" && elapsedMs < 30000) elapsedMs += 30000;
        if (bossId === "boss_radiance" && elapsedMs < 90000) elapsedMs += 90000;
        if (bossId === "boss_goddess") {
           laserRoundRef.current.triggered = true;
           laserRoundRef.current.finished = true;
           if (elapsedMs < 150000) elapsedMs += 150000;
        }
      }

      difficulty = clamp(elapsedMs / 120000, 0, 1);

      const boss = bossRef.current;
      // In standalone boss mode, Base Boss should ONLY trigger if specifically selected (base or sans variant)
      if (boss.state === "IDLE" && elapsedMs >= 30000 && (mode !== "boss" || bossId === "boss_base" || bossId === "boss_sans")) {
        if (mode !== "boss" && !bossUnlockFiredRef.current.boss_base) {
          bossUnlockFiredRef.current.boss_base = true;
          unlockBoss(token, "boss_base").catch(err => console.log(err));
        }
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
      // In standalone boss mode, Radiance should ONLY trigger if specifically selected
      if (!rad.triggered && elapsedMs >= 90000 && !rad.defeated && (mode !== "boss" || bossId === "boss_radiance")) {
        if (mode !== "boss" && !bossUnlockFiredRef.current.boss_radiance) {
          bossUnlockFiredRef.current.boss_radiance = true;
          unlockBoss(token, "boss_radiance").catch(err => console.log(err));
        }
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
        
        // Custom start music cleanly here exactly once
        startRadianceMusic();
        
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
            rad.homingOrbs.push({ x: w / 2, y: 100, vx: 0, vy: 0, r: 10 });
            rad.homingOrbs.push({ x: w / 2 - 50, y: 100, vx: 0, vy: 0, r: 10 });
            rad.homingOrbs.push({ x: w / 2 + 50, y: 100, vx: 0, vy: 0, r: 10 });
          } else if (attackType === 1) {
            // spikes at walls
            const isVert = rngRef.current() > 0.5;
            if (isVert) {
              rad.wallSpikes.push({ isVert: true, x: 20 + rngRef.current() * (w - 40), y: 0, width: 50, length: 0, maxLength: h, state: "WARN", timer: 0, spawnedAtMs: elapsedMs });
              rad.wallSpikes.push({ isVert: true, x: 20 + rngRef.current() * (w - 40), y: 0, width: 50, length: 0, maxLength: h, state: "WARN", timer: 0, spawnedAtMs: elapsedMs });
            } else {
              rad.wallSpikes.push({ isVert: false, x: 0, y: 20 + rngRef.current() * (h - 40), width: 50, length: 0, maxLength: w, state: "WARN", timer: 0, spawnedAtMs: elapsedMs });
              rad.wallSpikes.push({ isVert: false, x: 0, y: 20 + rngRef.current() * (h - 40), width: 50, length: 0, maxLength: w, state: "WARN", timer: 0, spawnedAtMs: elapsedMs });
            }
          } else if (attackType === 2) {
            // rotating lasers
            rad.lasers.push({ cx: w / 2, cy: 120, angle: 0, rotSpeed: 1.5, length: 800, thick: 40, chargeTime: 1.0, activeTime: 2.0, elapsed: 0, spawnedAtMs: elapsedMs });
            rad.lasers.push({ cx: w / 2, cy: 120, angle: Math.PI, rotSpeed: 1.5, length: 800, thick: 40, chargeTime: 1.0, activeTime: 2.0, elapsed: 0, spawnedAtMs: elapsedMs });
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
          const curElapsed = (elapsedMs - sp.spawnedAtMs) / 1000;
          sp.timer = curElapsed;
          
          if (sp.state === "WARN" && curElapsed > 1.0) {
            sp.state = "EXTEND";
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
          const prevElapsed = L.elapsed;
          const curElapsed = (elapsedMs - L.spawnedAtMs) / 1000;
          L.elapsed = curElapsed;
          
          const wasCharging = prevElapsed < L.chargeTime;
          const isCharging = curElapsed < L.chargeTime;
          
          if (wasCharging && !isCharging) {
            playLaserFireSound();
            addShake(12, 200);
          }
          if (curElapsed >= L.chargeTime + L.activeTime) {
            rad.lasers.splice(i, 1);
          } else if (!isCharging) {
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

        // --- RADIANCE DEATH CHECK ---
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
          const bx = (window.innerWidth || 900) / 2;
          const by = 120;
          for (let i = 0; i < 60; i++) {
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

      // Ranked Radiance Wait Trigger - If mode is ranked, cap phase to 60s exactly
      if (mode === "ranked" && rad.active && !rad.defeated && elapsedMs > rad.bossStartMs + 60000) {
        rad.defeated = true; // Auto-pass
        rad.bossDeathAnimUntil = Date.now() + 1000;
      }

      // Emit ranked wait cleanly exactly once when boss dies / phase passes
      if (mode === "ranked" && rad.defeated && !radianceRankedFinishedRef.current) {
        radianceRankedFinishedRef.current = true;
        // Send off to backend that we are finished
        socket.emit("radiance:finished", { roomId: roomIdRef.current });
      }

      // Cleanup post-defeat to resume normal gameplay
      if (rad.defeated && rad.active && Date.now() > rad.bossDeathAnimUntil && !radianceWaiting) {
        rad.active = false;
        stopRadianceMusic();
        
        // Calculate the exact amount of time the Radiance fight officially took up to subtract from universal playtime
        rad.bossPauseTotal = (elapsedMs - rad.bossPauseStart);
        spawnRef.current.nextSpawnAtMs = elapsedMs + 1000; // Brief pause before resuming bullets
      }

      // ========== GLOBAL LASER ROUND EVENT (Exactly at 120s of true gameplay time) ==========
      // Calculate true gameplay elapsedMs by subtracting any time paused by the Radiance boss
      let lrElapsedMs = elapsedMs;
      if (rad.triggered) {
        if (rad.warning || rad.active) {
          // If Radiance is currently active, freeze LR time at the moment Radiance started
          lrElapsedMs = rad.bossPauseStart;
        } else {
          // If Radiance is defeated and fully cleaned up, subtract the total time paused from the current elapsedMs
          lrElapsedMs = Math.max(0, elapsedMs - rad.bossPauseTotal);
        }
      }

      const lr = laserRoundRef.current;
      if (!lr.triggered && lrElapsedMs >= 120000 && !lr.finished) {
        lr.triggered = true;
        lr.warning = true;
        // Lock in the warning start time based on true elapsed gameplay
        lr.warningStartMs = lrElapsedMs;
        
        // Clear all bullets cleanly before the event
        bulletsRef.current = [];
        
        addShake(25, 3000);
        playBossWarningSound();
      } else if (lr.warning && lrElapsedMs >= lr.warningStartMs + 3000) {
        // Warning ends -> Start shooting lasers
        lr.warning = false;
        lr.active = true;
        lr.startMs = lrElapsedMs;
        lr.endMs = lrElapsedMs + 30000;
        lr.nextWaveAtMs = lrElapsedMs + 500;
      }

      // Laser Round Execution
      if (lr.active) {
        // End condition
        if (lrElapsedMs >= lr.endMs) {
          lr.active = false;
          lr.finished = true;
          lr.lasers = [];
        } else {
          // Generate Lasers
          if (lrElapsedMs >= lr.nextWaveAtMs) {
            // Include diagonal types (0 to 5 for 6 variations)
            const type = Math.floor(rngRef.current() * 6);
            
            // Rapid charge configs for 4 clustered lasers
            const baseConfig = { chargeTime: 0.6, activeTime: 0.25, thick: 45, elapsed: 0, spawnedAtMs: lrElapsedMs };
            
            if (type === 0) {
              // 4 Horizontal
              lr.lasers.push({ x: w / 2, y: h * 0.2, isHoriz: true, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: w / 2, y: h * 0.4, isHoriz: true, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: w / 2, y: h * 0.6, isHoriz: true, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: w / 2, y: h * 0.8, isHoriz: true, isDiag: false, ...baseConfig });
            } else if (type === 1) {
              // 4 Vertical
              lr.lasers.push({ x: w * 0.2, y: h / 2, isHoriz: false, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: w * 0.4, y: h / 2, isHoriz: false, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: w * 0.6, y: h / 2, isHoriz: false, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: w * 0.8, y: h / 2, isHoriz: false, isDiag: false, ...baseConfig });
            } else if (type === 2) {
              // Target player + random cross (4 total lasers)
              const shiftX1 = (rngRef.current() - 0.5) * 150;
              const shiftX2 = (rngRef.current() - 0.5) * 150;
              const shiftY1 = (rngRef.current() - 0.5) * 150;
              lr.lasers.push({ x: w / 2, y: p.y, isHoriz: true, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: w / 2, y: p.y + shiftY1, isHoriz: true, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: p.x + shiftX1, y: h / 2, isHoriz: false, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: p.x + shiftX2, y: h / 2, isHoriz: false, isDiag: false, ...baseConfig });
            } else if (type === 3) {
              // Grid pattern targeting edges
              const targetY1 = h * 0.2 + (rngRef.current() * 50);
              const targetX1 = w * 0.2 + (rngRef.current() * 50);
              const targetY2 = h * 0.8 - (rngRef.current() * 50);
              const targetX2 = w * 0.8 - (rngRef.current() * 50);
              lr.lasers.push({ x: w / 2, y: targetY1, isHoriz: true, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: targetX1, y: h / 2, isHoriz: false, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: w / 2, y: targetY2, isHoriz: true, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: targetX2, y: h / 2, isHoriz: false, isDiag: false, ...baseConfig });
            } else if (type === 4) {
              // Custom diagonal setup (X shape over the arena)
              lr.lasers.push({ cx: w / 2, cy: h / 2, angle: Math.PI / 4, length: 1400, isHoriz: false, isDiag: true, ...baseConfig });
              lr.lasers.push({ cx: w / 2, cy: h / 2, angle: -Math.PI / 4, length: 1400, isHoriz: false, isDiag: true, ...baseConfig });
              // Plus 2 vertical constraints
              lr.lasers.push({ x: w * 0.2, y: h / 2, isHoriz: false, isDiag: false, ...baseConfig });
              lr.lasers.push({ x: w * 0.8, y: h / 2, isHoriz: false, isDiag: false, ...baseConfig });
            } else {
              // Rotating cross shape (Targets player then offsets)
              lr.lasers.push({ cx: p.x, cy: p.y, angle: 0, length: 1400, isHoriz: false, isDiag: true, ...baseConfig });
              lr.lasers.push({ cx: p.x, cy: p.y, angle: Math.PI / 2, length: 1400, isHoriz: false, isDiag: true, ...baseConfig });
              lr.lasers.push({ cx: w / 2, cy: h * 0.2, isHoriz: true, isDiag: false, ...baseConfig });
              lr.lasers.push({ cx: w / 2, cy: h * 0.8, isHoriz: true, isDiag: false, ...baseConfig });
            }

            playLaserChargeSound();
            lr.nextWaveAtMs = lrElapsedMs + 850 + rngRef.current() * 300; // Extreme pacing (~1 wave roughly per second)
          }

          // Update Lasers
          for (let i = lr.lasers.length - 1; i >= 0; i--) {
            const L = lr.lasers[i];
            const prevElapsed = L.elapsed;
            const curElapsed = (lrElapsedMs - L.spawnedAtMs) / 1000;
            L.elapsed = curElapsed;
            const wasCharging = prevElapsed < L.chargeTime;
            const isCharging = curElapsed < L.chargeTime;

            if (wasCharging && !isCharging) {
              playLaserFireSound();
              addShake(12, 150);
            }
            if (curElapsed >= L.chargeTime + L.activeTime) {
              lr.lasers.splice(i, 1);
            }
          }
        }
      }

      // INIT ASCENDED BLADE EVENT
      if (lr.finished) {
        if (mode === "ranked" || mode === "timeTrial" || mode === "boss" || mode === "friend") {
          const god = goddessBossRef.current;
          if (!god.triggered) {
            if (mode !== "boss" && !bossUnlockFiredRef.current.boss_goddess) {
              bossUnlockFiredRef.current.boss_goddess = true;
              unlockBoss(token, "boss_goddess").catch(err => console.log(err));
            }
            god.triggered = true;
            god.calmPhase = true;
            god.bossPauseStart = elapsedMs; // Freeze global time immediately
            god.startedAtMs = elapsedMs;
            god.calmStartMs = elapsedMs;
            bulletsRef.current = [];
            if (powerupRef.current) powerupRef.current.active = null;
            healTextRef.current.text = "";
            // Extend the normal spawn so it doesn't trigger
            spawnRef.current.nextSpawnAtMs = elapsedMs + 9999999;
          }
        } else {
          // Grace period for non-compatible modes (though all main modes are supported)
          spawnRef.current.nextSpawnAtMs = Math.max(spawnRef.current.nextSpawnAtMs, elapsedMs + 1000);
        }
      }

      const god = goddessBossRef.current;

      // ========== GODDESS BOSS TIMELINE (THE ASCENDED BLADE) ==========
      if (god.triggered && !god.defeated) {
        const gTime = elapsedMs - god.startedAtMs;
        
        // Phase A: Calm Void (0 to 5000ms)
        if (god.calmPhase && gTime > 5000) {
           god.calmPhase = false;
           god.swordFalling = true;
           god.swordStartMs = elapsedMs;
           god.swordY = -300;
           addShake(30, 1000); // Massive shake when it lands
           playBossWarningSound(); // Reuse deep bass sound
        }
        
        // Phase B: Sword Drop (5000ms to 7000ms)
        if (god.swordFalling) {
           const sTime = elapsedMs - god.swordStartMs;
           god.swordY = Math.min(h / 2 + 50, -300 + (sTime / 500) * (h / 2 + 350));
           if (sTime > 2000) {
              god.swordFalling = false;
              god.introActive = true;
              god.introStartMs = elapsedMs;
              god.dialogue = "You silenced the false light. Now face its consequence.";
           }
        }
        
        // Phase C: Goddess Descent (7000ms to 11000ms)
        if (god.introActive) {
           const incTime = elapsedMs - god.introStartMs;
           god.dialogueTimeMs = incTime;
           if (incTime > 4000) {
              god.introActive = false;
              god.active = true;
              god.nextAttackAtMs = elapsedMs + 1000;
              god.hp = 300; // Tripled HP
              god.x = w / 2;
              god.y = h / 2 - 120; // Float slightly above center initially
           }
        }

        // Emit ranked wait cleanly exactly once when boss dies / phase passes
        if (mode === "ranked" && god.defeated && !goddessRankedFinishedRef.current) {
          goddessRankedFinishedRef.current = true;
          socket.emit("goddess:finished", { roomId: roomIdRef.current });
        }

        // Phase D: Combat Mechanics
        if (god.active && !god.defeated) {
          // Boss Stagger logic
          const isStaggered = elapsedMs < god.staggeredUntilMs;
          
          if (!isStaggered) {
             // 1) Movement towards player
             const dx = p.x - god.x;
             const dy = p.y - god.y;
             const dist = Math.hypot(dx, dy) || 1;
             
             // Base elegant floating movement
             const floatSpeed = 80; 
             god.x += (dx / dist) * floatSpeed * dt;
             god.y += (dy / dist) * floatSpeed * dt;

             // 2) Attack Logic
             if (elapsedMs >= god.nextAttackAtMs && !god.attackState) {
                // Pick next attack
                const choice = Math.random();
                if (choice < 0.25) god.attackType = "NORMAL";
                else if (choice < 0.50) god.attackType = "HEAVY";
                else if (choice < 0.70) god.attackType = "POWER";
                else if (choice < 0.85) god.attackType = "ULTIMATE";
                else god.attackType = "SHOCK_SHIELD";

                god.attackState = "WINDUP";
                god.nextAttackAtMs = elapsedMs + 400; // Faster Windup duration
                
                // Attack specific initializations
                god.telegraphs = [];
                if (god.attackType === "NORMAL") {
                   addShake(3, 300); // Small telegraph shake
                   const ang = Math.atan2(p.y - god.y, p.x - god.x);
                   god.telegraphs.push({ x: god.x, y: god.y, angle: ang, length: 400, width: 40, isHeavy: false });
                } else if (god.attackType === "HEAVY") {
                   addShake(8, 600);
                   playLaserChargeSound();
                   god.telegraphs.push({ x: p.x, y: p.y, angle: 0, length: 600, width: 120, isHeavy: true });
                } else if (god.attackType === "POWER") {
                   playLaserChargeSound();
                   const ang = Math.atan2(p.y - god.y, p.x - god.x);
                   for(let i=0; i<4; i++) {
                      god.telegraphs.push({ x: god.x, y: god.y, angle: ang + (Math.PI/2)*i, length: 1200, width: 80, isHeavy: true });
                   }
                } else if (god.attackType === "ULTIMATE") {
                   playBossWarningSound();
                   addShake(15, 800);
                   god.nextAttackAtMs = elapsedMs + 800; // Faster Longer ultimate windup
                   for(let i=0; i<8; i++) {
                      god.telegraphs.push({ x: w/2, y: h/2, angle: (Math.PI/4)*i + Math.PI/8, length: 1500, width: 60, isHeavy: true });
                   }
                } else if (god.attackType === "SHOCK_SHIELD") {
                   playLaserChargeSound();
                   addShake(10, 600);
                   god.nextAttackAtMs = elapsedMs + 600; // Shield charge up
                   god.telegraphs.push({ isShield: true, x: god.x, y: god.y, radius: 400 });
                }
             } else if (elapsedMs >= god.nextAttackAtMs && god.attackState === "WINDUP") {
                // Execute Attack
                god.attackState = "ACTIVE";
                
                if (god.attackType === "NORMAL") {
                   // Fast dash line slice
                   playLaserFireSound();
                   const tel = god.telegraphs[0];
                   god.slashEffects.push({ ...tel, lifeMs: 300, maxLifeMs: 300, spawnedAtMs: elapsedMs });
                   god.nextAttackAtMs = elapsedMs + 300; // Faster Short recovery
                   // Lunge boss forward along cached angle
                   god.x += Math.cos(tel.angle) * 300;
                   god.y += Math.sin(tel.angle) * 300;
                   
                } else if (god.attackType === "HEAVY") {
                   // Giant sweeping dive
                   playLaserFireSound();
                   addShake(10, 300);
                   const tel = god.telegraphs[0];
                   god.slashEffects.push({ ...tel, lifeMs: 600, maxLifeMs: 600, spawnedAtMs: elapsedMs });
                   god.nextAttackAtMs = elapsedMs + 600; // Faster Heavy recovery
                   
                } else if (god.attackType === "POWER") {
                   // Arena blood cross waves starting from boss
                   playLaserFireSound();
                   addShake(15, 400);
                   for(const tel of god.telegraphs) {
                      god.slashEffects.push({ ...tel, lifeMs: 800, maxLifeMs: 800, spawnedAtMs: elapsedMs });
                   }
                   god.nextAttackAtMs = elapsedMs + 800; // Faster recovery
                   
                } else if (god.attackType === "ULTIMATE") {
                   // Absolute Storm: 8 surrounding blood slashes crashing inward towards Center
                   playLaserFireSound();
                   addShake(25, 800);
                   for(const tel of god.telegraphs) {
                      god.slashEffects.push({ ...tel, lifeMs: 1200, maxLifeMs: 1200, spawnedAtMs: elapsedMs });
                   }
                   god.nextAttackAtMs = elapsedMs + 1200; // Faster Ultimate recovery
                } else if (god.attackType === "SHOCK_SHIELD") {
                   // Propel the shield outward across the arena
                   playLaserFireSound();
                   addShake(30, 800);
                   // Create an expanding ring attack
                   god.slashEffects.push({ isShieldRun: true, x: god.x, y: god.y, maxRadius: 1500, lifeMs: 1000, maxLifeMs: 1000, spawnedAtMs: elapsedMs });
                   god.nextAttackAtMs = elapsedMs + 1500; // Long recovery
                   // The shield exertion causes her to slow down her combat pace briefly
                   god.shieldSlowUntilMs = elapsedMs + 6000;
                }
                god.telegraphs = []; // Clear visual locks
             } else if (elapsedMs >= god.nextAttackAtMs && god.attackState === "ACTIVE") {
                // Cleanup and reset for next attack
                god.attackState = null;
                const baseIdle = 600 + rngRef.current() * 600;
                // If she recently threw her shield, heavily decelerate her next attacks
                const penalty = (elapsedMs < god.shieldSlowUntilMs) ? 2000 : 0;
                god.nextAttackAtMs = elapsedMs + baseIdle + penalty;
             }
          }

          // Orb Logic (Spawn + Collect)
          if (!god.collectibleOrb && god.orbCharge < god.orbChargeMax) {
             if (!god.orbSpawnTime) god.orbSpawnTime = elapsedMs + 2000;
             if (elapsedMs > god.orbSpawnTime) {
                god.collectibleOrb = { x: 50 + rngRef.current() * (w - 100), y: 50 + rngRef.current() * (h - 100), r: 12 };
                god.orbSpawnTime = null;
             }
          }

          if (god.collectibleOrb) {
             const orbDiff = Math.hypot(p.x - god.collectibleOrb.x, p.y - god.collectibleOrb.y);
             if (orbDiff < p.r + god.collectibleOrb.r) {
                god.orbCharge++;
                playHealSound(20); // Reuse sound
                god.collectibleOrb = null;
                
                if (god.orbCharge >= god.orbChargeMax) {
                   god.shockwaveReady = true;
                   healTextRef.current = { text: "SHOCKWAVE READY (R)", until: nowMs + 2000 };
                }
             }
          }

          // Trigger Shockwave (Key 'R')
          if (keysRef.current.has("r") && god.shockwaveReady) {
             god.shockwaveReady = false;
             god.orbCharge = 0;
             
             // Execute Stagger
             playLaserFireSound();
             addShake(20, 1000);
             god.staggeredUntilMs = elapsedMs + 4000; // Stagger for 4 seconds
             god.attackState = null; // Interrupt attacks
             god.nextAttackAtMs = Math.max(god.nextAttackAtMs, god.staggeredUntilMs + 1000); // Give buffer after waking up
             healTextRef.current = { text: "STAGGERED!", until: nowMs + 2000 };
          }
          
          // Cleanup expired slash effects
          for (let i = god.slashEffects.length - 1; i >= 0; i--) {
             const sl = god.slashEffects[i];
             sl.lifeMs -= dt * 1000;
             if (sl.lifeMs <= 0) god.slashEffects.splice(i, 1);
          }
        }
      }

      const isBossTime = boss.state === "WARNING" || boss.state === "ACTIVE" || rad.warning || rad.active || (god.triggered && !god.defeated) || mode === "boss";
      const isLaserRoundPause = lr.warning || lr.active;

      let guard = 0;
      while (elapsedMs >= spawnRef.current.nextSpawnAtMs && guard < 50) {
        if (!isBossTime && !isLaserRoundPause) {
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
      if (!isBossTime && !isLaserRoundPause) {
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
    if (!radianceWaiting) {
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        if (b.x < -80 || b.x > w + 80 || b.y < -120 || b.y > h + 120) {
          bullets.splice(i, 1);
        }
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

        // Emit HP update to server (or locally for timeTrial/boss)
        if (mode === "timeTrial" || mode === "boss") {
          if (nextHp === 0) {
            ensureRadianceMusicStoppedImmediately();
            endMatch("environment"); // "environment" ensures iAmWinner resolves to false
          }
        } else {
          socket.emit("game:hp", { roomId: roomIdRef.current, hp: nextHp });
          if (nextHp === 0) {
            ensureRadianceMusicStoppedImmediately();
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

    if (!invincible && !radianceWaiting) {
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

      // Goddess Boss Collisions (Ascended Blade)
      const god = goddessBossRef.current;
      if (god.active && !god.defeated) {
         const isStaggered = elapsedMs < god.staggeredUntilMs;
         
         // Touch damage handling
         const dist = Math.hypot(god.x - p.x, god.y - p.y);
         if (dist < p.r + 30) {
            if (isStaggered && elapsedMs > god.bodyTouchCdUntilMs) {
               // Deal damage to her instead of player getting hurt
               god.hp = Math.max(0, god.hp - 15);
               god.bodyTouchCdUntilMs = elapsedMs + 400; // Invincibility frames for boss
               playHitSound();
               addShake(15, 200);
               
               if (god.hp <= 0) {
                  god.active = false;
                  god.defeated = true;
                  god.bossDeathAnimUntil = elapsedMs + 1500;
                  // Reward Max HP +50 strictly to local player performing the kill
                  maxHpRef.current += 50;
                  setHp(maxHpRef.current);
                  healTextRef.current = { text: "MAX HP +50!", until: nowMs + 3000 };
                  addShake(30, 2000);
                  
                  // In Ranked mode, this will securely trigger `goddess:finished` because of lines above
                  // We also clean up visual effects
                  god.slashEffects = [];
                  god.bloodStreams = [];
                  spawnRef.current.nextSpawnAtMs = elapsedMs + 2000; // Resume normal bullets safely
                  god.bossPauseTotal = (elapsedMs - god.bossPauseStart);
               }
            } else if (!isStaggered && !tookHit && elapsedMs > god.bossTouchDamageCdUntilMs) {
               // She hurts you
               tookHit = true; applyDamage(25, null);
               god.bossTouchDamageCdUntilMs = elapsedMs + 500; // Prevents insta-death melting
            }
         }
         
         // Slash Effect Damage Player Hitbox
         if (!tookHit && elapsedMs > god.bossTouchDamageCdUntilMs) {
            for (const sl of god.slashEffects) {
                // Check for expanding shield collision
                if (sl.isShieldRun) {
                   const currentRadius = sl.maxRadius * (1.0 - (sl.lifeMs / sl.maxLifeMs));
                   const distToCenter = Math.hypot(p.x - sl.x, p.y - sl.y);
                   const shieldThickness = 40 * (sl.lifeMs / sl.maxLifeMs); // Matches visual thickness
                   if (distToCenter > currentRadius - shieldThickness / 2 - p.r && distToCenter < currentRadius + shieldThickness / 2 + p.r) {
                      tookHit = true;
                      applyDamage(30, null); // High damage for shield
                      god.bossTouchDamageCdUntilMs = elapsedMs + 500;
                      break;
                   }
                } else {
                   // Using distance to line segment approximation
                   // Transform p to slash local space
                   const px = p.x - sl.x;
                   const py = p.y - sl.y;
                   const cost = Math.cos(-sl.angle);
                   const sint = Math.sin(-sl.angle);
                   const nx = px * cost - py * sint;
                   const ny = px * sint + py * cost;
                   
                   // Active timeframe (only hurt when slash is bright, not fading out heavily)
                   const activeRatio = sl.lifeMs / sl.maxLifeMs;
                   if (activeRatio > 0.4) {
                      if (nx > -sl.length/2 && nx < sl.length/2 && Math.abs(ny) < sl.width/2 + p.r) {
                         tookHit = true; 
                         applyDamage(sl.isHeavy ? 35 : 20, null);
                         god.bossTouchDamageCdUntilMs = elapsedMs + 500;
                         break;
                      }
                   }
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
                if (Math.abs(p.x - sp.x) < sp.width / 2 + p.r - 2 && p.y < sp.length) { tookHit = true; applyDamage(18, null); break; }
              } else {
                if (Math.abs(p.y - sp.y) < sp.width / 2 + p.r - 2 && p.x < sp.length) { tookHit = true; applyDamage(18, null); break; }
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
              if (distToLine < L.thick / 2 + p.r - 2 && forwardDist > 0 && forwardDist < L.length) {
                tookHit = true; applyDamage(20, null); break;
              }
            }
          }
        }
      }

      // Laser Round Collision check
      const lr = laserRoundRef.current;
      if (!tookHit && lr.active) {
        for (const L of lr.lasers) {
          if (L.elapsed > L.chargeTime) {
            let hit = false;
            
            if (L.isDiag) {
              // Math for checking diagonal laser collision
              const dx = p.x - L.cx;
              const dy = p.y - L.cy;
              const distToLine = Math.abs(dx * Math.sin(-L.angle) + dy * Math.cos(-L.angle));
              // Allow collision detection natively within bounds as length is artificially huge
              if (distToLine < L.thick / 2 + p.r - 3) {
                hit = true;
              }
            } else {
              // Orthogonal laser
              hit = L.isHoriz
                ? Math.abs(p.y - L.y) < L.thick / 2 + p.r - 3
                : Math.abs(p.x - L.x) < L.thick / 2 + p.r - 3;
            }

            if (hit) {
              tookHit = true;
              applyDamage(20, null);
              break;
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
          x: w / 2 + (Math.random() - 0.5) * 600,
          y: 120 + (Math.random() - 0.5) * 300,
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

    // Standalone Boss Win Condition
    if (mode === "boss" && phaseRef.current === PHASE.PLAYING) {
      let won = false;
      // Radiance Boss victory (HP <= 0)
      if (bossId === "boss_radiance" && rad.defeated) won = true;
      // Base Boss victory (Expires naturally)
      if (bossId === "boss_base" && bossRef.current && bossRef.current.state === "DONE") won = true;
      // Sans Boss victory (Expires after exactly 30s survival)
      if (bossId === "boss_sans" && (now - surviveStartRef.current >= 30000)) won = true;
      // Goddess Boss Victory
      if (bossId === "boss_goddess" && goddessBossRef.current.defeated) won = true;

      if (won) {
        setWinnerId(myId);
        endMatch(myId);
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

    const lr = laserRoundRef.current;
    if (lr.warning) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(0, 0, w, h);

      const flash = Math.floor(now / 120) % 2 === 0;
      if (flash) {
        ctx.fillStyle = "white";
        ctx.font = "900 64px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("WARNING", w / 2, h / 2 - 40);
        
        ctx.fillStyle = "#FF3366";
        ctx.font = "900 48px monospace";
        ctx.fillText("LASER ROUND", w / 2, h / 2 + 30);
      }
    }

    if (lr.active) {
      // Small HUD title overlay
      ctx.fillStyle = "#FF3366";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("LASER ROUND", w / 2, 30);

      // Draw LR lasers directly (reusing white aesthetics)
      for (const L of lr.lasers) {
        if (L.elapsed < L.chargeTime) {
          ctx.fillStyle = "rgba(255, 50, 100, 0.25)";
          if (L.isDiag) {
            ctx.save(); 
            ctx.translate(L.cx, L.cy); 
            ctx.rotate(L.angle);
            ctx.fillRect(-L.length/2, -2, L.length, 4);
            ctx.restore();
          } else if (L.isHoriz) {
            ctx.fillRect(0, L.y - 2, w, 4);
          } else {
            ctx.fillRect(L.x - 2, 0, 4, h);
          }
        } else {
          const activeRatio = Math.min(1, Math.max(0, (L.elapsed - L.chargeTime) / L.activeTime));
          const fade = Math.pow(1 - activeRatio, 1.5); // Snappier fade out
          ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
          ctx.shadowColor = "#FF3366";
          ctx.shadowBlur = 20;
          const th = L.thick * (1 - activeRatio * 0.1);
          
          if (L.isDiag) {
            ctx.save(); 
            ctx.translate(L.cx, L.cy); 
            ctx.rotate(L.angle);
            ctx.fillRect(-L.length/2, -th / 2, L.length, th);
            ctx.restore();
          } else if (L.isHoriz) {
            ctx.fillRect(0, L.y - th / 2, w, th);
          } else {
            ctx.fillRect(L.x - th / 2, 0, th, h);
          }
          ctx.shadowBlur = 0;
        }
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
        ctx.arc(0, 0, 100 + Math.sin(now / 200) * 10, 0, Math.PI * 2);
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
          ctx.lineTo(80 + Math.sin(now / 150 + i) * 15, 0);
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
        ctx.fillRect(w / 2 - 150, 45, 300, 15);
        ctx.fillStyle = "rgba(255, 215, 0, 0.9)";
        const hpRatio = rad.hp / 100;
        ctx.fillRect(w / 2 - 150, 45, 300 * hpRatio, 15);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.strokeRect(w / 2 - 150, 45, 300, 15);

        // Orb Charge UI
        if (!rad.sonicBoomActive) {
          const chargeText = rad.orbCharge >= rad.orbChargeMax ? "PRESS R - SONIC BOOM READY" : `CHARGE: ${rad.orbCharge} / ${rad.orbChargeMax}`;
          ctx.fillStyle = rad.orbCharge >= rad.orbChargeMax ? "white" : "gold";
          ctx.font = rad.orbCharge >= rad.orbChargeMax ? "bold 24px monospace" : "18px monospace";
          ctx.shadowColor = "gold";
          ctx.shadowBlur = rad.orbCharge >= rad.orbChargeMax ? 15 : 0;
          if (rad.orbCharge >= rad.orbChargeMax && Math.floor(now / 100) % 2 === 0) {
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
        ctx.beginPath(); ctx.arc(pVar.x, pVar.y, pVar.r, 0, Math.PI * 2); ctx.fill();
      }
      for (const pVar of rPart.sparks) {
        ctx.fillStyle = pVar.color;
        ctx.shadowColor = pVar.color;
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(pVar.x, pVar.y, pVar.r, 0, Math.PI * 2); ctx.fill();
      }
      for (const b of rPart.booms) {
        if (!b.delay || b.delay <= 0) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${1 - b.elapsed / b.life})`;
          ctx.lineWidth = 15 * (1 - b.elapsed / b.life);
          ctx.shadowColor = "white";
          ctx.shadowBlur = 20;
          ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();

      // Draw Attacks
      for (const orb of rad.homingOrbs) {
        ctx.shadowColor = "gold";
        ctx.shadowBlur = 15;
        ctx.fillStyle = "white";
        ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "gold"; ctx.lineWidth = 3; ctx.stroke();
        ctx.shadowBlur = 0;
      }

      for (const sp of rad.wallSpikes) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.shadowColor = "gold"; ctx.shadowBlur = 15;
        if (sp.isVert) {
          if (sp.state === "WARN") {
            ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
            ctx.fillRect(sp.x - sp.width / 2, 0, sp.width, h);
          } else {
            ctx.fillRect(sp.x - sp.width / 2, 0, sp.width, sp.length);
          }
        } else {
          if (sp.state === "WARN") {
            ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
            ctx.fillRect(0, sp.y - sp.width / 2, w, sp.width);
          } else {
            ctx.fillRect(0, sp.y - sp.width / 2, sp.length, sp.width);
          }
        }
        ctx.shadowBlur = 0;
      }

      for (const L of rad.lasers) {
        if (L.elapsed < L.chargeTime) {
          ctx.fillStyle = "rgba(255, 215, 0, 0.2)";
          ctx.save(); ctx.translate(L.cx, L.cy); ctx.rotate(L.angle);
          ctx.fillRect(0, -L.thick / 2, L.length, L.thick);
          ctx.restore();
        } else {
          const activeRatio = (L.elapsed - L.chargeTime) / L.activeTime;
          const fade = 1 - activeRatio;
          ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
          ctx.shadowColor = "gold"; ctx.shadowBlur = 25;
          ctx.save(); ctx.translate(L.cx, L.cy); ctx.rotate(L.angle);
          const th = L.thick * (1 - activeRatio * 0.3);
          ctx.fillRect(0, -th / 2, L.length, th);
          ctx.restore();
          ctx.shadowBlur = 0;
        }
      }

      // Collectible Radiant Orbs
      if (rad.collectibleOrb && !rad.sonicBoomActive) {
        const orb = rad.collectibleOrb;
        ctx.shadowColor = "lime"; ctx.shadowBlur = 15;
        ctx.fillStyle = "#22c55e"; // bright green
        ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r + Math.sin(now / 100) * 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "white";
        ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // ========== GODDESS BOSS VISUALS (THE ASCENDED BLADE) ==========
    const god = goddessBossRef.current;
    if (god.triggered && !god.defeated) {
       // 1. Blood Rivers Background
       ctx.save();
       ctx.globalAlpha = 0.15 + 0.05 * Math.sin(now / 500);
       ctx.fillStyle = "#aa0000";
       // Draw some sine wave streams across the floor
       for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(0, h * 0.2 * i + 100);
          for (let x = 0; x < w; x += 50) {
             ctx.lineTo(x, h * 0.2 * i + 100 + Math.sin(x / 100 + now / 800 + i) * 60);
          }
          ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
       }
       ctx.restore();

       // 2. Falling/Static Sword & Calm Void overlay
       if (god.calmPhase) {
          // Intense dark dramatic vignette
          const ratio = Math.min(1, (elapsedMs - god.calmStartMs) / 5000); // 5 sec windup
          const grad = ctx.createRadialGradient(w/2, h/2, 100, w/2, h/2, h);
          grad.addColorStop(0, `rgba(0,0,0,${0.3 * ratio})`);
          grad.addColorStop(1, `rgba(15,0,5,${0.95 * ratio})`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          
          ctx.fillStyle = `rgba(255,50,50, ${Math.sin(now/150) * 0.1 * ratio})`;
          ctx.font = "italic 20px monospace";
          ctx.textAlign = "center";
          ctx.fillText("An ancient presence awakens...", w/2, h/2 - 100);
       }

       if (god.swordFalling || god.introActive || god.active) {
          ctx.save();
          // If active, sword is in her hand (part of her model). If intro or falling, it's center stage.
          if (!god.active) {
             ctx.translate(w / 2, god.swordY);
             // Sword Glow
             ctx.shadowColor = "white";
             ctx.shadowBlur = 30 + Math.sin(now/100) * 10;
             ctx.fillStyle = "white";
             // Blade
             ctx.beginPath();
             ctx.moveTo(0, 150);
             ctx.lineTo(15, 0);
             ctx.lineTo(0, -250);
             ctx.lineTo(-15, 0);
             ctx.fill();
             // Crossguard
             ctx.fillStyle = "#FF3366";
             ctx.shadowColor = "#FF3366";
             ctx.fillRect(-60, 0, 120, 15);
             // Pommel
             ctx.beginPath(); ctx.arc(0, 170, 15, 0, Math.PI * 2); ctx.fill();
             ctx.shadowBlur = 0;
             
             // Impact Crater if landed
             if (god.introActive) {
                ctx.strokeStyle = "#FF3366";
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.ellipse(0, 160, 120, 40, 0, 0, Math.PI*2); ctx.stroke();
                ctx.beginPath(); ctx.ellipse(0, 160, 80, 20, 0, 0, Math.PI*2); ctx.stroke();
             }
          }
          ctx.restore();
       }

       // 3. Goddess Character Model (Highly Detailed Humanoid/Valkyrie)
       if (god.introActive || god.active) {
          ctx.save();
          const gx = god.introActive ? w / 2 : god.x;
          // Float her down during intro
          let gy = god.introActive ? -100 + Math.min(1, god.dialogueTimeMs / 2000) * (h / 2 - 20) : god.y;
          ctx.translate(gx, gy);
          
          const isStaggered = god.active && elapsedMs < god.staggeredUntilMs;
          if (isStaggered) {
             ctx.translate(Math.sin(now/30)*10, Math.cos(now/30)*10); // Shake wildly
          }
          
          const breath = isStaggered ? 0 : Math.sin(now / 300);
          const wingFlap = isStaggered ? Math.PI/6 * Math.sin(now/50) : Math.sin(now / 200) * 0.2;
          
          ctx.shadowColor = isStaggered ? "transparent" : "rgba(255, 255, 255, 0.8)";
          ctx.shadowBlur = isStaggered ? 0 : 25;

          // === INNER AURA ===
          ctx.beginPath();
          ctx.arc(0, -40, isStaggered ? 40 : 60 + Math.sin(now/150)*10, 0, Math.PI*2);
          ctx.fillStyle = isStaggered ? "rgba(255, 0, 0, 0.1)" : "rgba(255, 50, 100, 0.15)";
          ctx.fill();

          // === WINGS ===
          const drawWing = (isLeft) => {
             ctx.save();
             ctx.scale(isLeft ? -1 : 1, 1);
             ctx.rotate(wingFlap + 0.1);
             ctx.fillStyle = isStaggered ? "rgba(80, 80, 80, 0.8)" : "rgba(240, 245, 255, 0.9)";
             ctx.strokeStyle = isStaggered ? "#333" : "white";
             ctx.lineWidth = 1;
             
             // Base arc of the wing
             ctx.beginPath();
             ctx.moveTo(0, -60);
             ctx.quadraticCurveTo(150, -180, 300, -80);
             ctx.quadraticCurveTo(200, 50, 0, -20);
             ctx.fill();
             
             // Glowing Edge Trails (Ascended Form)
             if (!isStaggered) {
                ctx.strokeStyle = "rgba(255, 50, 100, 0.6)";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, -60);
                ctx.quadraticCurveTo(150, -180, 300, -80);
                ctx.stroke();
             }
             
             // Articulated Feathers
             ctx.fillStyle = isStaggered ? "rgba(50, 50, 50, 0.8)" : "rgba(255, 255, 255, 0.95)";
             for(let i=0; i<8; i++) {
                ctx.save();
                ctx.translate(20 + i*30, -50 + i*10);
                ctx.rotate(0.2 + i*0.1 + Math.sin(now/200 + i)*0.1);
                ctx.beginPath();
                ctx.moveTo(0,0);
                ctx.quadraticCurveTo(20, 60, 5, 120);
                ctx.quadraticCurveTo(-15, 60, 0, 0);
                ctx.fill(); ctx.stroke();
                ctx.restore();
             }
             ctx.restore();
          };
          drawWing(true);
          drawWing(false);

          // === FLOWING HAIR ===
          // Inner Dark/Red Hair Layer
          ctx.fillStyle = isStaggered ? "#330000" : "#FF3366";
          ctx.beginPath();
          ctx.moveTo(0, -90);
          ctx.quadraticCurveTo(-70, -70 + breath*5, -60 + Math.sin(now/150)*20, 10 + Math.cos(now/150)*15);
          ctx.quadraticCurveTo(-30, -10, 0, -60);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(0, -90);
          ctx.quadraticCurveTo(70, -70 + breath*5, 60 + Math.cos(now/150)*20, 10 + Math.sin(now/150)*15);
          ctx.quadraticCurveTo(30, -10, 0, -60);
          ctx.fill();

          // Outer White Hair Layer
          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.moveTo(0, -90);
          ctx.quadraticCurveTo(-60, -80 + breath*5, -50 + Math.sin(now/150)*15, -10 + Math.cos(now/150)*10);
          ctx.quadraticCurveTo(-20, -20, 0, -60);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(0, -90);
          ctx.quadraticCurveTo(60, -80 + breath*5, 50 + Math.cos(now/150)*15, -10 + Math.sin(now/150)*10);
          ctx.quadraticCurveTo(20, -20, 0, -60);
          ctx.fill();

          // === FLOWING SKIRT ===
          ctx.fillStyle = isStaggered ? "rgba(80, 0, 0, 0.9)" : "rgba(180, 20, 50, 0.95)";
          ctx.beginPath();
          ctx.moveTo(-25, 10);
          ctx.quadraticCurveTo(-60, 100, -40 + Math.sin(now/200)*20, 160 + Math.cos(now/300)*10);
          ctx.quadraticCurveTo(0, 180 + Math.sin(now/250)*15, 40 + Math.cos(now/200)*20, 160 + Math.sin(now/300)*10);
          ctx.quadraticCurveTo(60, 100, 25, 10);
          ctx.fill();
          // Skirt folds/lines
          ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-10, 10); ctx.quadraticCurveTo(-20, 80, -10 + Math.sin(now/200)*10, 165); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(10, 10); ctx.quadraticCurveTo(20, 80, 10 + Math.cos(now/200)*10, 165); ctx.stroke();

          // === VALKYRIE TORSO (ARMOR) ===
          ctx.fillStyle = "#1a1a1a";
          ctx.strokeStyle = isStaggered ? "#AA0000" : "#FF3366";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-15, -70); // Neck L
          ctx.lineTo(15, -70); // Neck R
          ctx.lineTo(35, -50 + breath*2); // Shoulder R
          ctx.lineTo(25, -20); // Chest plate R
          ctx.lineTo(25, 10); // Waist R
          ctx.lineTo(-25, 10); // Waist L
          ctx.lineTo(-25, -20); // Chest plate L
          ctx.lineTo(-35, -50 + breath*2); // Shoulder L
          ctx.closePath();
          ctx.fill(); ctx.stroke();
          
          // Outer Gold Trim Pauldrons
          ctx.strokeStyle = isStaggered ? "#555" : "gold";
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(15, -70); ctx.lineTo(35, -50 + breath*2); ctx.lineTo(25, -30); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-15, -70); ctx.lineTo(-35, -50 + breath*2); ctx.lineTo(-25, -30); ctx.stroke();
          
          // Armor Details & Abdomen Plating
          ctx.strokeStyle = isStaggered ? "#AA0000" : "#FF3366";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(0, 10); ctx.stroke(); // Center breastplate line
          ctx.beginPath(); ctx.moveTo(-20, -10); ctx.lineTo(0, -5); ctx.lineTo(20, -10); ctx.stroke(); // Rib plate 1
          ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(0, 5); ctx.lineTo(15, 0); ctx.stroke(); // Rib plate 2

          // Central Ascendant Gem
          ctx.fillStyle = isStaggered ? "red" : "#FF3366";
          ctx.shadowColor = isStaggered ? "transparent" : "#FF3366";
          ctx.shadowBlur = isStaggered ? 0 : 20 + Math.sin(now/100)*10;
          ctx.beginPath(); ctx.arc(0, -40, 8, 0, Math.PI*2); ctx.fill(); 
          ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(0, -42, 3, 0, Math.PI*2); ctx.fill(); // Highlight
          ctx.shadowBlur = 0;

          // === HEAD & HALO ===
          ctx.fillStyle = "#111"; // Make helmet base dark
          ctx.strokeStyle = "white";
          ctx.lineWidth = 2;
          // Face profile / Helmet
          ctx.beginPath();
          ctx.arc(0, -90, 16, 0, Math.PI*2);
          ctx.fill(); ctx.stroke();
          
          // Glowing Visor / Slit Eye
          ctx.fillStyle = isStaggered ? "red" : "#FF3366";
          ctx.shadowColor = isStaggered ? "transparent" : "#FF3366";
          ctx.shadowBlur = isStaggered ? 0 : 15;
          ctx.beginPath(); ctx.ellipse(0, -90, 10, 3, 0, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = "white";
          ctx.beginPath(); ctx.ellipse(0, -90, 4, 1, 0, 0, Math.PI*2); ctx.fill(); // Inner eye core
          ctx.shadowBlur = 0;

          // Halo
          ctx.strokeStyle = isStaggered ? "red" : "gold";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(0, -115 + Math.sin(now/200)*3, 25, 8, 0, 0, Math.PI*2);
          ctx.stroke();

          // === ARMS & SHOCK SHIELD ===
          if (god.active) {
             const shieldThrown = (god.attackType === "SHOCK_SHIELD" && god.attackState === "ACTIVE");
             
             // Draw arms resting backwards 
             ctx.save();
             // Right Arm
             ctx.translate(35, -50 + breath*2);
             ctx.rotate(isStaggered ? Math.PI/2 : Math.PI/6);
             ctx.fillStyle = "#111"; ctx.strokeStyle = "#FF3366"; ctx.lineWidth = 2;
             ctx.beginPath(); ctx.roundRect(-8, 0, 16, 40, 8); ctx.fill(); ctx.stroke();
             ctx.translate(0, 35); ctx.rotate(-0.5);
             ctx.beginPath(); ctx.roundRect(-6, 0, 12, 35, 6); ctx.fill(); ctx.stroke();
             ctx.restore();
             
             // Left Arm
             ctx.save();
             ctx.translate(-35, -50 + breath*2);
             ctx.rotate(isStaggered ? -Math.PI/2 : -Math.PI/6);
             ctx.fillStyle = "#111"; ctx.strokeStyle = "#FF3366"; ctx.lineWidth = 2;
             ctx.beginPath(); ctx.roundRect(-8, 0, 16, 40, 8); ctx.fill(); ctx.stroke();
             ctx.translate(0, 35); ctx.rotate(0.5);
             ctx.beginPath(); ctx.roundRect(-6, 0, 12, 35, 6); ctx.fill(); ctx.stroke();
             ctx.translate(0, 35);
             ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();
             ctx.restore();

             // Draw Orbiting Shock Shield OR Warning Charge
             if (!shieldThrown && !isStaggered) {
                // If she's charging the shield, condense it
                const isCharging = (god.attackState === "WINDUP" && god.attackType === "SHOCK_SHIELD");
                const shieldRadius = isCharging ? (100 - Math.min(60, (now - god.nextAttackAtMs + 600)/10)) : (90 + Math.sin(now/150)*15);
                
                ctx.save();
                ctx.scale(1, 0.4); // Tilt ring into 3D perspective
                ctx.rotate(now / 500); // Spin the ring
                
                // Outer ring
                ctx.strokeStyle = `rgba(255, 50, 100, ${isCharging ? 0.9 : 0.6})`;
                ctx.lineWidth = isCharging ? 12 : 6;
                ctx.shadowColor = "#FF3366";
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.arc(0, 0, shieldRadius, 0, Math.PI*2);
                ctx.stroke();

                // Inner electric arcs
                ctx.strokeStyle = "white";
                ctx.lineWidth = 3;
                ctx.setLineDash([15, 25]);
                ctx.beginPath();
                ctx.arc(0, 0, shieldRadius - 5, -now/300, Math.PI*2 - now/300);
                ctx.stroke();
                
                ctx.restore();
             }
          }

          ctx.shadowBlur = 0;
          ctx.restore();
       }

       // 4. Intro Dialogue Box
       if (god.introActive && god.dialogueTimeMs > 2000) {
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.8, (god.dialogueTimeMs - 2000)/500)})`;
          ctx.fillRect(0, h/2 + 100, w, 100);
          ctx.strokeStyle = "white"; ctx.lineWidth = 2;
          ctx.strokeRect(0, h/2 + 100, w, 100);
          
          ctx.fillStyle = "white";
          ctx.font = "italic bold 28px monospace";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          // Typewriter effect
          const charsToShow = Math.floor((god.dialogueTimeMs - 2000) / 40);
          const visibleText = god.dialogue.substring(0, charsToShow);
          ctx.fillText(visibleText, w/2, h/2 + 150);
       }

       // 5. Active Combat Effects (Slashes, HUD, Orbs)
       if (god.active) {
           // Telegraph Effects during Windup
           if (god.attackState === "WINDUP" && god.telegraphs) {
              for (const tel of god.telegraphs) {
                 if (tel.isShield) {
                    // Draw massive circular warning for shock shield
                    ctx.save();
                    const isWarningPulse = Math.floor(now / 50) % 2 === 0;
                    ctx.fillStyle = `rgba(255, 0, 0, ${isWarningPulse ? 0.3 : 0.1})`;
                    ctx.strokeStyle = "rgba(255, 50, 50, 0.8)";
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(tel.x, tel.y, tel.radius, 0, Math.PI*2);
                    ctx.fill(); ctx.stroke();
                    ctx.restore();
                 } else {
                    ctx.save();
                    ctx.translate(tel.x, tel.y);
                    ctx.rotate(tel.angle);
                    const isWarningPulse = Math.floor(now / 50) % 2 === 0;
                    ctx.fillStyle = tel.isHeavy ? `rgba(255, 0, 0, ${isWarningPulse ? 0.3 : 0.1})` : `rgba(255, 100, 100, 0.2)`;
                    
                    // Diamond shape indicator matches exactly the hitbox
                    ctx.beginPath();
                    ctx.moveTo(-tel.length/2, 0);
                    ctx.lineTo(0, -(tel.width/2));
                    ctx.lineTo(tel.length/2, 0);
                    ctx.lineTo(0, (tel.width/2));
                    ctx.fill();
                    
                    ctx.strokeStyle = "rgba(255, 50, 50, 0.8)";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.restore();
                 }
              }
           }
          // Slash / Shield Effects
           for (const sl of god.slashEffects) {
              const activeRatio = sl.lifeMs / sl.maxLifeMs;
              const expRatio = 1.0 - activeRatio; // 0.0 to 1.0
              
              if (sl.isShieldRun) {
                 // Expanding Propelled Shock Shield
                 ctx.save();
                 const currentRadius = sl.maxRadius * expRatio;
                 ctx.strokeStyle = `rgba(255, 50, 100, ${activeRatio})`;
                 ctx.lineWidth = 40 * activeRatio;
                 ctx.shadowColor = "#FF3366";
                 ctx.shadowBlur = 30;
                 ctx.beginPath();
                 ctx.arc(sl.x, sl.y, currentRadius, 0, Math.PI*2);
                 ctx.stroke();
                 
                 // Core inner electric string
                 ctx.strokeStyle = `rgba(255, 255, 255, ${activeRatio})`;
                 ctx.lineWidth = 10 * activeRatio;
                 ctx.setLineDash([20, 40]);
                 ctx.stroke();
                 
                 ctx.restore();
              } else {
                 // Standard Diamond Sweep
                 ctx.save();
                 ctx.translate(sl.x, sl.y);
                 ctx.rotate(sl.angle);
                 
                 ctx.fillStyle = sl.isHeavy ? `rgba(255, 0, 50, ${activeRatio})` : `rgba(255, 255, 255, ${activeRatio})`;
                 ctx.shadowColor = sl.isHeavy ? "red" : "white";
                 ctx.shadowBlur = 20 * activeRatio;
                 
                 // Draw diamond sweep slash
                 ctx.beginPath();
                 ctx.moveTo(-sl.length/2, 0);
                 ctx.lineTo(0, -(sl.width/2) * activeRatio);
                 ctx.lineTo(sl.length/2, 0);
                 ctx.lineTo(0, (sl.width/2) * activeRatio);
                 ctx.fill();
                 ctx.restore();
              }
           }
          
          // Orb Collectible
          if (god.collectibleOrb) {
             const orb = god.collectibleOrb;
             ctx.shadowColor = "#FF3366"; ctx.shadowBlur = 15;
             ctx.fillStyle = "white";
             ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r + Math.sin(now/100)*3, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = "#FF3366";
             ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r*0.5, 0, Math.PI*2); ctx.fill();
             ctx.shadowBlur = 0;
          }

          // Boss HUD
          ctx.fillStyle = "white";
          ctx.font = "bold 24px monospace";
          ctx.textAlign = "center";
          ctx.shadowColor = "red"; ctx.shadowBlur = 10;
          ctx.fillText("THE SHOCK EMPRESS", w / 2, 40);
          ctx.shadowBlur = 0;

          // Boss HP Bar
          ctx.fillStyle = "rgba(50, 0, 0, 0.5)";
          ctx.fillRect(w / 2 - 200, 60, 400, 15);
          ctx.fillStyle = "white";
          const hpRatio = Math.max(0, god.hp / 300);
          ctx.fillRect(w / 2 - 200, 60, 400 * hpRatio, 15);
          ctx.strokeStyle = "#FF3366"; ctx.lineWidth = 2;
          ctx.strokeRect(w / 2 - 200, 60, 400, 15);
          
          // Stagger UI
          const isStaggered = elapsedMs < god.staggeredUntilMs;
          if (isStaggered) {
             ctx.fillStyle = "rgba(100, 255, 100, 0.2)";
             ctx.fillRect(0,0,w,h);
             ctx.fillStyle = "lime";
             ctx.font = "bold 36px monospace";
             ctx.fillText("STAGGERED! ATTACK NOW!", w/2, 120);
          } else {
             // Charge Bar UI
             const chargeText = god.orbCharge >= god.orbChargeMax ? "PRESS R - SHOCKWAVE READY!" : `CHARGE: ${god.orbCharge} / ${god.orbChargeMax}`;
             ctx.fillStyle = god.orbCharge >= god.orbChargeMax ? "#FF3366" : "rgba(255, 255, 255, 0.8)";
             ctx.font = god.orbCharge >= god.orbChargeMax ? "bold 24px monospace" : "18px monospace";
             if (god.orbCharge >= god.orbChargeMax && Math.floor(now / 100) % 2 === 0) {
               ctx.fillStyle = "white";
               ctx.shadowColor = "#FF3366"; ctx.shadowBlur = 20;
             }
             ctx.fillText(chargeText, w / 2, h - 40);
             ctx.shadowBlur = 0;
          }
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

    // Ranked Match - Waiting for Opponent Overlay
    if (radianceWaiting) {
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(0, 0, w, h);

      // ASCENSION GLOW
      ctx.fillStyle = `rgba(255, 230, 180, ${0.15 + 0.1 * Math.sin(nowMs / 800)})`;
      ctx.fillRect(0, 0, w, h);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.shadowColor = "gold";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.font = "900 52px monospace";
      ctx.fillText("RADIANCE DEFEATED", w / 2, h / 2 - 30);

      ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(200, 200, 200, 0.8)";
      ctx.font = "600 24px monospace";
      ctx.fillText("WAITING FOR OPPONENT", w / 2, h / 2 + 40);

      const dots = ".".repeat((Math.floor(nowMs / 400) % 4));
      ctx.textAlign = "left";
      ctx.fillText(dots, w / 2 + 150, h / 2 + 40);

      ctx.shadowBlur = 0;
    }

    if (phaseRef.current === PHASE.PLAYING) {
      if (!document.hidden) {
        rafRef.current = requestAnimationFrame(loop);
      }
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
            enemyHp={isStandaloneSans ? 100 : enemyHp}
            timerText={timerText}
            hpHitPulse={hpPulse}
            enemyHitFlash={enemyHitFlash}
            enemyHpPulse={enemyHpPulse}
            enemyHealFlash={enemyHealFlash}
            phase={phase}
            guardStatus={guardStatus}
            corruptHealRem={Math.max(0, (corruptHealUntilRef.current - nowMs) / 1000)}
            isCompetitive={vsMode === "ranked" || vsMode === "friend"}
            isStandaloneSans={isStandaloneSans}
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
                  onClick={() => {
                    ensureRadianceMusicStoppedImmediately();
                    exitToMenu();
                  }}
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
                  onClick={() => {
                    ensureRadianceMusicStoppedImmediately();
                    exitToMenu();
                  }}
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

