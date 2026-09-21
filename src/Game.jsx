// client/src/Game.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "./socket";
import { submitTimeTrial, unlockBoss } from "./api";
import RankBadge from "./ui/RankBadge";
import RankChangeToast from "./ui/RankChangeToast";
import MobileControls, { LandscapePrompt } from "./components/MobileControls";
import radianceMusicAsset from "../assets/music/RadiantBossFight.mp3";
import goddessMusicAsset from "../assets/music/GoddessBossFight.mp3";

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
function getEnemyInfo({ p1, p2, me, currentSocketId }) {
  const mySockId = currentSocketId || socket?.id;
  const meUid = me?.uid;
  const left = p1 || null;
  const right = p2 || null;

  let enemy = null;
  // 1. Match by unique socketId first (vital when testing 2 windows with same login)
  if (mySockId && left?.socketId === mySockId) {
    enemy = right;
  } else if (mySockId && right?.socketId === mySockId) {
    enemy = left;
  } else if (meUid && left?.uid === meUid && right?.uid !== meUid) {
    enemy = right;
  } else if (meUid && right?.uid === meUid && left?.uid !== meUid) {
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
function getOpponentName(me, matchInfo, currentSocketId) {
  const mySockId = currentSocketId || socket?.id;
  const meUid = me?.uid;
  const p1 = matchInfo?.p1;
  const p2 = matchInfo?.p2;

  if (mySockId && p1?.socketId === mySockId) {
    return safeUsername(p2?.username) || "OPPONENT";
  }
  if (mySockId && p2?.socketId === mySockId) {
    return safeUsername(p1?.username) || "OPPONENT";
  }
  if (meUid && p1?.uid === meUid && p2?.uid !== meUid) {
    return safeUsername(p2?.username) || "OPPONENT";
  }
  if (meUid && p2?.uid === meUid && p1?.uid !== meUid) {
    return safeUsername(p1?.username) || "OPPONENT";
  }
  // Fallback: prefer p2, then p1
  return safeUsername(p2?.username || p1?.username) || "OPPONENT";
}

function getTimeTrialRankClient(ms) {
  const time = Math.max(0, Number(ms) || 0);
  if (time >= 180000) return "legendary";
  if (time >= 120000) return "diamond";
  if (time >= 90000) return "platinum";
  if (time >= 60000) return "gold";
  if (time >= 30000) return "silver";
  return "bronze";
}

function getTimeTrialTitleClient(ms) {
  const rank = getTimeTrialRankClient(ms);
  const titles = {
    legendary: "IMMORTAL SURVIVOR",
    diamond: "DIAMOND SURVIVOR",
    platinum: "ELITE SURVIVOR",
    gold: "VETERAN SURVIVOR",
    silver: "ADEPT SURVIVOR",
    bronze: "INITIATE SURVIVOR",
  };
  return titles[rank] || "SURVIVOR";
}

function getNextTierGoal(ms) {
  const time = Math.max(0, Number(ms) || 0);
  if (time < 30000) return `Adept in ${Math.ceil((30000 - time) / 1000)}s`;
  if (time < 60000) return `Veteran in ${Math.ceil((60000 - time) / 1000)}s`;
  if (time < 90000) return `Elite in ${Math.ceil((90000 - time) / 1000)}s`;
  if (time < 120000) return `Diamond in ${Math.ceil((120000 - time) / 1000)}s`;
  if (time < 180000) return `Immortal in ${Math.ceil((180000 - time) / 1000)}s`;
  return "MAX TIER 👑";
}

// ========== HeaderBar Component (Internal) ==========
// Clean top HUD bar above canvas - shown during COUNTDOWN + PLAYING
function HeaderBar({
  myName, oppName,
  hp, enemyHp,
  timerText,
  hpHitPulse, enemyHitFlash, enemyHpPulse, enemyHealFlash,
  phase, guardStatus, corruptHealRem,
  isCompetitive, isStandaloneSans,
  onExit,
}) {
  const showBar = phase === PHASE.COUNTDOWN || phase === PHASE.PLAYING;

  if (!showBar) return null;

  const isCorruptActive = corruptHealRem > 0;
  const showEnemyHp = isCompetitive || isStandaloneSans;

  return (
    <div className="flex items-center justify-between px-2 sm:px-4 py-1 sm:py-2 border-b-2 sm:border-b-4 border-white bg-black min-h-[42px] sm:min-h-[56px] font-pixel">
      {/* Left: Names */}
      <div className="w-[30%] min-w-0 flex items-center gap-1.5 sm:gap-2">
        <span className="text-[#ff0000] text-[10px] sm:text-xs animate-heartbeat">❤️</span>
        <span className="text-[10px] sm:text-xs text-white truncate uppercase tracking-wide">
          {myName}
        </span>
        <span className="mx-0.5 sm:mx-1 text-neutral-500 text-[9px] sm:text-xs">VS</span>
        <span className="text-[10px] sm:text-xs text-neutral-400 truncate uppercase tracking-wide">
          {oppName}
        </span>
      </div>

      {/* Center: Timer */}
      <div className="w-[32%] flex justify-center">
        <span className={`text-lg sm:text-2xl text-white tabular-nums tracking-widest ${phase === PHASE.PLAYING ? 'text-[#ffff00]' : 'text-white'}`}>
          {timerText}
        </span>
      </div>

      {/* Right: HP Bars */}
      <div className="w-[38%] flex justify-end items-center gap-4">
        {/* Opponent HP (Competitive) */}
        {showEnemyHp && oppName && (
          <div className="flex flex-col items-end gap-1">
            <div className="text-[9px] text-neutral-400 tracking-widest">{isStandaloneSans ? '* BOSS HP' : '* OPP HP'}</div>
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-3 bg-[#880000] border border-white/60 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${enemyHitFlash ? 'bg-red-400' : enemyHealFlash ? 'bg-[#00ff00]' : 'bg-[#ff9900]'}`}
                  style={{ width: `${Math.max(0, Math.min(100, enemyHp))}%` }}
                />
              </div>
              <span className={`text-xs tabular-nums transition-all duration-150 ${enemyHitFlash ? 'text-red-400' : enemyHealFlash ? 'text-[#00ff00]' : 'text-neutral-300'}`}>
                {enemyHpPulse ? '???' : enemyHp}
              </span>
            </div>
          </div>
        )}

        {/* My HP Bar */}
        <div className="flex flex-col items-end gap-1 border-l-2 border-white/20 pl-4">
          {isCorruptActive && (
            <div className="text-[9px] text-[#ff00ff] animate-pulse tracking-wider">
              REV: {corruptHealRem.toFixed(1)}s
            </div>
          )}
          <div className="text-[9px] text-neutral-400 tracking-widest">* MY HP</div>
          <div className="flex items-center gap-1.5">
            <div className="w-24 h-3 bg-[#880000] border border-white/60 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${hpHitPulse ? 'bg-red-400' : 'bg-[#ffff00]'}`}
                style={{ width: `${Math.max(0, Math.min(100, hp))}%` }}
              />
            </div>
            <span className={`text-xs tabular-nums transition-all duration-150 ${hpHitPulse ? 'text-red-400 scale-110' : 'text-white'}`}>
              {hp}
            </span>
          </div>
        </div>

        {/* Exit match button */}
        {onExit && (
          <button
            onClick={onExit}
            className="text-[9px] sm:text-[10px] border border-[#ffff00] text-[#ffff00] hover:bg-[#ffff00] hover:text-black px-2 py-1 transition cursor-pointer flex-shrink-0 font-pixel active:scale-95"
            title="Leave Match and return to Menu"
          >
            [ EXIT ]
          </button>
        )}
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
  initialMatchData = null,
  onExit,
  onBack,
  onMeUpdate,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const keysRef = useRef(new Set());

  // ── Mobile touch controls ──────────────────────────────────────────────────
  // joystickInputRef: { ax: -1..1, ay: -1..1 } written by the virtual joystick
  const joystickInputRef = useRef({ ax: 0, ay: 0 });
  // pendingMobileTriggerRef: buffered button taps from touch buttons
  const pendingMobileTriggerRef = useRef({ dash: false, guard: false, special: false });
  // Focus / Slow-Mo precision dodging ref (50% speed)
  const focusActiveRef = useRef(false);
  // Detect touch device (used to show/hide mobile controls overlay)
  const [isTouchDevice] = useState(() =>
    typeof window !== "undefined" &&
    ("ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia?.("(pointer: coarse)")?.matches)
  );
  // Active touch controls toggle (auto-enables on touch or screens <= 950px)
  const [showTouchControls, setShowTouchControls] = useState(() =>
    typeof window !== "undefined" &&
    ("ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      window.innerWidth <= 950)
  );
  // Orientation tracking: landscape vs portrait
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight > window.innerWidth : false
  );
  const [dismissPortraitPrompt, setDismissPortraitPrompt] = useState(false);
  // Mobile HUD refresh state – tick every 100ms so button readiness and cooldowns update visually
  const [mobileTick, setMobileTick] = useState(0);

  useEffect(() => {
    const handleOrientation = () => {
      if (typeof window === "undefined") return;
      setIsPortrait(window.innerHeight > window.innerWidth);
      if (
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia?.("(pointer: coarse)")?.matches ||
        window.innerWidth <= 950
      ) {
        setShowTouchControls(true);
      }
    };
    window.addEventListener("resize", handleOrientation);
    window.addEventListener("orientationchange", handleOrientation);
    return () => {
      window.removeEventListener("resize", handleOrientation);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMobileTick((t) => (t + 1) % 10000);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const lastHitAtRef = useRef(-9999);
  const phaseRef = useRef(PHASE.MENU);
  const roomIdRef = useRef(null);

  // ====== Radiance Boss Music Setup ======
  const radianceMusicRef = useRef(null);
  const radianceFadeRef = useRef(null);
  const radianceMusicStartedRef = useRef(false);

  // ====== Goddess Boss Music Setup ======
  const goddessMusicRef = useRef(null);
  const goddessFadeRef = useRef(null);
  const goddessMusicStartedRef = useRef(false);

  useEffect(() => {
    const audio = new Audio(radianceMusicAsset);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = "auto";
    radianceMusicRef.current = audio;

    const gAudio = new Audio(goddessMusicAsset);
    gAudio.loop = true;
    gAudio.volume = 0;
    gAudio.preload = "auto";
    goddessMusicRef.current = gAudio;

    return () => {
      ensureRadianceMusicStoppedImmediately();
      ensureGoddessMusicStoppedImmediately();
      radianceMusicRef.current = null;
      goddessMusicRef.current = null;
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
    
    fadeAudioTo(audio, 0.4, 5000, radianceFadeRef);
  }

  function startGoddessMusic() {
    if (!goddessMusicRef.current || goddessMusicStartedRef.current) return;
    goddessMusicStartedRef.current = true;
    
    const audio = goddessMusicRef.current;
    
    // Clear any existing fades
    if (goddessFadeRef.current) clearInterval(goddessFadeRef.current);
    
    audio.volume = 0.02;
    audio.play().catch(() => {});
    
    // Fade in over 5s to 0.4
    fadeAudioTo(audio, 0.4, 5000, goddessFadeRef);
  }

  function fadeAudioTo(audio, targetVolume, durationMs, reqFadeRef, onDone) {
    if (reqFadeRef.current) clearInterval(reqFadeRef.current);
    
    const startVol = audio.volume;
    const diff = targetVolume - startVol;
    const steps = 20;
    const stepTime = durationMs / steps;
    const volStep = diff / steps;
    
    let currentStep = 0;
    reqFadeRef.current = setInterval(() => {
      currentStep++;
      let nextVol = startVol + (volStep * currentStep);
      nextVol = clamp(nextVol, 0, 1);
      
      try { audio.volume = nextVol; } catch (e) {}

      if (currentStep >= steps) {
        clearInterval(reqFadeRef.current);
        reqFadeRef.current = null;
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
    fadeAudioTo(radianceMusicRef.current, 0, 2000, radianceFadeRef, () => {
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

  function stopGoddessMusic() {
    if (!goddessMusicRef.current || !goddessMusicStartedRef.current) return;
    goddessMusicStartedRef.current = false;
    fadeAudioTo(goddessMusicRef.current, 0, 2000, goddessFadeRef, () => {
      if (goddessMusicRef.current) {
        goddessMusicRef.current.pause();
        goddessMusicRef.current.currentTime = 0;
      }
    });
  }

  function ensureGoddessMusicStoppedImmediately() {
    goddessMusicStartedRef.current = false;
    if (goddessFadeRef.current) {
      clearInterval(goddessFadeRef.current);
      goddessFadeRef.current = null;
    }
    const audio = goddessMusicRef.current;
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
    missileLasers: [],
    undyingVortexes: [],
    undyingPhantom: null,
    soulShards: [],
    shardsPurged: 0,
    shardsRequired: 3,
    staggeredUntilMs: 0,
    particles: [],
  });

  const shakeRef = useRef({ until: 0, amp: 0 });
  const dashRef = useRef({ active: false, until: 0, cooldownUntil: 0, dirX: 0, dirY: 0 });
  const playerTrailRef = useRef([]);
  const opponentSoulRef = useRef({
    currentX: 490,
    currentY: 270,
    targetX: 490,
    targetY: 270,
    isDashing: false,
    isGuarding: false,
    isHealing: false,
    hitFlashUntil: 0,
    lastUpdate: 0,
    initialized: false,
    trail: [],
    hp: 100,
  });

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
    x: 0,
    y: 120,
    baseY: 120,
    slamState: null,
    slamTimer: 0,
    shockwaves: [],
    earthDebris: [],
    dustClouds: [],
    godRays: [],
    celestialStars: [],
    swordCascades: [],
    lightPillars: [],
    missileLasers: [],
    undyingVortexes: [],
    undyingStalker: null,
    cameraPunch: { zoom: 1, targetZoom: 1, offsetY: 0 },
    timeDilation: 1.0,
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
    ) : getOpponentName(me, matchInfo, myId || socket.id);

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

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const opponentNameRef = useRef(opponentName);
  useEffect(() => {
    opponentNameRef.current = opponentName;
  }, [opponentName]);

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

  function playSlamImpactSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const now = ctx.currentTime;
      // Heavy sub-bass thump
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.65);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
      osc.start(now);
      osc.stop(now + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);

      // Noise punch for seismic earth crunch
      const bufferSize = Math.floor(ctx.sampleRate * 0.4);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(750, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(90, now + 0.4);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
    } catch { }
  }

  function playStarChimeSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const now = ctx.currentTime;
      [880, 1108, 1320, 1760].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.035);
        gain.gain.setValueAtTime(0.12, now + idx * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.45);
        osc.start(now + idx * 0.035);
        osc.stop(now + idx * 0.035 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
      });
    } catch { }
  }

  function playStarWhooshSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.4);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch { }
  }

  function playLaserTargetLockSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.setValueAtTime(1850, now + 0.05);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch { }
  }

  function playMissileDescendSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.55);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch { }
  }

  function playMissileExplosionSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const now = ctx.currentTime;
      // Sub punch
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);

      // Noise burst
      const bufferSize = Math.floor(ctx.sampleRate * 0.25);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
    } catch { }
  }

  function playUndyingPulseSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.6);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch { }
  }

  function playUndyingShatterSound() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || !audioUnlockedRef.current) return;
      const now = ctx.currentTime;
      // High-pitched crystal shatter
      [1500, 1920, 2400, 3100].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now + idx * 0.02);
        osc.frequency.exponentialRampToValueAtTime(120, now + idx * 0.02 + 0.4);
        gain.gain.setValueAtTime(0.2, now + idx * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.02 + 0.4);
        osc.start(now + idx * 0.02);
        osc.stop(now + idx * 0.02 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
      });
    } catch { }
  }

  function addShake(amount = 10, ms = 140) {
    const now = Date.now();
    shakeRef.current.amp = Math.max(shakeRef.current.amp, amount);
    shakeRef.current.until = Math.max(shakeRef.current.until, now + ms);
  }

  const triggerSpecialAction = () => {
    if (phaseRef.current !== PHASE.PLAYING) return;
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

      // DISPEL PERSISTENT UNDYING ATTACKS!
      if (rad.undyingStalker || (rad.undyingVortexes && rad.undyingVortexes.length > 0)) {
        playUndyingShatterSound();
        rad.undyingStalker = null;
        rad.undyingVortexes = [];
        healTextRef.current = { text: "⚡ UNDYING ATTACK DISPELLED! ⚡", until: Date.now() + 2500 };
        setHpPulse(true);
        setTimeout(() => setHpPulse(false), 300);
      }
      return;
    }

    if (god.active && god.orbCharge >= god.orbChargeMax) {
      god.orbCharge = 0;
      god.collectibleOrb = null;
      god.hp = Math.max(0, god.hp - 20);
      const currentElapsed = Date.now() - surviveStartRef.current;
      god.staggeredUntilMs = currentElapsed + 3500;

      addShake(30, 800);
      playLaserFireSound();

      radParticlesRef.current.booms.push({ r: 10, maxR: 1200, life: 0.6, elapsed: 0 });

      for (let i = 0; i < 30; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 200 + Math.random() * 400;
        radParticlesRef.current.sparks.push({
          x: god.x, y: god.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
          life: 0.3 + Math.random() * 0.4, elapsed: 0, r: 2 + Math.random() * 3,
          color: "white"
        });
      }
      return;
    }

    // Default fallback (Ranked / Multiplayer / Survival): Focus mode (precision slow-mo)
    focusActiveRef.current = !focusActiveRef.current;
    addShake(2, 60);
  };

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
        triggerSpecialAction();
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

        // Safe enemy identification - use socket.id for precise disambiguation
        const { enemyName: enemy, enemySocketId: eSocketId } = getEnemyInfo({ p1, p2, me, currentSocketId: socket.id });
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
          opponentSoulRef.current.hp = newHp;
          if (newHp < prevEnemyHpRef.current) {
            opponentSoulRef.current.hitFlashUntil = Date.now() + 200;
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

  // --- Dedicated stable listener for opponent real-time position (always mounted) ---
  useEffect(() => {
    const onOpponentPosition = (data) => {
      try {
        if (!data) return;
        const { x, y, isDashing, isGuarding, isHealing } = data;
        const opp = opponentSoulRef.current;
        if (!opp.initialized) {
          opp.currentX = x;
          opp.currentY = y;
          opp.initialized = true;
        }
        opp.targetX = x;
        opp.targetY = y;
        opp.isDashing = !!isDashing;
        opp.isGuarding = !!isGuarding;
        opp.isHealing = !!isHealing;
        opp.lastUpdate = Date.now();
      } catch (err) {
        console.error("[game:opponentPosition] error:", err);
      }
    };
    socket.on("game:opponentPosition", onOpponentPosition);
    return () => socket.off("game:opponentPosition", onOpponentPosition);
  }, []);

  // --- Broadcast local HP changes to opponent ---
  useEffect(() => {
    const isCompetitive = mode === "ranked" || mode === "friend";
    if (isCompetitive && roomIdRef.current && phase === PHASE.PLAYING) {
      socket.emit("game:hpUpdate", { roomId: roomIdRef.current, hp, maxHp: maxHpRef.current });
    }
  }, [hp, phase, mode]);

  // --- Immediate match initialization when initialMatchData prop is provided ---
  useEffect(() => {
    if (initialMatchData?.roomId && phase === PHASE.MENU) {
      try {
        console.log("[Game] Initializing from initialMatchData:", initialMatchData);
        const { roomId: rId, startAt: sAt, seed: sSeed, mode: mMode, p1, p2 } = initialMatchData;

        lastResultRef.current = null;
        setRoomId(rId);
        setStartAt(sAt);
        if (typeof sSeed === "number") setSeed(sSeed);

        setMatchInfo({ mode: mMode || mode || "friend", p1: p1 || null, p2: p2 || null });

        const { enemyName: enemy, enemySocketId: eSocketId } = getEnemyInfo({ p1, p2, me, currentSocketId: socket.id });
        setEnemyName(enemy);
        setEnemySocketId(eSocketId);
        setEnemyHp(100);
        prevHpRef.current = 100;

        setWinnerId(null);
        phaseRef.current = PHASE.MATCH_FOUND;
        setPhase(PHASE.MATCH_FOUND);

        setTimeout(() => {
          phaseRef.current = PHASE.COUNTDOWN;
          setPhase(PHASE.COUNTDOWN);
        }, 900);
      } catch (err) {
        console.error("[Game] initialMatchData init error:", err);
      }
    }
  }, [initialMatchData]);

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

  // --- Time Trial: submit score once when entering SUMMARY phase ---
  const timeTrialSubmittedRef = useRef(false);

  useEffect(() => {
    if (mode !== "timeTrial" || phase !== PHASE.SUMMARY) {
      timeTrialSubmittedRef.current = false;
      return;
    }

    if (timeTrialSubmittedRef.current) return;
    timeTrialSubmittedRef.current = true;

    // Calculate survival time using frozen endAt timestamp
    const s = surviveStart;
    if (s <= 0) return;

    const finalTime = endAt ?? Date.now();
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
  }, [mode, phase, surviveStart, endAt]);

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
      missileLasers: [],
      undyingVortexes: [],
      undyingPhantom: null,
      soulShards: [],
      shardsPurged: 0,
      shardsRequired: 3,
      staggeredUntilMs: 0,
      particles: [],
    };
    lastHitAtRef.current = -9999;
    prevHpRef.current = 100;

    // Reset guard skill
    guardUntilRef.current = 0;
    guardCdUntilRef.current = 0;
    corruptHealUntilRef.current = 0;

    shakeRef.current = { until: 0, amp: 0 };
    dashRef.current = { active: false, until: 0, cooldownUntil: 0, dirX: 0, dirY: 0, lastDx: 1, lastDy: 0 };
    playerTrailRef.current = [];
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
      x: 0,
      y: 120,
      baseY: 120,
      slamState: null,
      slamTimer: 0,
      shockwaves: [],
      earthDebris: [],
      dustClouds: [],
      godRays: [],
      celestialStars: [],
      swordCascades: [],
      lightPillars: [],
      missileLasers: [],
      undyingVortexes: [],
      undyingStalker: null,
      cameraPunch: { zoom: 1, targetZoom: 1, offsetY: 0 },
      timeDilation: 1.0,
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
    const w = c?.width || 980;
    const h = c?.height || 540;

    playerRef.current = { x: w / 2, y: h / 2, r: 10 };
    opponentSoulRef.current = {
      currentX: w / 2,
      currentY: h / 2,
      targetX: w / 2,
      targetY: h / 2,
      isDashing: false,
      isGuarding: false,
      isHealing: false,
      hitFlashUntil: 0,
      lastUpdate: 0,
      initialized: false,
      trail: [],
      hp: 100,
    };
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

    ensureRadianceMusicStoppedImmediately();
    ensureGoddessMusicStoppedImmediately();

    if (mode === "ranked" && phaseRef.current === PHASE.PLAYING && rid) {
      socket.emit("game:forfeit", { roomId: rid });
    }

    cancelAnimationFrame(rafRef.current);

    try {
      if (phaseRef.current === PHASE.QUEUE && mode !== "timeTrial") {
        socket.emit("matchmaking:leave");
      }
    } catch { }

    if (onExit) onExit();
    else if (onBack) onBack();
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
      setTimeTrialSubmissionMsg("Recording survival record...");

      const result = await submitTimeTrial(timeMs);

      if (result?.ok) {
        setBestTimeTrialMs(result.bestTimeTrialMs);
        setTimeTrialImproved(result.improved);
        setTimeTrialSubmissionStatus("success");
        const rankTitle = result.timeTrialTitle || getTimeTrialTitleClient(timeMs);

        if (result.improved) {
          setTimeTrialSubmissionMsg(`New Personal Best! 🎉 ${rankTitle}`);
        } else {
          setTimeTrialSubmissionMsg(`Rank: ${rankTitle}`);
        }

        if (onMeUpdate) {
          onMeUpdate({
            bestTimeTrialMs: result.bestTimeTrialMs,
            timeTrialRank: result.timeTrialRank,
          });
        }
      } else {
        setTimeTrialSubmissionStatus("error");
        setTimeTrialSubmissionMsg(result?.error || "Could not submit time");
      }
    } catch (e) {
      setTimeTrialSubmissionStatus("error");
      setTimeTrialSubmissionMsg("Error: " + String(e.message || e));
    }
  }

  // Web Worker ticker: ensures the game loop and simulation NEVER pause when minimized or tabbed out
  useEffect(() => {
    let worker = null;
    let workerUrl = null;

    try {
      const workerBlob = new Blob([
        `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) {
              timer = setInterval(function() {
                self.postMessage('tick');
              }, 1000 / 60);
            }
          } else if (e.data === 'stop') {
            if (timer) {
              clearInterval(timer);
              timer = null;
            }
          }
        };
        `
      ], { type: 'application/javascript' });

      workerUrl = URL.createObjectURL(workerBlob);
      worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        if (e.data === 'tick') {
          // When page is minimized/hidden, browser suspends rAF.
          // The background worker drives the physics and damage simulation so the game NEVER freezes!
          if (document.hidden && phaseRef.current === PHASE.PLAYING) {
            loop(true);
          }
        }
      };

      if (phase === PHASE.PLAYING) {
        worker.postMessage('start');
      }
    } catch (err) {
      console.warn("[Game] Web Worker background ticker unavailable:", err);
    }

    return () => {
      if (worker) {
        worker.postMessage('stop');
        worker.terminate();
      }
      if (workerUrl) {
        URL.revokeObjectURL(workerUrl);
      }
    };
  }, [phase]);

  // Handle visibility change: instantly resume rAF when user returns to tab
  useEffect(() => {
    const handleVisChange = () => {
      if (!document.hidden && phaseRef.current === PHASE.PLAYING) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => loop(false));
      }
    };
    document.addEventListener("visibilitychange", handleVisChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisChange);
    };
  }, []);

  // Watchdog: if the loop stalls while playing, restart it
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (phaseRef.current !== PHASE.PLAYING) return;
      const lastTick = loop._lastTickMs ?? 0;
      if (Date.now() - lastTick > 2000) {
        console.warn("[GameLoop] Watchdog detected stall – restarting loop");
        loop._lastNow = Date.now();
        if (!document.hidden) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => loop(false));
        } else {
          loop(true);
        }
      }
    }, 1000);
    return () => clearInterval(watchdog);
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
    const isDashing = dashRef.current && dashRef.current.active && now < dashRef.current.until;
    return isDashing || (now - lastHitAtRef.current < 650);
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

    // Check if boss is currently staggered from dispelling the Undying Phantom
    const isStaggered = elapsedMs < boss.staggeredUntilMs;

    if (elapsedMs >= boss.nextAttackMs && !isStaggered) {
      boss.attackCount++;
      const rand = rngRef.current;
      const hasActiveUndying = boss.undyingPhantom || (boss.undyingVortexes && boss.undyingVortexes.length > 0);
      
      // Determine attack type (0: Missile Laser, 1: Undying, 2: Gaster Blasters, 3: Bone Wall)
      let attackType;
      if (!hasActiveUndying && boss.attackCount % 3 === 2) {
        attackType = 1; // Prioritize Undying attack early in the encounter
      } else {
        const pool = [0, 0, 1, 2, 3];
        attackType = pool[Math.floor(rand() * pool.length)];
      }

      if (attackType === 0) {
        // --- MISSILE LASER ATTACK ---
        // Missiles descend from above onto the arena, with laser markers indicating their impact zones.
        // Players must quickly move away from the targeted areas to avoid damage.
        playLaserTargetLockSound();
        const isTracking = rand() > 0.25; // 75% tracking (was 60%)
        const missileCount = isTracking ? 6 : 7; // more missiles

        for (let m = 0; m < missileCount; m++) {
          let targetX, targetY;
          const delay = m * 0.22; // tighter stagger (was 0.28)
          const chargeDuration = 0.75 + delay; // faster charge (was 0.95)

          if (isTracking) {
            // Tracking Salvo: aggressive lead prediction
            const leadDist = 60; // more lead (was 45)
            const pDirX = dashRef.current.lastDx || 0;
            const pDirY = dashRef.current.lastDy || 0;
            targetX = clamp(p.x + pDirX * leadDist * m + (rand() - 0.5) * 35, 50, w - 50);
            targetY = clamp(p.y + pDirY * leadDist * m + (rand() - 0.5) * 35, 50, h - 50);
          } else {
            // Grid Bombing: denser coverage
            const col = m % 3;
            const row = Math.floor(m / 3);
            targetX = clamp(w * 0.18 + col * (w * 0.32) + (rand() - 0.5) * 30, 50, w - 50);
            targetY = clamp(h * 0.28 + row * (h * 0.35) + (rand() - 0.5) * 30, 50, h - 50);
          }

          boss.missileLasers.push({
            id: Math.random(),
            targetX,
            targetY,
            radius: 50,
            chargeDuration,
            chargeElapsed: 0,
            state: "TARGETING",
            missileY: -140,
            speed: 1700, // faster descent (was 1250)
            explosionElapsed: 0,
            explosionLife: 0.35,
            hasHitPlayer: false
          });
        }
        boss.nextAttackMs = elapsedMs + 2000 + rand() * 300; // faster cooldown (was 2800+400)

      } else if (attackType === 1) {
        // --- UNDYING ATTACKS ---
        // Persistent attacks that remain active for a set duration or continue until a specific condition is met,
        // forcing players to constantly adapt and avoid them.
        if (!hasActiveUndying) {
          const chooseVortex = rand() > 0.5;

          if (chooseVortex) {
            // VARIANT A: Undying Karma Vortexes (Set Duration: 12 seconds)
            boss.undyingVortexes = [
              {
                id: 1,
                centerX: w * 0.3,
                centerY: h * 0.45,
                radiusX: 120,
                radiusY: 80,
                orbitSpeed: 1.4, // faster (was 0.85)
                angle: 0,
                duration: 14.0, // longer duration (was 12)
                elapsed: 0,
                pulseTimer: 0,
                coreRadius: 20,
                activePulse: null,
                x: w * 0.3,
                y: h * 0.45
              },
              {
                id: 2,
                centerX: w * 0.7,
                centerY: h * 0.55,
                radiusX: 120,
                radiusY: 80,
                orbitSpeed: -1.25, // faster (was -0.75)
                angle: Math.PI,
                duration: 14.0,
                elapsed: 0,
                pulseTimer: 0.9,
                coreRadius: 20,
                activePulse: null,
                x: w * 0.7,
                y: h * 0.55
              }
            ];
            playBossWarningSound();
          } else {
            // VARIANT B: The Undying Wraith Phantom (Condition-based: Purge 3 Pure Soul Shards!)
            boss.undyingPhantom = {
              x: w / 2,
              y: 90,
              vx: 0,
              vy: 0,
              radius: 22,
              speed: 180, // much faster chase (was 100)
              elapsed: 0,
              beamAngle: 0
            };
            boss.shardsPurged = 0;
            boss.shardsRequired = 3;
            // Spawn 3 Pure Soul Shards spaced across the arena
            boss.soulShards = [
              { id: 1, x: clamp(w * 0.2 + (rand() - 0.5) * 60, 60, w - 60), y: clamp(h * 0.3 + (rand() - 0.5) * 50, 60, h - 60), r: 12 },
              { id: 2, x: clamp(w * 0.8 + (rand() - 0.5) * 60, 60, w - 60), y: clamp(h * 0.4 + (rand() - 0.5) * 50, 60, h - 60), r: 12 },
              { id: 3, x: clamp(w * 0.5 + (rand() - 0.5) * 80, 60, w - 60), y: clamp(h * 0.75 + (rand() - 0.5) * 50, 60, h - 60), r: 12 },
            ];
            playBossWarningSound();
          }
          boss.nextAttackMs = elapsedMs + 1900 + rand() * 300; // faster (was 2600+400)
        } else {
          // An undying attack is already active! Maintain heavy pressure with Twin Gaster Blasters
          boss.lasers.push({ x: w / 2, y: p.y, isHoriz: true, chargeTime: 0.38, activeTime: 0.45, elapsed: 0, spawnedAtMs: elapsedMs, thick: 90 });
          boss.lasers.push({ x: p.x, y: h / 2, isHoriz: false, chargeTime: 0.38, activeTime: 0.45, elapsed: 0, spawnedAtMs: elapsedMs, thick: 90 });
          boss.lasers.push({ x: w * 0.5, y: p.y + (rand() > 0.5 ? 80 : -80), isHoriz: true, chargeTime: 0.55, activeTime: 0.35, elapsed: 0, spawnedAtMs: elapsedMs, thick: 70 });
          playLaserChargeSound();
          boss.nextAttackMs = elapsedMs + 1600 + rand() * 300; // faster (was 2200+400)
        }

      } else if (attackType === 2) {
        // Twin Gaster Blaster lasers — faster charge, bigger beams, cross-pattern
        boss.lasers.push({
          x: w / 2,
          y: p.y,
          isHoriz: true,
          chargeTime: 0.38, // faster charge (was 0.55)
          activeTime: 0.45, // longer active (was 0.35)
          elapsed: 0,
          spawnedAtMs: elapsedMs,
          thick: 90, // wider (was 80)
        });
        boss.lasers.push({
          x: p.x,
          y: h / 2,
          isHoriz: false,
          chargeTime: 0.38,
          activeTime: 0.45,
          elapsed: 0,
          spawnedAtMs: elapsedMs,
          thick: 90,
        });
        // Third diagonal pressure laser
        boss.lasers.push({
          x: clamp(p.x + (rand() > 0.5 ? 100 : -100), 50, w - 50),
          y: 0,
          isHoriz: false,
          chargeTime: 0.50,
          activeTime: 0.40,
          elapsed: 0,
          spawnedAtMs: elapsedMs,
          thick: 65,
        });
        playLaserChargeSound();
        boss.nextAttackMs = elapsedMs + 1400 + rand() * 300; // faster (was 1900+400)

      } else if (attackType === 3) {
        // Bone Wall — faster, narrower gap, double wall variant
        const isHoriz = rand() > 0.5;
        const gapSize = 65; // smaller safe gap (was 90)
        const gapStart = 30 + rand() * (isHoriz ? h - 130 : w - 130);
        const speed = 480; // faster (was 360)
        const fromLeftOrTop = rand() > 0.5;

        const count = isHoriz ? h / 28 : w / 28; // denser bones
        for (let i = 0; i <= count; i++) {
          const pos = i * 28;
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
        boss.nextAttackMs = elapsedMs + 1200 + rand() * 300; // faster (was 1700+400)
      }
    }

    // Update Bone Projectiles
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

    // Update Gaster Lasers
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

    // --- UPDATE MISSILE LASER ATTACK ---
    if (boss.missileLasers && boss.missileLasers.length > 0) {
      for (let i = boss.missileLasers.length - 1; i >= 0; i--) {
        const m = boss.missileLasers[i];
        if (m.state === "TARGETING") {
          m.chargeElapsed += dt;
          if (m.chargeElapsed >= m.chargeDuration) {
            m.state = "DESCENDING";
            m.missileY = -140;
            playMissileDescendSound();
          }
        } else if (m.state === "DESCENDING") {
          m.missileY += m.speed * dt;
          // Spectral thruster sparks
          if (Math.random() > 0.35 && boss.particles.length < 50) {
            boss.particles.push({
              x: m.targetX + (Math.random() - 0.5) * 8,
              y: m.missileY - 18,
              vx: (Math.random() - 0.5) * 40,
              vy: -70 - Math.random() * 80,
              life: 0.22,
              elapsed: 0,
              r: 2.2,
              color: Math.random() > 0.5 ? "#00f0ff" : "#ff3366"
            });
          }
          if (m.missileY >= m.targetY) {
            m.state = "EXPLODING";
            m.explosionElapsed = 0;
            playMissileExplosionSound();
            addShake(18, 250);
          }
        } else if (m.state === "EXPLODING") {
          m.explosionElapsed += dt;
          if (m.explosionElapsed >= m.explosionLife) {
            boss.missileLasers.splice(i, 1);
          }
        }
      }
    }

    // --- UPDATE UNDYING KARMA VORTEXES (SET DURATION: 12s) ---
    if (boss.undyingVortexes && boss.undyingVortexes.length > 0) {
      for (let i = boss.undyingVortexes.length - 1; i >= 0; i--) {
        const v = boss.undyingVortexes[i];
        v.elapsed += dt;
        v.angle += v.orbitSpeed * dt;
        v.x = v.centerX + Math.cos(v.angle) * v.radiusX;
        v.y = v.centerY + Math.sin(v.angle * 1.3) * v.radiusY;

        // Pulse wave every 1.8s
        v.pulseTimer += dt;
        if (v.pulseTimer >= 1.8) {
          v.pulseTimer = 0;
          v.activePulse = { radius: 10, maxRadius: 75, life: 0.7, elapsed: 0 };
          playUndyingPulseSound();
        }

        if (v.activePulse) {
          v.activePulse.elapsed += dt;
          v.activePulse.radius += (v.activePulse.maxRadius - v.activePulse.radius) * 4.5 * dt;
          if (v.activePulse.elapsed >= v.activePulse.life) {
            v.activePulse = null;
          }
        }

        // 12s duration expiration
        if (v.elapsed >= v.duration) {
          for (let k = 0; k < 16; k++) {
            const spAng = Math.random() * Math.PI * 2;
            const spSpd = 50 + Math.random() * 150;
            boss.particles.push({
              x: v.x, y: v.y, vx: Math.cos(spAng) * spSpd, vy: Math.sin(spAng) * spSpd,
              life: 0.5, elapsed: 0, r: 2.5, color: "#00f0ff"
            });
          }
          boss.undyingVortexes.splice(i, 1);
        }
      }
    }

    // --- UPDATE UNDYING WRAITH PHANTOM (CONDITION-BASED: PURGE 3 SOUL SHARDS) ---
    if (boss.undyingPhantom) {
      const s = boss.undyingPhantom;
      s.elapsed += dt;
      const angleToP = Math.atan2(p.y - s.y, p.x - s.x);
      s.vx = (s.vx || 0) + Math.cos(angleToP) * 160 * dt;
      s.vy = (s.vy || 0) + Math.sin(angleToP) * 160 * dt;
      s.vx *= 0.94;
      s.vy *= 0.94;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.beamAngle = angleToP;
    }

    // --- UPDATE BOSS PARTICLES ---
    for (let i = boss.particles.length - 1; i >= 0; i--) {
      const pt = boss.particles[i];
      pt.elapsed += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.elapsed >= pt.life) {
        boss.particles.splice(i, 1);
      }
    }
  }

  function loop(isBackground = false) {
    // ── SCHEDULE NEXT FRAME FIRST ──────────────────────────────────────────
    // When visible and playing, queue next rAF.
    // In background/minimized mode, the Web Worker drives the loop at 60Hz.
    if (!isBackground && phaseRef.current === PHASE.PLAYING) {
      rafRef.current = requestAnimationFrame(() => loop(false));
    }
    loop._lastTickMs = Date.now(); // for watchdog

    const canvas = canvasRef.current;
    if (!canvas) return; // skip this frame – next rAF already queued above

    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    const now = Date.now();
    const prevNow = loop._lastNow ?? now;
    const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) / 1000));
    loop._lastNow = now;

    // When minimized/hidden, release keys so the character stays stationary
    if (isBackground) {
      keysRef.current.clear();
    }

    const radState = radianceBossRef.current;
    const timeDilation = (radState && radState.active && radState.timeDilation !== undefined) ? radState.timeDilation : 1.0;
    const simDt = dt * timeDilation;
    try {

    const keys = keysRef.current;
    
    // Evaluate base movement axis from keys
    let ax = 0, ay = 0;
    if (keys.has("w") || keys.has("arrowup")) ay -= 1;
    if (keys.has("s") || keys.has("arrowdown")) ay += 1;
    if (keys.has("a") || keys.has("arrowleft")) ax -= 1;
    if (keys.has("d") || keys.has("arrowright")) ax += 1;

    // Blend with virtual joystick input from touchscreen (analog float -1..1)
    const jx = joystickInputRef.current?.ax || 0;
    const jy = joystickInputRef.current?.ay || 0;
    if (jx !== 0 || jy !== 0) {
      ax += jx;
      ay += jy;
    }

    const len = Math.hypot(ax, ay);
    if (len > 1) {
      ax /= len;
      ay /= len;
    }

    // Process buffered mobile action button taps
    if (pendingMobileTriggerRef.current.guard) {
      pendingMobileTriggerRef.current.guard = false;
      if (isGuardReady(now)) {
        guardUntilRef.current = now + 1000;
        guardCdUntilRef.current = now + 5000;
        addShake(4, 80);
      }
    }

    if (pendingMobileTriggerRef.current.special) {
      pendingMobileTriggerRef.current.special = false;
      triggerSpecialAction();
    }

    const wantMobileDash = pendingMobileTriggerRef.current.dash;
    if (wantMobileDash) {
      pendingMobileTriggerRef.current.dash = false;
    }

    const speed = focusActiveRef.current ? 135 : 260; // 50% speed during Focus mode

    const p = playerRef.current;
    
    // Dash Mechanics
    const DASH_DURATION = 160;
    const DASH_SPEED = 900;
    const DASH_COOLDOWN = 1750; // Balanced cooldown for deliberate boss dodging
    
    if ((keys.has("shift") || wantMobileDash) && !dashRef.current.active && now > dashRef.current.cooldownUntil) {
       // Determine Dash Direction
       let dx = ax;
       let dy = ay;
       
       // If standing still, dash in the direction we were last facing (or default right)
       if (dx === 0 && dy === 0) {
          dx = dashRef.current.lastDx || 1;
          dy = dashRef.current.lastDy || 0;
       }
       
       // Normalize dash direction
       const dLen = Math.hypot(dx, dy) || 1;
       dx /= dLen;
       dy /= dLen;
       
       dashRef.current = {
          active: true,
          until: now + DASH_DURATION,
          cooldownUntil: now + DASH_COOLDOWN,
          dirX: dx,
          dirY: dy,
          lastDx: dx, // cache for static dashes
          lastDy: dy
       };
       playHitSound(); // Optional small sound feedback on dash
    } else if (ax !== 0 || ay !== 0) {
       // Cache last movement direction while walking to use if we dash from a standstill
       dashRef.current.lastDx = ax;
       dashRef.current.lastDy = ay;
    }

    // Apply Movement
    if (dashRef.current.active && now < dashRef.current.until) {
       // Executing Dash Movement
       p.x += dashRef.current.dirX * DASH_SPEED * simDt;
       p.y += dashRef.current.dirY * DASH_SPEED * simDt;
       
       // Create trail
       playerTrailRef.current.push({ x: p.x, y: p.y, lifeMs: 200, maxLifeMs: 200 });
    } else {
       // Normal Movement
       dashRef.current.active = false;
       p.x += ax * speed * simDt;
       p.y += ay * speed * simDt;
    }
    
    p.x = clamp(p.x, 18, w - 18);
    p.y = clamp(p.y, 18, h - 18);
    
    // Process Trail Lifetimes
    for (let i = playerTrailRef.current.length - 1; i >= 0; i--) {
       const tr = playerTrailRef.current[i];
       tr.lifeMs -= dt * 1000;
       if (tr.lifeMs <= 0) playerTrailRef.current.splice(i, 1);
    }

    // ── MULTIPLAYER REAL-TIME POSITION SYNC ──────────────────────────────────
    const isMultiplayer = modeRef.current === "ranked" || modeRef.current === "friend";
    if (isMultiplayer && roomIdRef.current && (phaseRef.current === PHASE.PLAYING || phaseRef.current === PHASE.COUNTDOWN)) {
      if (!loop._lastPosEmit || now - loop._lastPosEmit >= 33) {
        loop._lastPosEmit = now;
        socket.emit("game:position", {
          roomId: roomIdRef.current,
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10,
          isDashing: !!dashRef.current?.active,
          isGuarding: isGuardActive(now),
          isHealing: isCorruptHealActive(now),
        });
      }
    }

    // Process Opponent Soul interpolation & ghost trails
    const opp = opponentSoulRef.current;
    if (isMultiplayer && opp.initialized) {
      const lerpFactor = Math.min(1, dt * 22);
      opp.currentX += (opp.targetX - opp.currentX) * lerpFactor;
      opp.currentY += (opp.targetY - opp.currentY) * lerpFactor;

      // Generate ethereal trails for opponent
      if (opp.isDashing) {
        opp.trail.push({ x: opp.currentX, y: opp.currentY, lifeMs: 220, maxLifeMs: 220 });
      } else if (Math.hypot(opp.targetX - opp.currentX, opp.targetY - opp.currentY) > 2) {
        if (Math.random() < 0.25 && opp.trail.length < 12) {
          opp.trail.push({ x: opp.currentX, y: opp.currentY, lifeMs: 140, maxLifeMs: 140 });
        }
      }

      for (let i = opp.trail.length - 1; i >= 0; i--) {
        const tr = opp.trail[i];
        tr.lifeMs -= dt * 1000;
        if (tr.lifeMs <= 0) opp.trail.splice(i, 1);
      }
    }

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
        rad.nextAttackAtMs = elapsedMs + 1600;
        rad.hp = 100;
        rad.orbCharge = 0;
        rad.collectibleOrb = { x: 50 + rngRef.current() * (w - 100), y: 50 + rngRef.current() * (h - 100), r: 10 };
        rad.x = w / 2;
        rad.y = 120;
        rad.baseY = 120;
        rad.slamState = null;
        rad.shockwaves = [];
        rad.earthDebris = [];
        rad.dustClouds = [];
        rad.celestialStars = [];
        rad.swordCascades = [];
        rad.lightPillars = [];
        rad.timeDilation = 1.0;
        rad.cameraPunch = { zoom: 1, targetZoom: 1, offsetY: 0 };
        rad.godRays = [
          { topOffset: -300, bottomOffset: -380, topW: 60, bottomW: 160, baseAlpha: 0.12, swaySpeed: 2800, phase: 0 },
          { topOffset: -170, bottomOffset: -210, topW: 75, bottomW: 190, baseAlpha: 0.16, swaySpeed: 2300, phase: 1.2 },
          { topOffset: -50,  bottomOffset: -60,  topW: 90, bottomW: 220, baseAlpha: 0.19, swaySpeed: 2900, phase: 2.5 },
          { topOffset: 60,   bottomOffset: 80,   topW: 85, bottomW: 210, baseAlpha: 0.18, swaySpeed: 2500, phase: 3.9 },
          { topOffset: 180,  bottomOffset: 230,  topW: 75, bottomW: 180, baseAlpha: 0.15, swaySpeed: 3100, phase: 5.1 },
          { topOffset: 310,  bottomOffset: 390,  topW: 60, bottomW: 150, baseAlpha: 0.11, swaySpeed: 2600, phase: 3.4 },
        ];
      }

      if (rad.active && !rad.defeated) {
        if (!rad.x) rad.x = w / 2;
        if (!rad.y) rad.y = 120;
        if (!rad.baseY) rad.baseY = 120;
        if (!rad.godRays || rad.godRays.length === 0 || rad.godRays[0].topOffset === undefined) {
          rad.godRays = [
            { topOffset: -300, bottomOffset: -380, topW: 60, bottomW: 160, baseAlpha: 0.12, swaySpeed: 2800, phase: 0 },
            { topOffset: -170, bottomOffset: -210, topW: 75, bottomW: 190, baseAlpha: 0.16, swaySpeed: 2300, phase: 1.2 },
            { topOffset: -50,  bottomOffset: -60,  topW: 90, bottomW: 220, baseAlpha: 0.19, swaySpeed: 2900, phase: 2.5 },
            { topOffset: 60,   bottomOffset: 80,   topW: 85, bottomW: 210, baseAlpha: 0.18, swaySpeed: 2500, phase: 3.9 },
            { topOffset: 180,  bottomOffset: 230,  topW: 75, bottomW: 180, baseAlpha: 0.15, swaySpeed: 3100, phase: 5.1 },
            { topOffset: 310,  bottomOffset: 390,  topW: 60, bottomW: 150, baseAlpha: 0.11, swaySpeed: 2600, phase: 3.4 },
          ];
        }

        // Smooth camera punch recovery
        if (rad.cameraPunch) {
          rad.cameraPunch.zoom += ((rad.cameraPunch.targetZoom || 1) - rad.cameraPunch.zoom) * Math.min(1, dt * 6);
        }

        // Handle Radiance Attacks
        // Only block slam (type 0) from re-triggering if already slamming; other attacks fire freely
        if (elapsedMs >= rad.nextAttackAtMs) {
          const isEnraged = rad.hp <= 50;
          const attackType = Math.floor(rngRef.current() * 5);
          rad.attackType = attackType;

          if (attackType === 0 && rad.slamState) {
            // Slam mid-slam: skip this attack and reschedule soon
            rad.nextAttackAtMs = elapsedMs + 600;
          } else if (attackType === 0) {
            // --- ATTACK 0: GROUND SLAM ATTACK ---
            rad.slamState = "TELEGRAPH";
            rad.slamTimer = 0;
            rad.slamTargetX = clamp(p.x, 60, w - 60);
            rad.slamTargetY = h - 60;
            rad.slamRadius = 75;
            const cd = isEnraged ? 2100 : 2700;
            rad.nextAttackAtMs = elapsedMs + cd + rngRef.current() * 200;

          } else if (attackType === 1) {
            // --- ATTACK 1: CELESTIAL STAR STORM ---
            rad.celestialStars = [];
            const starCount = isEnraged ? 40 : 32;
            for (let s = 0; s < starCount; s++) {
              const ang = (s / starCount) * Math.PI * 2;
              const dist = 65 + rngRef.current() * 45;
              rad.celestialStars.push({
                x: (rad.x || w / 2) + Math.cos(ang) * dist,
                y: (rad.y || 120) + Math.sin(ang) * dist,
                vx: 0,
                vy: 0,
                hoverTimer: (isEnraged ? 0.22 : 0.30) + (s % 4) * 0.10,
                speed: (isEnraged ? 1040 : 920) + rngRef.current() * 160,
                r: 9,
                launched: false,
                trail: [],
                life: 3.5,
                elapsed: 0
              });
            }
            playStarChimeSound();
            const cd = isEnraged ? 1800 : 2300;
            rad.nextAttackAtMs = elapsedMs + cd + rngRef.current() * 200;

          } else if (attackType === 2) {
            // --- ATTACK 2: TACTICAL PRESSURE (SWEEPING LASERS, 4-WAY SPIKES, OR NAIL WALL) ---
            const subRoll = rngRef.current();
            if (subRoll < 0.45) {
              const laserCount = isEnraged ? 4 : 3;
              for (let b = 0; b < laserCount; b++) {
                rad.lasers.push({
                  cx: rad.x || w / 2,
                  cy: rad.y || 120,
                  angle: (b * Math.PI * 2) / laserCount,
                  rotSpeed: isEnraged ? 2.3 : 1.9,
                  length: 1050,
                  thick: 46,
                  chargeTime: isEnraged ? 0.55 : 0.65,
                  activeTime: 2.5,
                  elapsed: 0,
                  spawnedAtMs: elapsedMs
                });
              }
              playLaserChargeSound();
            } else if (subRoll < 0.75) {
              const x1 = clamp(p.x + (rngRef.current() > 0.5 ? 115 : -115), 40, w - 40);
              const x2 = clamp(p.x + (x1 > p.x ? -115 : 115), 40, w - 40);
              const y1 = clamp(p.y + (rngRef.current() > 0.5 ? 95 : -95), 40, h - 40);
              const y2 = clamp(p.y + (y1 > p.y ? -95 : 95), 40, h - 40);
              rad.wallSpikes.push({ isVert: true, x: x1, y: 0, width: 42, length: 0, maxLength: h, state: "WARN", timer: 0, spawnedAtMs: elapsedMs });
              rad.wallSpikes.push({ isVert: true, x: x2, y: 0, width: 42, length: 0, maxLength: h, state: "WARN", timer: 0, spawnedAtMs: elapsedMs });
              rad.wallSpikes.push({ isVert: false, x: 0, y: y1, width: 42, length: 0, maxLength: w, state: "WARN", timer: 0, spawnedAtMs: elapsedMs });
              rad.wallSpikes.push({ isVert: false, x: 0, y: y2, width: 42, length: 0, maxLength: w, state: "WARN", timer: 0, spawnedAtMs: elapsedMs });
            } else {
              // Radiant Nail Wall: Horizontal sweeping blade curtain
              const fromLeft = rngRef.current() > 0.5;
              const safeY = clamp(p.y + (rngRef.current() - 0.5) * 160, 80, h - 80);
              for (let sy = 50; sy < h - 40; sy += 55) {
                if (Math.abs(sy - safeY) < 70) continue;
                rad.wallSpikes.push({
                  isVert: false,
                  x: fromLeft ? 0 : w,
                  y: sy,
                  width: 32,
                  length: 0,
                  maxLength: w * 0.85,
                  state: "WARN",
                  timer: 0,
                  spawnedAtMs: elapsedMs
                });
              }
            }
            const cd = isEnraged ? 1500 : 1900;
            rad.nextAttackAtMs = elapsedMs + cd + rngRef.current() * 200;

          } else if (attackType === 3) {
            // --- ATTACK 3: DIVINE SWORD RAIN ---
            // Luminous blades descend from the heavens in 2 rapid waves with safe evasion lanes!
            if (!rad.swordCascades) rad.swordCascades = [];
            const waves = 2;
            for (let wave = 0; wave < waves; wave++) {
              const gap1 = 80 + rngRef.current() * (w - 160);
              const gap2 = clamp(gap1 + (rngRef.current() > 0.5 ? 260 : -260), 80, w - 80);
              const gapWidth = 85;
              const waveDelay = wave * 0.52;

              for (let colX = 35; colX <= w - 35; colX += 44) {
                if (Math.abs(colX - gap1) < gapWidth / 2 || Math.abs(colX - gap2) < gapWidth / 2) {
                  continue; // safe corridor
                }
                rad.swordCascades.push({
                  x: colX,
                  y: -50,
                  vy: 0,
                  width: 18,
                  height: 64,
                  state: "WARN",
                  timer: 0,
                  warnDuration: 0.42,
                  delay: waveDelay,
                  speed: isEnraged ? 1350 : 1180,
                  spawnedAtMs: elapsedMs
                });
              }
            }
            playStarChimeSound();
            const cd = isEnraged ? 1700 : 2200;
            rad.nextAttackAtMs = elapsedMs + cd + rngRef.current() * 200;

          } else if (attackType === 4) {
            // --- ATTACK 4: SOLAR LIGHT PILLARS ---
            // Scorching holy columns lock onto player and arena zones before roaring into pillars of light!
            if (!rad.lightPillars) rad.lightPillars = [];
            const pillarCount = isEnraged ? 5 : 4;
            const targets = [clamp(p.x, 50, w - 50)];
            for (let k = 1; k < pillarCount; k++) {
              const offset = (k % 2 === 1 ? 1 : -1) * (140 + Math.floor(k / 2) * 180);
              targets.push(clamp(p.x + offset + (rngRef.current() - 0.5) * 60, 50, w - 50));
            }
            for (const tx of targets) {
              rad.lightPillars.push({
                x: tx,
                width: 68,
                state: "WARN",
                timer: 0,
                warnDuration: isEnraged ? 0.48 : 0.60,
                eruptDuration: 0.70,
                hasHitPlayer: false,
                spawnedAtMs: elapsedMs
              });
            }
            playLaserChargeSound();
            const cd = isEnraged ? 1500 : 1900;
            rad.nextAttackAtMs = elapsedMs + cd + rngRef.current() * 200;
          }
        }

        // --- UPDATE GROUND SLAM ---
        if (rad.slamState === "TELEGRAPH") {
          rad.slamTimer += dt; // use real dt, not simDt, so it can't be stalled by timeDilation
          rad.y = rad.baseY - Math.sin(Math.min(1, rad.slamTimer / 0.75) * Math.PI * 0.5) * 65;
          if (rad.slamTimer >= 0.75) {
            rad.slamState = "PLUNGE";
            rad.slamTimer = 0;
          }
        } else if (rad.slamState === "PLUNGE") {
          rad.slamTimer += dt; // real dt so timeDilation doesn't slow the plunge
          const plungeSpeed = 1600;
          rad.x += (rad.slamTargetX - rad.x) * Math.min(1, dt * 10);
          rad.y += plungeSpeed * dt;
          // Safety: if plunge takes > 1s (shouldn't happen), force impact
          if (rad.y >= rad.slamTargetY || rad.slamTimer >= 1.0) {
            rad.y = rad.slamTargetY;
            rad.slamState = "IMPACT";
            rad.slamTimer = 0;
            playSlamImpactSound();
            addShake(28, 400);
            rad.timeDilation = 0.35; // Dramatic slow motion
            if (rad.cameraPunch) {
              rad.cameraPunch.targetZoom = 1.15;
              rad.cameraPunch.offsetY = -20;
            }
            // Spawn golden shockwave ring
            rad.shockwaves.push({
              x: rad.slamTargetX,
              y: rad.slamTargetY,
              radius: 15,
              maxRadius: 380,
              speed: 500,
              thickness: 18,
              life: 0.75,
              elapsed: 0,
              hasHitPlayer: false
            });
            // Spawn 16 earth debris chunks
            for (let d = 0; d < 16; d++) {
              const ang = Math.PI + (rngRef.current() - 0.5) * Math.PI * 1.6;
              const spd = 200 + rngRef.current() * 320;
              rad.earthDebris.push({
                x: rad.slamTargetX + (rngRef.current() - 0.5) * 30,
                y: rad.slamTargetY,
                vx: Math.cos(ang) * spd,
                vy: -Math.abs(Math.sin(ang)) * spd * 1.2,
                size: 4 + rngRef.current() * 6,
                rotation: rngRef.current() * Math.PI * 2,
                rotSpeed: (rngRef.current() - 0.5) * 10,
                life: 0.9 + rngRef.current() * 0.4,
                elapsed: 0
              });
            }
            // Spawn 12 dust clouds
            for (let c = 0; c < 12; c++) {
              const dir = rngRef.current() > 0.5 ? 1 : -1;
              rad.dustClouds.push({
                x: rad.slamTargetX + dir * (10 + rngRef.current() * 30),
                y: rad.slamTargetY - 5,
                vx: dir * (120 + rngRef.current() * 180),
                vy: -20 - rngRef.current() * 40,
                radius: 12 + rngRef.current() * 15,
                maxRadius: 35 + rngRef.current() * 20,
                life: 0.8,
                elapsed: 0
              });
            }
          }
        } else if (rad.slamState === "IMPACT") {
          rad.timeDilation += (1.0 - rad.timeDilation) * Math.min(1, simDt * 4);
          if (rad.cameraPunch) {
            rad.cameraPunch.targetZoom = 1.0;
            rad.cameraPunch.offsetY = 0;
          }
          // Use real elapsedMs so timeDilation doesn't stall this
          if (!rad.slamImpactStartMs) rad.slamImpactStartMs = elapsedMs;
          if (elapsedMs - rad.slamImpactStartMs >= 500) {
            rad.slamState = "RETURN";
            rad.slamReturnStartMs = elapsedMs;
            rad.slamImpactStartMs = 0;
          }
        } else if (rad.slamState === "RETURN") {
          rad.timeDilation += (1.0 - rad.timeDilation) * Math.min(1, dt * 4); // recover dilation with real dt
          rad.x += (w / 2 - rad.x) * Math.min(1, dt * 5);
          rad.y += (rad.baseY - rad.y) * Math.min(1, dt * 5);
          // Use real elapsedMs for timeout so timeDilation can't stall it
          if (!rad.slamReturnStartMs) rad.slamReturnStartMs = elapsedMs;
          if ((Math.abs(rad.y - rad.baseY) < 5 && Math.abs(rad.x - w / 2) < 5) || (elapsedMs - rad.slamReturnStartMs) >= 1800) {
            rad.x = w / 2;
            rad.y = rad.baseY;
            rad.timeDilation = 1.0;
            rad.slamState = null;
            rad.slamReturnStartMs = 0;
            // Ensure next attack doesn't fire immediately (prevents same-frame re-trigger)
            rad.nextAttackAtMs = Math.max(rad.nextAttackAtMs, elapsedMs + 1200);
          }
        }

        // --- UPDATE SHOCKWAVES ---
        for (let i = rad.shockwaves.length - 1; i >= 0; i--) {
          const sw = rad.shockwaves[i];
          sw.elapsed += simDt;
          sw.radius += sw.speed * simDt;
          if (sw.elapsed >= sw.life || sw.radius >= sw.maxRadius) {
            rad.shockwaves.splice(i, 1);
          }
        }

        // --- UPDATE EARTH DEBRIS ---
        for (let i = rad.earthDebris.length - 1; i >= 0; i--) {
          const d = rad.earthDebris[i];
          d.elapsed += simDt;
          d.vy += 850 * simDt; // gravity
          d.x += d.vx * simDt;
          d.y += d.vy * simDt;
          d.rotation += d.rotSpeed * simDt;
          if (d.elapsed >= d.life || d.y > h + 50) {
            rad.earthDebris.splice(i, 1);
          }
        }

        // --- UPDATE DUST CLOUDS ---
        for (let i = rad.dustClouds.length - 1; i >= 0; i--) {
          const c = rad.dustClouds[i];
          c.elapsed += simDt;
          c.x += c.vx * simDt;
          c.y += c.vy * simDt;
          c.radius += (c.maxRadius - c.radius) * 2.5 * simDt;
          c.vx *= 0.94;
          if (c.elapsed >= c.life) {
            rad.dustClouds.splice(i, 1);
          }
        }

        // --- UPDATE CELESTIAL STARS ---
        for (let i = rad.celestialStars.length - 1; i >= 0; i--) {
          const s = rad.celestialStars[i];
          s.elapsed += simDt;
          if (!s.launched) {
            s.hoverTimer -= simDt;
            if (s.hoverTimer <= 0) {
              s.launched = true;
              playStarWhooshSound();
              const ang = Math.atan2(p.y - s.y, p.x - s.x);
              s.vx = Math.cos(ang) * s.speed;
              s.vy = Math.sin(ang) * s.speed;
            }
          } else {
            s.x += s.vx * simDt;
            s.y += s.vy * simDt;
            s.trail.push({ x: s.x, y: s.y });
            if (s.trail.length > 7) s.trail.shift();
            if (s.x < -60 || s.x > w + 60 || s.y < -60 || s.y > h + 60 || s.elapsed >= s.life) {
              rad.celestialStars.splice(i, 1);
            }
          }
        }

        // Update Wall Spikes
        for (let i = rad.wallSpikes.length - 1; i >= 0; i--) {
          const sp = rad.wallSpikes[i];
          const curElapsed = (elapsedMs - sp.spawnedAtMs) / 1000;
          sp.timer = curElapsed;
          
          if (sp.state === "WARN" && curElapsed > 0.85) {
            sp.state = "EXTEND";
          } else if (sp.state === "EXTEND") {
            sp.length += 1200 * dt;
            if (sp.length >= sp.maxLength) { sp.length = sp.maxLength; sp.state = "RETRACT"; }
          } else if (sp.state === "RETRACT") {
            sp.length -= 800 * dt;
            if (sp.length <= 0) rad.wallSpikes.splice(i, 1);
          }
        }

        // Update Lasers
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

        // --- UPDATE SWORD CASCADES ---
        if (rad.swordCascades) {
          for (let i = rad.swordCascades.length - 1; i >= 0; i--) {
            const sc = rad.swordCascades[i];
            const curElapsed = (elapsedMs - sc.spawnedAtMs) / 1000;
            if (curElapsed < sc.delay) continue;
            const activeTime = curElapsed - sc.delay;
            if (sc.state === "WARN") {
              if (activeTime >= sc.warnDuration) {
                sc.state = "FALLING";
                playLaserFireSound();
              }
            } else if (sc.state === "FALLING") {
              sc.y += sc.speed * simDt;
              if (sc.y > h + 100) {
                rad.swordCascades.splice(i, 1);
              }
            }
          }
        }

        // --- UPDATE SOLAR LIGHT PILLARS ---
        if (rad.lightPillars) {
          for (let i = rad.lightPillars.length - 1; i >= 0; i--) {
            const pil = rad.lightPillars[i];
            const curElapsed = (elapsedMs - pil.spawnedAtMs) / 1000;
            if (pil.state === "WARN") {
              if (curElapsed >= pil.warnDuration) {
                pil.state = "ERUPT";
                playLaserFireSound();
                addShake(16, 250);
              }
            } else if (pil.state === "ERUPT") {
              if (curElapsed >= pil.warnDuration + pil.eruptDuration) {
                rad.lightPillars.splice(i, 1);
              }
            }
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
          rad.celestialStars = [];
          rad.swordCascades = [];
          rad.lightPillars = [];
          rad.shockwaves = [];
          rad.earthDebris = [];
          rad.dustClouds = [];
          rad.missileLasers = [];
          rad.undyingVortexes = [];
          rad.undyingStalker = null;
          rad.lasers = [];
          rad.wallSpikes = [];
          rad.slamState = null;
          rad.timeDilation = 1.0;

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

          // FULL HEAL AFTER LASER ROUND
          setHp((old) => {
            const amountToHeal = maxHpRef.current - old;
            if (amountToHeal > 0) playHealSound(amountToHeal);
            return maxHpRef.current;
          });
          healTextRef.current = { text: "FULL HP RESTORED", until: Date.now() + 3000 };
          setHpPulse(true);
          setTimeout(() => setHpPulse(false), 500);

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
        
        // Phase C: Goddess Descent (7000ms to 14000ms)
        if (god.introActive) {
           const incTime = elapsedMs - god.introStartMs;
           god.dialogueTimeMs = incTime;
           if (incTime > 7000) {
              god.introActive = false;
              god.active = true;
              
              // Custom start music cleanly here exactly once
              startGoddessMusic();

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
            applyDamage(16, pr);
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
              applyDamage(24, null);
              break;
            }
          }
        }
      }

      // Judgement Wraith Missile Laser Impact Zone Collision
      if (!tookHit && bossRef.current && bossRef.current.missileLasers) {
        const boss = bossRef.current;
        for (let i = 0; i < boss.missileLasers.length; i++) {
          const m = boss.missileLasers[i];
          if (m.state === "EXPLODING" && !m.hasHitPlayer) {
            const dist = Math.hypot(m.targetX - p.x, m.targetY - p.y);
            if (dist < m.radius + p.r) {
              tookHit = true;
              m.hasHitPlayer = true;
              applyDamage(24, null);
              break;
            }
          }
        }
      }

      // Judgement Wraith Undying Karma Vortexes Collision
      if (!tookHit && bossRef.current && bossRef.current.undyingVortexes) {
        const boss = bossRef.current;
        for (let i = 0; i < boss.undyingVortexes.length; i++) {
          const v = boss.undyingVortexes[i];
          if (Math.hypot(v.x - p.x, v.y - p.y) < v.coreRadius + p.r) {
            tookHit = true;
            applyDamage(18, null);
            break;
          }
          if (v.activePulse) {
            const dist = Math.hypot(p.x - v.x, p.y - v.y);
            if (Math.abs(dist - v.activePulse.radius) < p.r + 10) {
              tookHit = true;
              applyDamage(16, null);
              break;
            }
          }
        }
      }

      // Judgement Wraith Undying Phantom Collision
      if (!tookHit && bossRef.current && bossRef.current.undyingPhantom) {
        const s = bossRef.current.undyingPhantom;
        if (Math.hypot(s.x - p.x, s.y - p.y) < s.radius + p.r) {
          tookHit = true;
          applyDamage(20, null);
        }
      }

      // Judgement Wraith Soul Shard Collection (Purge Condition)
      if (bossRef.current && bossRef.current.soulShards && bossRef.current.soulShards.length > 0) {
        const boss = bossRef.current;
        for (let i = boss.soulShards.length - 1; i >= 0; i--) {
          const shard = boss.soulShards[i];
          const dist = Math.hypot(p.x - shard.x, p.y - shard.y);
          if (dist < p.r + shard.r + 6) {
            boss.soulShards.splice(i, 1);
            boss.shardsPurged = (boss.shardsPurged || 0) + 1;
            playHealSound(20);
            setHp((old) => Math.min(maxHpRef.current, old + 10));
            setHpPulse(true);
            setTimeout(() => setHpPulse(false), 200);

            // Dispel condition fulfilled!
            if (boss.shardsPurged >= (boss.shardsRequired || 3)) {
              boss.undyingPhantom = null;
              boss.soulShards = [];
              playUndyingShatterSound();
              addShake(25, 450);
              boss.staggeredUntilMs = elapsedMs + 2500;
              setHp((old) => Math.min(maxHpRef.current, old + 25));
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
                  
                  // Stop music cleanly
                  stopGoddessMusic();

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
        // Celestial Stars (Golden Stars from Star Storm)
        if (!tookHit && rad.celestialStars && rad.celestialStars.length > 0) {
          for (let i = rad.celestialStars.length - 1; i >= 0; i--) {
            const s = rad.celestialStars[i];
            if (s.launched) {
              const dist = Math.hypot(p.x - s.x, p.y - s.y);
              if (dist < s.r + p.r + 3) {
                tookHit = true;
                applyDamage(20, null);
                rad.celestialStars.splice(i, 1);
                break;
              }
            }
          }
        }

        // Golden Shockwaves
        if (!tookHit && rad.shockwaves && rad.shockwaves.length > 0) {
          for (const sw of rad.shockwaves) {
            if (!sw.hasHitPlayer) {
              const distToCenter = Math.hypot(p.x - sw.x, p.y - sw.y);
              if (Math.abs(distToCenter - sw.radius) < sw.thickness / 2 + p.r) {
                sw.hasHitPlayer = true;
                tookHit = true;
                applyDamage(22, null);
                break;
              }
            }
          }
        }

        // Divine Sword Rain (Descending blade cascade)
        if (!tookHit && rad.swordCascades && rad.swordCascades.length > 0) {
          for (let i = rad.swordCascades.length - 1; i >= 0; i--) {
            const sw = rad.swordCascades[i];
            if (sw.state === "FALLING") {
              if (Math.abs(p.x - sw.x) < sw.width / 2 + p.r - 2 &&
                  p.y >= sw.y - sw.height / 2 && p.y <= sw.y + sw.height / 2 + 10) {
                tookHit = true;
                applyDamage(22, null);
                rad.swordCascades.splice(i, 1);
                break;
              }
            }
          }
        }

        // Solar Light Pillars (Holy columns of radiant fury)
        if (!tookHit && rad.lightPillars && rad.lightPillars.length > 0) {
          for (const pil of rad.lightPillars) {
            if (pil.state === "ERUPT" && !pil.hasHitPlayer) {
              if (Math.abs(p.x - pil.x) < pil.width / 2 + p.r - 2) {
                pil.hasHitPlayer = true;
                tookHit = true;
                applyDamage(24, null);
                break;
              }
            }
          }
        }

        // Legacy homing orbs (consumed on impact)
        if (!tookHit && rad.homingOrbs && rad.homingOrbs.length > 0) {
          for (let i = rad.homingOrbs.length - 1; i >= 0; i--) {
            const orb = rad.homingOrbs[i];
            if (Math.hypot(orb.x - p.x, orb.y - p.y) < p.r + orb.r - 2) {
              tookHit = true;
              applyDamage(14, orb);
              rad.homingOrbs.splice(i, 1);
              break;
            }
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

    // If running in background/minimized mode, physics, damage, and sockets are updated above.
    // Skip heavy Canvas2D rendering since pixels are not on screen.
    if (isBackground) return;

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

    // Low-angle camera punch for Radiance
    if (rad.active && rad.cameraPunch && rad.cameraPunch.zoom > 1.001) {
      const zoom = rad.cameraPunch.zoom;
      ctx.translate(w / 2, h * 0.82);
      ctx.scale(zoom, zoom);
      ctx.translate(-w / 2, -h * 0.82);
    }

    // ====== THEME: BLACK + WHITE LINES (keep heart color unchanged) ======
    // background
    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect(0, 0, w, h);

    // Moody Color Grading Vignette (deep grays + radiant gold aura)
    if (rad.active && !rad.defeated) {
      const moodyAlpha = rad.slamState ? 0.76 : 0.35;
      const ry = rad.y || 120;
      // Use w/2 for x so the vignette doesn't shift off-center during a side slam
      const grad = ctx.createRadialGradient(w / 2, ry, 25, w / 2, h / 2, Math.max(w, h) * 0.85);
      grad.addColorStop(0, "rgba(255, 220, 100, 0.10)");
      grad.addColorStop(0.35, "rgba(24, 28, 38, 0.45)");
      grad.addColorStop(1, `rgba(10, 12, 18, ${moodyAlpha})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

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
      const isStaggered = elapsedMs < boss.staggeredUntilMs;

      // Boss Header & Stagger status
      ctx.textAlign = "center";
      if (isStaggered) {
        ctx.fillStyle = "#ffff55";
        ctx.font = "bold 16px monospace";
        const remStagger = Math.max(0, (boss.staggeredUntilMs - elapsedMs) / 1000).toFixed(1);
        ctx.fillText(`* JUDGEMENT WRAITH STAGGERED! (${remStagger}s) *`, w / 2, 30);
      } else {
        ctx.fillStyle = "#00f0ff";
        ctx.font = "bold 16px monospace";
        ctx.fillText("JUDGEMENT WRAITH", w / 2, 30);
      }

      const bx = w / 2;
      const by = 80 + Math.sin(boss.animTime * 3) * 10;

      // Draw Judgement Wraith Skull
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(bx, by, 30, 0, Math.PI * 2);
      ctx.fill();

      // Eye Sockets
      ctx.fillStyle = "black";
      ctx.beginPath();
      ctx.arc(bx - 12, by - 5, 8, 0, Math.PI * 2);
      ctx.arc(bx + 12, by - 5, 8, 0, Math.PI * 2);
      ctx.fill();

      // Glowing Eye (Cyan & Red Karma eye)
      if (isStaggered) {
        // Stunned dizzy spiral eyes
        ctx.strokeStyle = "#ffff55";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx - 12, by - 5, 4, 0, Math.PI * 2);
        ctx.arc(bx + 12, by - 5, 4, 0, Math.PI * 2);
        ctx.stroke();

        // Orbiting Stun Stars above head
        for (let st = 0; st < 3; st++) {
          const stAng = (now / 250) + (st * Math.PI * 2) / 3;
          const stX = bx + Math.cos(stAng) * 36;
          const stY = by - 36 + Math.sin(stAng * 1.5) * 8;
          ctx.fillStyle = "#ffff00";
          ctx.beginPath();
          ctx.arc(stX, stY, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = "#00f0ff";
        ctx.beginPath();
        ctx.arc(bx - 12, by - 5, 4, 0, Math.PI * 2);
        ctx.fill();
        if (rngRef.current() > 0.92) {
          ctx.fillStyle = "#ff3366";
          ctx.beginPath();
          ctx.arc(bx + 12, by - 5, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Smile / Jaw
      ctx.strokeStyle = "black";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(bx, by + 5, 12, 0.2, Math.PI - 0.2);
      ctx.stroke();

      // Render Classic Bones
      for (const pr of boss.projectiles) {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Render Gaster Lasers
      for (const L of boss.lasers) {
        if (L.elapsed < L.chargeTime) {
          ctx.fillStyle = "rgba(0, 240, 255, 0.35)";
          if (L.isHoriz) {
            ctx.fillRect(0, L.y - 2, w, 4);
          } else {
            ctx.fillRect(L.x - 2, 0, 4, h);
          }
        } else {
          const activeRatio = (L.elapsed - L.chargeTime) / L.activeTime;
          const fade = 1 - activeRatio;
          ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
          ctx.shadowColor = "#00f0ff";
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

      // --- RENDER MISSILE LASER ATTACK (CLEAN SOLID BEAMS, NO GUIDE CIRCLES, NO TEXT) ---
      if (boss.missileLasers && boss.missileLasers.length > 0) {
        for (const m of boss.missileLasers) {
          if (m.state === "TARGETING" || m.state === "DESCENDING") {
            // Clean Solid Vertical Laser Guidance Marker Beam
            ctx.save();
            ctx.globalCompositeOperation = "screen";
            const beamAlpha = 0.4 + 0.3 * Math.sin(now / 70);
            
            // Outer laser glow shaft
            ctx.strokeStyle = `rgba(0, 240, 255, ${beamAlpha * 0.4})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(m.targetX, 0);
            ctx.lineTo(m.targetX, m.targetY);
            ctx.stroke();

            // Core bright beam
            ctx.strokeStyle = `rgba(255, 255, 255, ${beamAlpha * 0.9})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(m.targetX, 0);
            ctx.lineTo(m.targetX, m.targetY);
            ctx.stroke();

            // Luminous focal ground spot where the beam strikes the earth
            ctx.fillStyle = `rgba(0, 240, 255, ${beamAlpha * 0.85})`;
            ctx.beginPath();
            ctx.arc(m.targetX, m.targetY, 5 + Math.sin(now / 60) * 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(m.targetX, m.targetY, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Descending Kinetic Missile
          if (m.state === "DESCENDING") {
            ctx.save();
            ctx.translate(m.targetX, m.missileY);

            // Spectral Exhaust Plume
            const plumeGrad = ctx.createLinearGradient(0, -35, 0, -5);
            plumeGrad.addColorStop(0, "rgba(0, 240, 255, 0)");
            plumeGrad.addColorStop(0.6, "rgba(255, 50, 100, 0.7)");
            plumeGrad.addColorStop(1, "rgba(255, 255, 255, 0.95)");
            ctx.fillStyle = plumeGrad;
            ctx.beginPath();
            ctx.moveTo(-6, -8);
            ctx.lineTo(0, -38);
            ctx.lineTo(6, -8);
            ctx.closePath();
            ctx.fill();

            // Missile Kinetic Skeletal Body
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#00f0ff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, 14); // Nose tip
            ctx.lineTo(6, 0);
            ctx.lineTo(6, -12);
            ctx.lineTo(10, -14); // Fin
            ctx.lineTo(6, -18);
            ctx.lineTo(-6, -18);
            ctx.lineTo(-10, -14); // Fin
            ctx.lineTo(-6, -12);
            ctx.lineTo(-6, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }

          // Explosion Detonation Blast
          if (m.state === "EXPLODING") {
            const expRatio = Math.min(1, m.explosionElapsed / m.explosionLife);
            const expRadius = m.radius * (1 + expRatio * 0.7);
            const expAlpha = (1 - expRatio);

            ctx.save();
            ctx.globalCompositeOperation = "screen";
            ctx.strokeStyle = `rgba(0, 240, 255, ${expAlpha * 0.9})`;
            ctx.lineWidth = Math.max(2, 14 * (1 - expRatio));
            ctx.beginPath();
            ctx.arc(m.targetX, m.targetY, expRadius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = `rgba(255, 50, 100, ${expAlpha * 0.45})`;
            ctx.beginPath();
            ctx.arc(m.targetX, m.targetY, expRadius * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // --- RENDER UNDYING KARMA VORTEXES (CLEAN, NO TEXT, NO TIMER ARCS) ---
      if (boss.undyingVortexes && boss.undyingVortexes.length > 0) {
        for (const v of boss.undyingVortexes) {
          ctx.save();
          // Active expanding pulse ring
          if (v.activePulse) {
            const pAlpha = 1 - v.activePulse.elapsed / v.activePulse.life;
            ctx.globalCompositeOperation = "screen";
            ctx.strokeStyle = `rgba(0, 240, 255, ${pAlpha * 0.85})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(v.x, v.y, v.activePulse.radius, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Outer Corona Ring
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = "rgba(0, 240, 255, 0.25)";
          ctx.beginPath();
          ctx.arc(v.x, v.y, v.coreRadius * 2.2 + Math.sin(now / 150) * 3, 0, Math.PI * 2);
          ctx.fill();

          // Rotating Plasma Spikes
          ctx.save();
          ctx.translate(v.x, v.y);
          ctx.rotate(now / 400);
          ctx.strokeStyle = "rgba(0, 240, 255, 0.8)";
          ctx.lineWidth = 2;
          for (let sp = 0; sp < 6; sp++) {
            ctx.beginPath();
            ctx.moveTo(v.coreRadius, 0);
            ctx.lineTo(v.coreRadius + 12, 0);
            ctx.stroke();
            ctx.rotate(Math.PI / 3);
          }
          ctx.restore();

          // Core Body
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(v.x, v.y, v.coreRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // --- RENDER UNDYING WRAITH PHANTOM (CLEAN, NO DOTTED TETHER, NO TEXT) ---
      if (boss.undyingPhantom) {
        const s = boss.undyingPhantom;
        ctx.save();
        // Ethereal Aura
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = "rgba(0, 240, 255, 0.25)";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 2.2 + Math.sin(now / 180) * 4, 0, Math.PI * 2);
        ctx.fill();

        // Spectral Skull Sprite
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.elapsed * 1.5);
        ctx.fillStyle = "#0a0a20";
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, s.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Cyan Glowing Sockets
        ctx.fillStyle = "#00f0ff";
        ctx.beginPath();
        ctx.arc(-7, -4, 4, 0, Math.PI * 2);
        ctx.arc(7, -4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();
      }

      // --- RENDER PURE SOUL SHARDS (CLEAN CRYSTALS, NO HUD TEXT) ---
      if (boss.soulShards && boss.soulShards.length > 0) {
        for (const shard of boss.soulShards) {
          ctx.save();
          ctx.translate(shard.x, shard.y);
          ctx.rotate(now / 400);

          // Outer rotating aura
          ctx.strokeStyle = "rgba(0, 240, 255, 0.7)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, shard.r + 5 + Math.sin(now / 120) * 2, 0, Math.PI * 2);
          ctx.stroke();

          // Diamond Core
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#00f0ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -shard.r);
          ctx.lineTo(shard.r, 0);
          ctx.lineTo(0, shard.r);
          ctx.lineTo(-shard.r, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // --- RENDER BOSS PARTICLES ---
      if (boss.particles && boss.particles.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (const pt of boss.particles) {
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
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

      const bx = rad.x || (w / 2);
      const by = (rad.y !== undefined ? rad.y : 120) + (rad.slamState ? 0 : Math.sin(now / 500) * 12);

      // Volumetric God Rays Streaming Downward (Broad ethereal shafts across the arena)
      if (rad.godRays && !rad.defeated) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const yTop = 0;
        const yBottom = h;
        const rayOriginX = w / 2; // Always from screen center — not boss x, so rays don't fly off-screen during slam
        for (const ray of rad.godRays) {
          const sway = Math.sin(now / ray.swaySpeed + ray.phase) * 18;
          const xTop = rayOriginX + ray.topOffset + sway * 0.5;
          const xBot = rayOriginX + ray.bottomOffset + sway;
          const pulse = 0.75 + 0.25 * Math.sin(now / 900 + ray.phase);
          const rayAlpha = ray.baseAlpha * pulse * (rad.slamState ? 1.45 : 0.85);

          const x1Top = xTop - ray.topW / 2;
          const x2Top = xTop + ray.topW / 2;
          const x1Bot = xBot - ray.bottomW / 2;
          const x2Bot = xBot + ray.bottomW / 2;

          const rayGrad = ctx.createLinearGradient(0, yTop, 0, yBottom);
          rayGrad.addColorStop(0, `rgba(255, 245, 180, ${rayAlpha})`);
          rayGrad.addColorStop(0.35, `rgba(255, 225, 110, ${rayAlpha * 0.65})`);
          rayGrad.addColorStop(1, "rgba(255, 205, 70, 0)");

          ctx.fillStyle = rayGrad;
          ctx.beginPath();
          ctx.moveTo(x1Top, yTop);
          ctx.lineTo(x2Top, yTop);
          ctx.lineTo(x2Bot, yBottom);
          ctx.lineTo(x1Bot, yBottom);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }



      // --- RENDER GOLDEN SHOCKWAVES ---
      if (rad.shockwaves && rad.shockwaves.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (const sw of rad.shockwaves) {
          const swAlpha = Math.max(0, 1 - sw.elapsed / sw.life);
          ctx.strokeStyle = `rgba(255, 230, 90, ${swAlpha * 0.95})`;
          ctx.lineWidth = Math.max(2, sw.thickness * swAlpha);
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = `rgba(255, 215, 0, ${swAlpha * 0.25})`;
          ctx.fill();
        }
        ctx.restore();
      }

      // --- RENDER EARTH DEBRIS CHUNKS ---
      if (rad.earthDebris && rad.earthDebris.length > 0) {
        ctx.save();
        for (const d of rad.earthDebris) {
          const dAlpha = Math.max(0, 1 - d.elapsed / d.life);
          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.rotate(d.rotation);
          ctx.fillStyle = `rgba(180, 140, 70, ${dAlpha})`;
          ctx.strokeStyle = `rgba(255, 215, 0, ${dAlpha * 0.7})`;
          ctx.lineWidth = 1;
          ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
          ctx.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size);
          ctx.restore();
        }
        ctx.restore();
      }

      // --- RENDER DUST CLOUDS ---
      if (rad.dustClouds && rad.dustClouds.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (const c of rad.dustClouds) {
          const cAlpha = Math.max(0, (1 - c.elapsed / c.life) * 0.22);
          ctx.fillStyle = `rgba(240, 220, 160, ${cAlpha})`;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // --- RENDER CELESTIAL STARS ---
      if (rad.celestialStars && rad.celestialStars.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (const s of rad.celestialStars) {
          // Light trails behind launched stars
          if (s.trail && s.trail.length > 1) {
            for (let t = 0; t < s.trail.length - 1; t++) {
              const tAlpha = (t / s.trail.length) * 0.7;
              ctx.strokeStyle = `rgba(255, 220, 80, ${tAlpha})`;
              ctx.lineWidth = 2 + (t / s.trail.length) * 3;
              ctx.beginPath();
              ctx.moveTo(s.trail[t].x, s.trail[t].y);
              ctx.lineTo(s.trail[t + 1].x, s.trail[t + 1].y);
              ctx.stroke();
            }
          }

          // Glowing Golden Star Core
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();

          // 4-point golden star flare
          ctx.strokeStyle = "rgba(255, 230, 100, 0.9)";
          ctx.lineWidth = 2;
          const flareLen = s.r * 2.2;
          ctx.beginPath();
          ctx.moveTo(s.x - flareLen, s.y); ctx.lineTo(s.x + flareLen, s.y);
          ctx.moveTo(s.x, s.y - flareLen); ctx.lineTo(s.x, s.y + flareLen);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw Boss Entity
      if (!rad.defeated) {
        ctx.save();
        ctx.translate(bx, by);

        // Outer Halo — no shadowBlur, use screen composite instead
        ctx.fillStyle = "rgba(255, 255, 200, 0.18)";
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

        // Core Body — no shadow
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
        const isEnraged = rad.hp <= 50;
        ctx.fillStyle = isEnraged ? "#ff4444" : "gold";
        ctx.font = "bold 20px monospace";
        ctx.textAlign = "center";
        ctx.fillText(isEnraged ? "THE RADIANCE — ENRAGED" : "RADIANCE", w / 2, 30);

        // Boss HP Bar
        ctx.fillStyle = "rgba(50, 0, 0, 0.5)";
        ctx.fillRect(w / 2 - 150, 45, 300, 15);
        ctx.fillStyle = isEnraged ? "rgba(255, 68, 34, 0.95)" : "rgba(255, 215, 0, 0.9)";
        const hpRatio = rad.hp / 100;
        ctx.fillRect(w / 2 - 150, 45, 300 * hpRatio, 15);
        ctx.strokeStyle = isEnraged ? "#ff8866" : "white";
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

      // Radiance Ambient Particles & Sparks
      const rPart = radParticlesRef.current;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const pVar of rPart.ambient) {
        ctx.fillStyle = `rgba(255, 240, 150, ${pVar.opacity})`;
        ctx.beginPath(); ctx.arc(pVar.x, pVar.y, pVar.r, 0, Math.PI * 2); ctx.fill();
      }
      // Sparks drawn without shadowBlur (already in "screen" composite = cheap glow)
      for (const pVar of rPart.sparks) {
        ctx.fillStyle = pVar.color;
        ctx.beginPath(); ctx.arc(pVar.x, pVar.y, pVar.r, 0, Math.PI * 2); ctx.fill();
      }
      for (const b of rPart.booms) {
        if (!b.delay || b.delay <= 0) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${1 - b.elapsed / b.life})`;
          ctx.lineWidth = 15 * (1 - b.elapsed / b.life);
          ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();

      // Legacy homing orbs — no shadow
      for (const orb of rad.homingOrbs) {
        ctx.fillStyle = "white";
        ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "gold"; ctx.lineWidth = 3; ctx.stroke();
      }

      // Wall Spikes — no shadowBlur
      for (const sp of rad.wallSpikes) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        if (sp.isVert) {
          if (sp.state === "WARN") {
            const warnPulse = 0.22 + 0.18 * Math.sin(now / 90);
            ctx.fillStyle = `rgba(255, 215, 0, ${warnPulse})`;
            ctx.fillRect(sp.x - sp.width / 2, 0, sp.width, h);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sp.x, 0);
            ctx.lineTo(sp.x, h);
            ctx.stroke();
          } else {
            ctx.fillRect(sp.x - sp.width / 2, 0, sp.width, sp.length);
          }
        } else {
          if (sp.state === "WARN") {
            const warnPulse = 0.22 + 0.18 * Math.sin(now / 90);
            ctx.fillStyle = `rgba(255, 215, 0, ${warnPulse})`;
            ctx.fillRect(0, sp.y - sp.width / 2, w, sp.width);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, sp.y);
            ctx.lineTo(w, sp.y);
            ctx.stroke();
          } else {
            ctx.fillRect(0, sp.y - sp.width / 2, sp.length, sp.width);
          }
        }
        ctx.shadowBlur = 0;
      }

      // Lasers with clean pre-fire solid charge beam
      for (const L of rad.lasers) {
        if (L.elapsed < L.chargeTime) {
          const chargeRatio = L.elapsed / L.chargeTime;
          ctx.save();
          ctx.translate(L.cx, L.cy);
          ctx.rotate(L.angle);
          // Pre-fire solid guide ray
          ctx.strokeStyle = `rgba(255, 215, 0, ${0.3 + chargeRatio * 0.5})`;
          ctx.lineWidth = 1.5 + chargeRatio * 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(L.length, 0);
          ctx.stroke();
          // Danger corridor
          ctx.fillStyle = `rgba(255, 215, 0, ${0.04 + chargeRatio * 0.14})`;
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

      // --- RENDER DIVINE SWORDS ---
      if (rad.swordCascades && rad.swordCascades.length > 0) {
        ctx.save();
        for (const sc of rad.swordCascades) {
          const curElapsed = (elapsedMs - sc.spawnedAtMs) / 1000;
          if (curElapsed < sc.delay) continue;
          const activeTime = curElapsed - sc.delay;

          if (sc.state === "WARN") {
            const warnRatio = Math.min(1, activeTime / sc.warnDuration);
            const pulse = 0.4 + 0.6 * Math.sin(now / 70);

            // Floor warning corridor
            ctx.fillStyle = `rgba(255, 215, 0, ${0.08 + warnRatio * 0.15})`;
            ctx.fillRect(sc.x - sc.width / 2, 0, sc.width, h);

            // Thin vertical guide ray
            ctx.strokeStyle = `rgba(255, 235, 120, ${0.4 + warnRatio * 0.5})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sc.x, 0);
            ctx.lineTo(sc.x, h);
            ctx.stroke();

            // Blade glyph at top
            ctx.save();
            ctx.translate(sc.x, 30);
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "gold";
            ctx.shadowBlur = 15 * pulse;
            ctx.beginPath();
            ctx.moveTo(0, sc.height / 2);
            ctx.lineTo(-sc.width / 2, -sc.height / 4);
            ctx.lineTo(-sc.width / 4, -sc.height / 2);
            ctx.lineTo(sc.width / 4, -sc.height / 2);
            ctx.lineTo(sc.width / 2, -sc.height / 4);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 215, 0, 0.9)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          } else if (sc.state === "FALLING") {
            ctx.save();
            ctx.translate(sc.x, sc.y);

            // Motion blur wake trail
            const grad = ctx.createLinearGradient(0, -sc.height * 1.5, 0, sc.height / 2);
            grad.addColorStop(0, "rgba(255, 215, 0, 0)");
            grad.addColorStop(0.6, "rgba(255, 225, 100, 0.5)");
            grad.addColorStop(1, "rgba(255, 255, 255, 0.95)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, sc.height / 2 + 10);
            ctx.lineTo(-sc.width / 2 - 2, -sc.height * 1.2);
            ctx.lineTo(sc.width / 2 + 2, -sc.height * 1.2);
            ctx.closePath();
            ctx.fill();

            // Blade body
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "gold";
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.moveTo(0, sc.height / 2);
            ctx.lineTo(-sc.width / 2, -sc.height / 4);
            ctx.lineTo(-sc.width / 4, -sc.height / 2);
            ctx.lineTo(sc.width / 4, -sc.height / 2);
            ctx.lineTo(sc.width / 2, -sc.height / 4);
            ctx.closePath();
            ctx.fill();

            // Crossguard & golden trim
            ctx.strokeStyle = "rgba(255, 220, 80, 1)";
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-sc.width, -sc.height / 4);
            ctx.lineTo(sc.width, -sc.height / 4);
            ctx.stroke();
            ctx.restore();
          }
        }
        ctx.restore();
      }

      // --- RENDER SOLAR LIGHT PILLARS ---
      if (rad.lightPillars && rad.lightPillars.length > 0) {
        ctx.save();
        for (const pil of rad.lightPillars) {
          const curElapsed = (elapsedMs - pil.spawnedAtMs) / 1000;
          if (pil.state === "WARN") {
            const warnRatio = Math.min(1, curElapsed / pil.warnDuration);
            const pulse = 0.5 + 0.5 * Math.sin(now / 80);
            ctx.fillStyle = `rgba(255, 220, 80, ${0.12 + warnRatio * 0.25 * pulse})`;
            ctx.fillRect(pil.x - pil.width / 2, 0, pil.width, h);

            ctx.strokeStyle = `rgba(255, 235, 120, ${0.4 + warnRatio * 0.5})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pil.x - pil.width / 2, 0); ctx.lineTo(pil.x - pil.width / 2, h);
            ctx.moveTo(pil.x + pil.width / 2, 0); ctx.lineTo(pil.x + pil.width / 2, h);
            ctx.stroke();

            ctx.fillStyle = `rgba(255, 240, 150, ${0.4 + warnRatio * 0.5})`;
            ctx.beginPath();
            ctx.ellipse(pil.x, h - 30, pil.width / 2, 12, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (pil.state === "ERUPT") {
            const eruptElapsed = curElapsed - pil.warnDuration;
            const eruptRatio = Math.min(1, Math.max(0, eruptElapsed / pil.eruptDuration));
            const fade = Math.pow(1 - eruptRatio, 1.2);

            ctx.globalCompositeOperation = "screen";

            ctx.fillStyle = `rgba(255, 205, 50, ${fade * 0.6})`;
            ctx.fillRect(pil.x - (pil.width * 1.5) / 2, 0, pil.width * 1.5, h);

            ctx.fillStyle = `rgba(255, 255, 255, ${fade * 0.95})`;
            ctx.shadowColor = "gold";
            ctx.shadowBlur = 30 * fade;
            ctx.fillRect(pil.x - pil.width / 2, 0, pil.width, h);

            ctx.fillStyle = `rgba(255, 240, 180, ${fade})`;
            ctx.beginPath();
            ctx.ellipse(pil.x, h - 30, pil.width * 0.9, 18, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
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
          let boxAlpha = Math.min(0.8, (god.dialogueTimeMs - 2000)/500);
          let textAlpha = 1.0;
          
          if (god.dialogueTimeMs > 6000) {
             const fadeOut = 1 - (god.dialogueTimeMs - 6000) / 1000;
             boxAlpha *= Math.max(0, fadeOut);
             textAlpha *= Math.max(0, fadeOut);
          }

          ctx.fillStyle = `rgba(0, 0, 0, ${boxAlpha})`;
          ctx.fillRect(0, h/2 + 100, w, 100);
          
          ctx.strokeStyle = `rgba(255, 255, 255, ${textAlpha})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(0, h/2 + 100, w, 100);
          
          ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
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

    // Draw Dash Trail
    for (const tr of playerTrailRef.current) {
        const trFade = Math.max(0, tr.lifeMs / tr.maxLifeMs);
        ctx.save();
        ctx.translate(tr.x, tr.y);
        ctx.globalAlpha = trFade * 0.5;
        ctx.fillStyle = "rgba(255, 150, 200, 1)";
        ctx.shadowColor = "#FF3366";
        ctx.shadowBlur = 15;
        drawHeart(ctx, 0, 0, 10 + (1 - trFade) * 5); // slightly expands as it fades
        ctx.restore();
    }

    // player heart (KEEP ORIGINAL COLOR)
    const iframe = isIFrameActive(now);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = iframe ? 0.55 : 1;
    ctx.fillStyle = "rgba(255, 80, 120, 0.98)"; // ✅ unchanged
    drawHeart(ctx, 0, 0, 12);
    if (focusActiveRef.current) {
      // Precision hitbox center indicator (Undertale cyan soul dot)
      ctx.fillStyle = "#00ffff";
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ══════════════════════════════════════════════════════════════════════════
    // MULTIPLAYER OPPONENT SOUL RENDERING (ETHEREAL CYAN SPECTRAL SOUL)
    // ══════════════════════════════════════════════════════════════════════════
    if (isMultiplayer && opp.initialized && (now - opp.lastUpdate < 8000) && (opp.hp === undefined || opp.hp > 0)) {
      const ox = clamp(opp.currentX, 18, w - 18);
      const oy = clamp(opp.currentY, 18, h - 18);
      const isHitFlash = now < opp.hitFlashUntil;

      // 1. Draw Opponent Dash / Ghost Trails
      for (const tr of opp.trail) {
        const trFade = Math.max(0, tr.lifeMs / tr.maxLifeMs);
        ctx.save();
        ctx.translate(tr.x, tr.y);
        ctx.globalAlpha = trFade * 0.45;
        ctx.fillStyle = "#00ffff";
        ctx.shadowColor = "#00f0ff";
        ctx.shadowBlur = 14;
        drawHeart(ctx, 0, 0, 10 + (1 - trFade) * 4);
        ctx.restore();
      }

      // 2. Draw Opponent Guard Barrier if active
      if (opp.isGuarding) {
        ctx.save();
        ctx.strokeStyle = "rgba(0, 255, 255, 0.9)";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#00ffff";
        ctx.shadowBlur = 12;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        const spin = (now / 250) % (Math.PI * 2);
        ctx.arc(ox, oy, 18, spin, spin + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // 3. Draw Opponent Corrupt Heal Ring if active
      if (opp.isHealing) {
        ctx.save();
        ctx.strokeStyle = `rgba(52, 211, 153, ${0.5 + 0.4 * Math.sin(now / 100)})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#34d399";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(ox, oy, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 4. Draw Opponent Soul Heart (Ethereal Cyan Spectral Soul)
      ctx.save();
      ctx.translate(ox, oy);

      // Subtle atmospheric breathing pulse
      const oppPulse = 1 + Math.sin(now / 180) * 0.04;
      ctx.scale(oppPulse, oppPulse);

      // Glow halo
      ctx.shadowColor = isHitFlash ? "#ffffff" : "#00f0ff";
      ctx.shadowBlur = isHitFlash ? 26 : 16;
      ctx.globalAlpha = isHitFlash ? 1 : 0.88;
      ctx.fillStyle = isHitFlash
        ? "#ffffff"
        : opp.isDashing
        ? "#7df9ff"
        : "#00d8f6";

      drawHeart(ctx, 0, 0, 12);
      ctx.restore();

      // 5. Sleek Undertale Nametag Badge above Opponent Soul
      const displayName = opponentNameRef.current || opponentName || "OPPONENT";
      ctx.save();
      ctx.font = "9px 'Press Start 2P', monospace, sans-serif";
      const textMetrics = ctx.measureText(displayName);
      const tagW = Math.max(52, textMetrics.width + 14);
      const tagH = 16;
      const tagX = ox - tagW / 2;
      const tagY = oy - 28;

      // Dark translucent badge background with cyan border
      ctx.fillStyle = "rgba(6, 12, 22, 0.85)";
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = isHitFlash ? "#ff3366" : "rgba(0, 255, 255, 0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX, tagY, tagW, tagH);

      // Opponent Name
      ctx.fillStyle = isHitFlash ? "#ff3366" : "#00ffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 4;
      ctx.fillText(displayName, ox, tagY + tagH / 2 + 1);
      ctx.restore();
    }

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

    } catch (err) {
      // Swallow errors so a single bad frame never kills the loop
      console.error("[GameLoop] Frame error (skipped):", err);
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
  
  // Compute dash status for HUD display
  const dashRem = dashRef.current ? Math.max(0, dashRef.current.cooldownUntil - nowMs) : 0;
  const dashStatus = dashRem <= 0 ? "READY" : (dashRem / 1000).toFixed(1) + "s";

  // Mobile Special Button Situation Resolver
  const rad = radianceBossRef.current;
  const god = goddessBossRef.current;
  const hasActiveBoss = (rad && rad.active) || (god && god.active);
  const bossCharge = rad?.active ? (rad.orbCharge || 0) : god?.active ? (god.orbCharge || 0) : 0;
  const bossMaxCharge = rad?.active ? (rad.orbChargeMax || 3) : god?.active ? (god.orbChargeMax || 3) : 3;
  const isBossChargeFull = hasActiveBoss && bossCharge >= bossMaxCharge;

  let mobileSpecialLabel = "FOCUS";
  let mobileSpecialSublabel = focusActiveRef.current ? "ACTIVE" : "SLOW";
  let mobileSpecialReady = true;
  let mobileSpecialPulse = focusActiveRef.current;

  if (hasActiveBoss) {
    if (isBossChargeFull) {
      mobileSpecialLabel = "BOOM";
      mobileSpecialSublabel = "[R] READY";
      mobileSpecialReady = true;
      mobileSpecialPulse = true;
    } else {
      mobileSpecialLabel = "CHARGE";
      mobileSpecialSublabel = `${bossCharge}/${bossMaxCharge}`;
      mobileSpecialReady = false;
      mobileSpecialPulse = false;
    }
  } else if (corruptHealUntilRef.current > nowMs) {
    mobileSpecialLabel = "REVIVE";
    mobileSpecialSublabel = `${Math.max(0, (corruptHealUntilRef.current - nowMs) / 1000).toFixed(1)}s`;
    mobileSpecialReady = false;
    mobileSpecialPulse = true;
  }

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
      <div className="w-screen h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="undertale-box p-8 max-w-md w-full text-center bg-black">
          <div className="text-2xl text-[#ff0000] animate-heartbeat mb-4">❤️</div>
          <div className="font-pixel text-sm text-red-500 mb-3">* FATAL ERROR</div>
          <div className="font-dialogue text-lg text-neutral-300 mb-6">* {fatalErr}</div>
          <button
            onClick={() => {
              setFatalErr("");
              exitToMenu();
            }}
            className="font-pixel text-xs border-2 border-white hover:bg-white hover:text-black px-5 py-3 transition cursor-pointer"
          >
            [ BACK TO MENU ]
          </button>
        </div>
      </div>
    );
  }

  // Determine if we should show the header bar (COUNTDOWN or PLAYING)
  const showHeaderBar = phase === PHASE.COUNTDOWN || phase === PHASE.PLAYING;

  return (
    <div className="w-screen h-screen max-w-full max-h-full bg-black text-white flex flex-col items-center justify-center overflow-hidden select-none p-1.5 sm:p-2.5 font-dialogue">
      <div className="relative flex flex-col items-center justify-center w-full max-w-[1100px] h-full max-h-screen overflow-hidden gap-2">
        {/* Top Header during COUNTDOWN & PLAYING */}
        <div className="w-full flex-shrink-0">
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
            corruptHealRem={Math.max(0, (corruptHealUntilRef.current - nowMs) / 1000)}
            isCompetitive={vsMode === "ranked" || vsMode === "friend"}
            isStandaloneSans={isStandaloneSans}
            onExit={exitToMenu}
          />

          {/* Top Info Bar during MENU / QUEUE / SUMMARY */}
          {phase !== PHASE.PLAYING && phase !== PHASE.COUNTDOWN && (
            <div className="flex items-center justify-between px-4 py-2 border-b-2 border-white bg-black font-pixel">
              <div className="flex items-center gap-3">
                <span className="text-[#ff0000] text-xs animate-heartbeat">❤️</span>
                <span className="text-xs text-white tracking-wider">
                  {vsMode === "ranked"
                    ? "* RANKED BATTLE"
                    : vsMode === "friend"
                    ? "* FRIEND DUEL"
                    : vsMode === "boss"
                    ? "* BOSS GAUNTLET"
                    : "* TIME TRIAL SURVIVAL"}
                </span>
              </div>

              <button
                onClick={() => {
                  ensureRadianceMusicStoppedImmediately();
                  exitToMenu();
                }}
                className="text-[10px] border-2 border-[#ffff00] text-[#ffff00] hover:bg-[#ffff00] hover:text-black px-3 py-1 transition cursor-pointer"
              >
                [ EXIT ]
              </button>
            </div>
          )}
        </div>

        {/* Main Arena Frame — Undertale Battle Box */}
        <div className="relative flex items-center justify-center w-full flex-1 overflow-hidden undertale-box bg-black touch-control-layer">
          <canvas
            ref={canvasRef}
            width={980}
            height={540}
            className="w-auto max-w-full block object-contain"
            style={{
              aspectRatio: "980 / 540",
              maxHeight:
                phase === PHASE.PLAYING || phase === PHASE.COUNTDOWN
                  ? "calc(100vh - 60px)"
                  : "calc(100vh - 100px)",
            }}
          />

          {/* Bottom Left: Cooldown HUD — Undertale Style (Desktop only) */}
          {!showTouchControls && (phase === PHASE.PLAYING || phase === PHASE.COUNTDOWN) && (
            <div className="absolute bottom-4 left-4 flex flex-col gap-2 pointer-events-none z-10">
              <div className={`flex items-center justify-between px-3 py-1.5 border-2 font-pixel text-[10px] transition-colors w-36 ${
                dashRem <= 0
                  ? 'border-[#00ff00] text-[#00ff00] bg-black'
                  : 'border-neutral-700 text-neutral-500 bg-black'
              }`}>
                <span className="tracking-widest">DASH</span>
                <span className={dashRem <= 0 ? 'text-[#00ff00] animate-pulse' : 'text-red-400'}>
                  {dashRem <= 0 ? "READY" : (dashRem / 1000).toFixed(1) + "s"}
                </span>
              </div>
              <div className={`flex items-center justify-between px-3 py-1.5 border-2 font-pixel text-[10px] transition-colors w-36 ${
                guardStatus === "READY"
                  ? 'border-[#00ffff] text-[#00ffff] bg-black'
                  : 'border-neutral-700 text-neutral-500 bg-black'
              }`}>
                <span className="tracking-widest">GUARD</span>
                <span className={guardStatus === "READY" ? 'text-[#00ffff] animate-pulse' : 'text-neutral-500'}>
                  {guardStatus}
                </span>
              </div>
            </div>
          )}

          {/* Mobile Touch Controls Layer (Virtual Joystick & Action Buttons) */}
          <MobileControls
            joystickInputRef={joystickInputRef}
            onDash={() => {
              pendingMobileTriggerRef.current.dash = true;
            }}
            onGuard={() => {
              pendingMobileTriggerRef.current.guard = true;
            }}
            onSpecial={() => {
              pendingMobileTriggerRef.current.special = true;
            }}
            onExit={exitToMenu}
            dashReady={dashRem <= 0}
            dashStatus={dashStatus}
            guardReady={guardStatus === "READY"}
            guardStatus={guardStatus}
            guardActive={nowMs < guardUntilRef.current}
            specialReady={mobileSpecialReady}
            specialLabel={mobileSpecialLabel}
            specialSublabel={mobileSpecialSublabel}
            specialPulse={mobileSpecialPulse}
            visible={
              (phase === PHASE.PLAYING || phase === PHASE.COUNTDOWN) &&
              showTouchControls
            }
            showFullscreenButton={showTouchControls}
          />

          {/* MENU Overlay - not shown for time trial */}
          {phase === PHASE.MENU && mode !== "timeTrial" && (
            <Overlay>
              <div className="text-center max-w-md">
                <div className="text-[#ff0000] text-3xl animate-heartbeat mb-3">❤️</div>
                <div className="font-pixel text-lg md:text-2xl text-white tracking-widest mb-2">SOUL DUEL</div>
                <div className="font-dialogue text-xl text-neutral-300 mb-6">
                  * Prepare your SOUL for battle.
                </div>

                <div className="flex flex-col gap-3 items-center">
                  <button
                    onClick={joinQueue}
                    className={`font-pixel text-sm px-6 py-3 border-2 transition cursor-pointer w-full max-w-xs ${
                      vsMode === "ranked"
                        ? 'border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black'
                        : 'border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff] hover:text-black'
                    }`}
                  >
                    {vsMode === "ranked" ? "[ FIGHT ]" : "[ ACT ]"}
                  </button>

                  <button
                    onClick={exitToMenu}
                    className="font-pixel text-xs border-2 border-white/40 text-neutral-400 hover:border-white hover:text-white px-6 py-2 transition cursor-pointer w-full max-w-xs"
                  >
                    [ BACK TO MENU ]
                  </button>
                </div>
              </div>
            </Overlay>
          )}

          {/* QUEUE Overlay - not shown for time trial */}
          {phase === PHASE.QUEUE && mode !== "timeTrial" && (
            <Overlay>
              <div className="text-center max-w-sm">
                <div className="font-pixel text-sm text-[#ffff00] mb-4 animate-pulse tracking-widest">
                  SEARCHING...
                </div>
                <div className="font-dialogue text-xl text-neutral-300 mb-2">
                  {vsMode === "ranked"
                    ? "* Scanning the underground for a worthy human soul..."
                    : "* Waiting for your ally to accept the duel invitation..."}
                </div>
                <div className="flex justify-center my-6">
                  <div className="flex gap-2">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-3 h-3 border-2 border-[#ffff00] bg-[#ffff00] animate-pulse" style={{animationDelay: `${i*0.2}s`}} />
                    ))}
                  </div>
                </div>
                <button
                  onClick={leaveQueue}
                  className="font-pixel text-xs border-2 border-neutral-600 text-neutral-400 hover:border-white hover:text-white px-5 py-2 transition cursor-pointer"
                >
                  [ CANCEL ]
                </button>
              </div>
            </Overlay>
          )}

          {/* MATCH_FOUND Overlay */}
          {phase === PHASE.MATCH_FOUND && (
            <Overlay>
              <div className="text-center max-w-lg">
                <div className="font-pixel text-2xl md:text-4xl text-white tracking-[0.15em] animate-pulse mb-6">
                  MATCH FOUND
                </div>

                <div className="undertale-box px-6 py-4 mb-6 bg-black">
                  <div className="flex items-center justify-center gap-4 font-pixel">
                    <div className="text-left">
                      <div className="text-[9px] text-neutral-400 tracking-widest mb-1">* YOU</div>
                      <div className="text-sm text-[#ff9900] truncate max-w-[140px]">{myName}</div>
                    </div>
                    <div className="text-neutral-500 font-pixel text-xs">VS</div>
                    <div className="text-right">
                      <div className="text-[9px] text-neutral-400 tracking-widest mb-1">* OPPONENT</div>
                      <div className="text-sm text-[#00ffff] truncate max-w-[140px]">{opponentName}</div>
                    </div>
                  </div>
                </div>

                <div className="font-dialogue text-lg text-neutral-400 tracking-widest animate-pulse">
                  * LOCKING ARENA • PREPARING SOULS...
                </div>
              </div>
            </Overlay>
          )}

          {/* COUNTDOWN Overlay */}
          {phase === PHASE.COUNTDOWN && (
            <Overlay>
              <div className="text-center">
                <div className="font-pixel text-sm text-neutral-400 tracking-widest mb-4">* MATCH STARTING</div>
                <div className="font-pixel text-7xl md:text-8xl text-[#ffff00] tabular-nums drop-shadow-[0_0_20px_rgba(255,255,0,0.5)] animate-pulse">
                  {Math.max(0, Math.ceil(countdownMs / 1000))}
                </div>
              </div>
            </Overlay>
          )}

          {/* MATCH_OVER Overlay */}
          {phase === PHASE.MATCH_OVER && (
            <Overlay>
              <div className="text-center">
                <div className={`font-pixel text-2xl md:text-4xl tracking-widest ${
                  iAmWinner ? 'text-[#ffff00] animate-pulse' : 'text-red-500'
                }`}>
                  {iAmWinner ? "VICTORY!" : "GAME OVER"}
                </div>
                <div className="mt-4 font-dialogue text-xl text-neutral-300">
                  {iAmWinner
                    ? "* Your SOUL shines with DETERMINATION."
                    : "* You were consumed by the darkness."}
                </div>
                <div className="mt-3 font-pixel text-sm text-neutral-400">
                  * TIME: {timerText}
                </div>
              </div>
            </Overlay>
          )}

          {/* SUMMARY Overlay */}
          {phase === PHASE.SUMMARY && (
            <Overlay>
              <div className="text-center max-w-lg w-full">
                {mode === "timeTrial" ? (
                  <>
                    <div className="font-pixel text-lg md:text-2xl text-[#00ffff] tracking-widest mb-4">
                      {hp > 0 ? "* SURVIVED!" : "* TIME TRIAL FINISHED"}
                    </div>

                    {/* Survival Rank Banner */}
                    <div className="flex items-center justify-center gap-3 mb-5">
                      <RankBadge
                        rank={getTimeTrialRankClient(endAt ? endAt - surviveStart : nowMs - surviveStart)}
                        size="md"
                      />
                      <div className="font-pixel text-xs text-[#ffff00] tracking-widest">
                        {getTimeTrialTitleClient(endAt ? endAt - surviveStart : nowMs - surviveStart)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Stat label="Survival Time" value={timerText} />
                      <Stat label="HP Remaining" value={String(hp)} />
                      <Stat
                        label="Personal Best"
                        value={fmtMs(Math.max(bestTimeTrialMs, endAt ? endAt - surviveStart : 0))}
                      />
                      <Stat
                        label="Next Tier Goal"
                        value={getNextTierGoal(endAt ? endAt - surviveStart : nowMs - surviveStart)}
                      />
                    </div>

                    {timeTrialSubmissionStatus && (
                      <div className={`font-pixel text-[10px] px-3 py-2 border-2 mb-4 ${
                        timeTrialSubmissionStatus === "success"
                          ? "text-[#00ff00] border-[#00ff00]"
                          : timeTrialSubmissionStatus === "error"
                          ? "text-red-400 border-red-500"
                          : "text-neutral-300 border-neutral-600"
                      }`}>
                        * {timeTrialSubmissionMsg}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className={`font-pixel text-lg md:text-2xl tracking-widest mb-4 ${
                      iAmWinner ? 'text-[#ffff00]' : 'text-red-500'
                    }`}>
                      {iAmWinner ? "* VICTORY" : "* DEFEAT"}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Stat label="Survival Time" value={timerText} />
                      <Stat label="HP Remaining" value={String(hp)} />
                      <Stat label="Rank Change" value={rankChangeText || "—"} />
                      <Stat label="Summary" value={summaryText || ""} />
                    </div>
                  </>
                )}

                <button
                  onClick={exitToMenu}
                  className="font-pixel text-xs border-2 border-white hover:bg-white hover:text-black px-6 py-3 transition cursor-pointer"
                >
                  [ BACK TO MAIN MENU ]
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

      {/* Landscape Orientation Prompt Modal on Mobile Devices */}
      {showTouchControls && isPortrait && !dismissPortraitPrompt && (
        <LandscapePrompt onDismiss={() => setDismissPortraitPrompt(true)} />
      )}
    </div>
  );
}

/* ---------- helpers/components ---------- */

function Overlay({ children }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/92 pointer-events-none">
      <div className="px-6 py-8 pointer-events-auto undertale-box bg-black text-white max-w-[90vw] max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border-2 border-white/40 bg-black p-3 text-left hover:border-white transition">
      <div className="font-pixel text-[9px] text-neutral-400 tracking-wider mb-1">* {label.toUpperCase()}</div>
      <div className="font-pixel text-sm text-white">{value}</div>
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