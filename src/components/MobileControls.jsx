/**
 * MobileControls.jsx
 * Touch-native game controls for SoulDuel on mobile devices (phones/tablets).
 *
 * Features:
 *  - 360° analog Virtual Joystick on the left with glowing Undertale red SOUL knob
 *  - Ergonomic Action Buttons on the right (DASH, GUARD, situation-dependent SPECIAL)
 *  - Dynamic live cooldown timers on buttons
 *  - Fullscreen button with browser & orientation lock support
 *  - Undertale-themed Landscape orientation prompt modal for portrait phones
 *  - Multi-touch safety and zero-latency touch handling
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const JOYSTICK_RADIUS = 54; // outer ring radius px
const KNOB_RADIUS = 24;     // thumb knob radius px
const DEADZONE = 6;         // minimum displacement px to trigger movement

// ─── Fullscreen & Orientation Helpers ─────────────────────────────────────────
async function triggerFullscreenAndRotate(el = document.documentElement) {
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    } else if (el.mozRequestFullScreen) {
      await el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
      await el.msRequestFullscreen();
    }
  } catch (err) {
    // Some browsers or iframes restrict fullscreen without permission
    console.debug("Fullscreen request notice:", err);
  }

  // Attempt orientation lock if available
  try {
    if (window.screen?.orientation?.lock) {
      await window.screen.orientation.lock("landscape");
    } else if (window.screen?.lockOrientation) {
      window.screen.lockOrientation("landscape");
    }
  } catch (err) {
    console.debug("Orientation lock notice:", err);
  }
}

function exitFullscreen() {
  try {
    if (window.screen?.orientation?.unlock) {
      window.screen.orientation.unlock();
    }
  } catch {}
  try {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  } catch (err) {
    console.debug("Exit fullscreen notice:", err);
  }
}

function isFullscreen() {
  if (typeof document === "undefined") return false;
  return !!(
    document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement
  );
}

// ─── VirtualJoystick ─────────────────────────────────────────────────────────
function VirtualJoystick({ inputRef }) {
  const baseRef = useRef(null);
  const activeTouchIdRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);

  const resetKnob = useCallback(() => {
    activeTouchIdRef.current = null;
    if (inputRef) {
      inputRef.current = { ax: 0, ay: 0 };
    }
    setKnob({ x: 0, y: 0 });
    setIsActive(false);
  }, [inputRef]);

  const updateFromCoords = useCallback((clientX, clientY) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist < DEADZONE) {
      if (inputRef) inputRef.current = { ax: 0, ay: 0 };
      setKnob({ x: 0, y: 0 });
      return;
    }

    const clamped = Math.min(dist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    const ax = kx / JOYSTICK_RADIUS;
    const ay = ky / JOYSTICK_RADIUS;

    if (inputRef) inputRef.current = { ax, ay };
    setKnob({ x: kx, y: ky });
  }, [inputRef]);

  // Touch event handlers (for real mobile screens)
  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    if (activeTouchIdRef.current !== null) return;
    const t = e.changedTouches[0];
    activeTouchIdRef.current = t.identifier;
    setIsActive(true);
    updateFromCoords(t.clientX, t.clientY);
  }, [updateFromCoords]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (activeTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === activeTouchIdRef.current) {
        updateFromCoords(t.clientX, t.clientY);
        break;
      }
    }
  }, [updateFromCoords]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    if (activeTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === activeTouchIdRef.current) {
        resetKnob();
        break;
      }
    }
  }, [resetKnob]);

  // Pointer event fallback (for desktop DevTools responsive mode)
  const handlePointerDown = useCallback((e) => {
    if (e.pointerType === "touch") return; // Touch events handle this
    e.preventDefault();
    activeTouchIdRef.current = e.pointerId;
    setIsActive(true);
    updateFromCoords(e.clientX, e.clientY);

    const onPointerMove = (ev) => {
      if (ev.pointerId === activeTouchIdRef.current) {
        updateFromCoords(ev.clientX, ev.clientY);
      }
    };
    const onPointerUp = (ev) => {
      if (ev.pointerId === activeTouchIdRef.current) {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        resetKnob();
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }, [updateFromCoords, resetKnob]);

  return (
    <div
      ref={baseRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      style={{
        width: JOYSTICK_RADIUS * 2,
        height: JOYSTICK_RADIUS * 2,
        borderRadius: "50%",
        border: isActive ? "2px solid #ffffff" : "2px solid rgba(255, 255, 255, 0.4)",
        background: isActive
          ? "radial-gradient(circle, rgba(20,20,30,0.85) 0%, rgba(0,0,0,0.92) 100%)"
          : "radial-gradient(circle, rgba(15,15,20,0.65) 0%, rgba(0,0,0,0.8) 100%)",
        boxShadow: isActive
          ? "0 0 20px rgba(255, 255, 255, 0.35), inset 0 0 15px rgba(255, 255, 255, 0.15)"
          : "0 0 12px rgba(255, 255, 255, 0.1)",
        position: "relative",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        flexShrink: 0,
      }}
    >
      {/* Subtle Directional Crosshair & Arrows */}
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center", pointerEvents: "none"
      }}>
        <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.12)", position: "absolute" }} />
        <div style={{ width: 1, height: "100%", background: "rgba(255,255,255,0.12)", position: "absolute" }} />
        <span style={{ position: "absolute", top: 4, fontSize: 8, color: "rgba(255,255,255,0.3)" }}>▲</span>
        <span style={{ position: "absolute", bottom: 4, fontSize: 8, color: "rgba(255,255,255,0.3)" }}>▼</span>
        <span style={{ position: "absolute", left: 4, fontSize: 8, color: "rgba(255,255,255,0.3)" }}>◄</span>
        <span style={{ position: "absolute", right: 4, fontSize: 8, color: "rgba(255,255,255,0.3)" }}>►</span>
      </div>

      {/* Center Undertale Red SOUL Knob */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: KNOB_RADIUS * 2,
          height: KNOB_RADIUS * 2,
          marginLeft: -KNOB_RADIUS,
          marginTop: -KNOB_RADIUS,
          transform: `translate(${knob.x}px, ${knob.y}px)`,
          borderRadius: "50%",
          background: isActive
            ? "radial-gradient(circle at 35% 35%, #ff2244, #990011)"
            : "radial-gradient(circle at 35% 35%, #ee1133, #660011)",
          border: isActive ? "2px solid #ffffff" : "2px solid #ff4466",
          boxShadow: isActive
            ? "0 0 16px #ff0033, 0 0 30px rgba(255,0,51,0.5), inset 0 0 8px rgba(255,255,255,0.5)"
            : "0 0 10px rgba(255,0,51,0.4), inset 0 0 4px rgba(255,100,120,0.3)",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: isActive ? "none" : "transform 0.12s ease-out, box-shadow 0.12s ease-out",
        }}
      >
        <span
          style={{
            fontSize: 13,
            lineHeight: 1,
            userSelect: "none",
            filter: "drop-shadow(0 0 4px rgba(255,255,255,0.6))",
          }}
        >
          ❤️
        </span>
      </div>
    </div>
  );
}

// ─── ActionButton ─────────────────────────────────────────────────────────────
function ActionButton({
  label,
  sublabel,
  color,
  glowColor,
  onPress,
  disabled,
  pulse,
  size = 68,
}) {
  const [pressing, setPressing] = useState(false);

  const handleStart = (e) => {
    e.preventDefault();
    if (disabled) return;
    setPressing(true);
    onPress?.();
  };

  const handleEnd = (e) => {
    e.preventDefault();
    setPressing(false);
  };

  return (
    <button
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onTouchCancel={handleEnd}
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${disabled ? "rgba(255,255,255,0.18)" : color}`,
        background: pressing
          ? `${color}40`
          : disabled
          ? "rgba(10,10,15,0.75)"
          : "rgba(0,0,0,0.8)",
        color: disabled ? "rgba(255,255,255,0.3)" : color,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        cursor: disabled ? "not-allowed" : "pointer",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        transition: "background 0.05s, transform 0.05s, box-shadow 0.05s",
        transform: pressing ? "scale(0.92)" : "scale(1)",
        boxShadow: pressing
          ? `0 0 22px ${glowColor}, 0 0 8px ${glowColor} inset`
          : pulse
          ? `0 0 18px ${glowColor}, 0 0 35px ${glowColor}66`
          : disabled
          ? "none"
          : `0 0 12px ${glowColor}66`,
        flexShrink: 0,
        WebkitTapHighlightColor: "transparent",
        outline: "none",
      }}
    >
      <span
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: size > 64 ? 9 : 8,
          letterSpacing: 1,
          lineHeight: 1.2,
          textAlign: "center",
          textShadow: disabled ? "none" : `0 0 6px ${glowColor}`,
        }}
      >
        {label}
      </span>
      {sublabel && (
        <span
          style={{
            fontSize: 8,
            fontWeight: "bold",
            opacity: disabled ? 0.45 : 0.85,
            fontFamily: "monospace",
            marginTop: 1,
            color: disabled ? "rgba(255,255,255,0.4)" : "#ffffff",
          }}
        >
          {sublabel}
        </span>
      )}
    </button>
  );
}

// ─── FullscreenButton ─────────────────────────────────────────────────────────
function FullscreenButton() {
  const [fs, setFs] = useState(isFullscreen);

  useEffect(() => {
    const handler = () => setFs(isFullscreen());
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    document.addEventListener("mozfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
      document.removeEventListener("mozfullscreenchange", handler);
    };
  }, []);

  const toggle = (e) => {
    e.preventDefault();
    if (isFullscreen()) {
      exitFullscreen();
    } else {
      triggerFullscreenAndRotate(document.documentElement);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      style={{
        position: "absolute",
        top: 10,
        right: 12,
        padding: "8px 12px",
        borderRadius: 4,
        border: "1.5px solid rgba(255,255,255,0.5)",
        background: "rgba(0,0,0,0.85)",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        pointerEvents: "auto",
        touchAction: "manipulation",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        zIndex: 40,
        fontSize: 10,
        fontFamily: "'Press Start 2P', monospace",
        boxShadow: "0 0 8px rgba(255,255,255,0.2)",
      }}
      title={fs ? "Exit Fullscreen (Windowed)" : "Enter Fullscreen (Landscape)"}
    >
      <span>{fs ? "⊠" : "⛶"}</span>
      <span style={{ fontSize: 8 }}>{fs ? "WINDOW" : "FULLSCREEN"}</span>
    </button>
  );
}

// ─── ExitMatchButton ──────────────────────────────────────────────────────────
function ExitMatchButton({ onExit }) {
  const handleExit = (e) => {
    e?.stopPropagation?.();
    onExit?.();
  };

  return (
    <button
      type="button"
      onClick={handleExit}
      style={{
        position: "absolute",
        top: 10,
        left: 12,
        padding: "8px 12px",
        borderRadius: 4,
        border: "1.5px solid #ffff00",
        background: "rgba(0,0,0,0.9)",
        color: "#ffff00",
        display: "flex",
        alignItems: "center",
        gap: 4,
        cursor: "pointer",
        pointerEvents: "auto",
        touchAction: "manipulation",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        zIndex: 40,
        fontSize: 10,
        fontFamily: "'Press Start 2P', monospace",
        boxShadow: "0 0 10px rgba(255,255,0,0.4)",
      }}
      title="Exit match to main menu"
    >
      <span style={{ fontSize: 9 }}>[ EXIT ]</span>
    </button>
  );
}

// ─── Landscape Orientation Prompt Modal ───────────────────────────────────────
export function LandscapePrompt({ onDismiss }) {
  const handleRotate = async (e) => {
    e?.preventDefault?.();
    await triggerFullscreenAndRotate(document.documentElement);
    onDismiss?.();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.95)",
        backdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
        userSelect: "none",
      }}
    >
      <div
        className="undertale-box"
        style={{
          maxWidth: 420,
          width: "100%",
          padding: "28px 24px",
          backgroundColor: "#000000",
          border: "4px solid #ffffff",
          boxShadow: "0 0 0 3px #000000, 0 0 0 6px #ffffff, 0 0 25px rgba(255,255,255,0.2)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        {/* Animated Phone Icon */}
        <div
          style={{
            fontSize: 44,
            animation: "rotate-phone-prompt 2.5s infinite ease-in-out",
            filter: "drop-shadow(0 0 8px rgba(255,255,0,0.5))",
          }}
        >
          📱
        </div>

        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            color: "#ffff00",
            fontSize: 13,
            letterSpacing: 1.5,
            lineHeight: 1.6,
          }}
        >
          * ROTATE YOUR DEVICE
        </div>

        <div
          style={{
            fontFamily: "'VT323', monospace",
            color: "#d0d0d0",
            fontSize: 19,
            lineHeight: 1.5,
            letterSpacing: "0.04em",
          }}
        >
          * SoulDuel is forged exclusively for Landscape combat. Turn your phone horizontally to see the entire battle arena.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", marginTop: 8 }}>
          <button
            onClick={handleRotate}
            onTouchStart={handleRotate}
            style={{
              padding: "14px 18px",
              border: "2px solid #00ffff",
              backgroundColor: "#000000",
              color: "#00ffff",
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 10,
              cursor: "pointer",
              boxShadow: "0 0 12px rgba(0,255,255,0.4)",
              transition: "transform 0.1s, background 0.1s",
            }}
          >
            [ ⛶ FULLSCREEN & ROTATE ]
          </button>

          <button
            onClick={onDismiss}
            onTouchStart={onDismiss}
            style={{
              padding: "8px 12px",
              border: "1px solid #555555",
              backgroundColor: "transparent",
              color: "#888888",
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8,
              cursor: "pointer",
            }}
          >
            [ CONTINUE IN PORTRAIT ]
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MobileControls (main export) ────────────────────────────────────────────
export default function MobileControls({
  joystickInputRef,
  onDash,
  onGuard,
  onSpecial,
  onExit,
  dashReady = true,
  dashStatus = "READY",
  guardReady = true,
  guardStatus = "READY",
  guardActive = false,
  specialReady = false,
  specialLabel = "SPECIAL",
  specialSublabel = "[R]",
  specialPulse = false,
  visible = true,
  showFullscreenButton = true,
}) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 25,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        padding: "0 16px 18px 16px",
        // Respect safe-area-inset on modern notched smartphones (iPhone Dynamic Island, punch-holes)
        paddingLeft: "max(16px, env(safe-area-inset-left, 16px))",
        paddingRight: "max(16px, env(safe-area-inset-right, 16px))",
        paddingBottom: "max(18px, env(safe-area-inset-bottom, 18px))",
        boxSizing: "border-box",
      }}
    >
      {/* ── LEFT: Virtual Joystick Zone ── */}
      <div
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px",
        }}
      >
        <VirtualJoystick inputRef={joystickInputRef} />
      </div>

      {/* ── RIGHT: Tactical Action Buttons ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "flex-end",
          pointerEvents: "auto",
        }}
      >
        {/* Top row: Situation-dependent SPECIAL button */}
        <div style={{ paddingRight: 4 }}>
          <ActionButton
            label={specialLabel}
            sublabel={specialSublabel}
            color={specialReady ? "#ffaa00" : "rgba(255,170,0,0.35)"}
            glowColor="#ffaa00"
            onPress={onSpecial}
            disabled={!specialReady}
            pulse={specialPulse || specialReady}
            size={64}
          />
        </div>

        {/* Bottom row: GUARD + DASH side-by-side */}
        <div style={{ display: "flex", gap: 12 }}>
          {/* GUARD Button */}
          <ActionButton
            label="GUARD"
            sublabel={guardActive ? "ACTIVE" : (guardStatus === "READY" ? "[SPC]" : guardStatus)}
            color={guardActive ? "#ffffff" : guardReady ? "#00ffff" : "rgba(0,255,255,0.25)"}
            glowColor={guardActive ? "#ffffff" : "#00ffff"}
            onPress={onGuard}
            disabled={!guardReady && !guardActive}
            pulse={guardActive || guardReady}
            size={68}
          />

          {/* DASH Button */}
          <ActionButton
            label="DASH"
            sublabel={dashStatus === "READY" ? "[SHF]" : dashStatus}
            color={dashReady ? "#00ff88" : "rgba(0,255,136,0.25)"}
            glowColor="#00ff88"
            onPress={onDash}
            disabled={!dashReady}
            pulse={dashReady}
            size={68}
          />
        </div>
      </div>
    </div>
  );
}
