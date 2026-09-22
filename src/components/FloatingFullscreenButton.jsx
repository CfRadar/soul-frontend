import React from "react";
import { useFullscreen } from "../hooks/useFullscreen";

/**
 * A persistent, floating Undertale-styled button that automatically appears
 * whenever the application is in fullscreen mode.
 * Guarantees that mobile/touch users are NEVER trapped in fullscreen.
 */
export function FloatingFullscreenButton({ className = "" }) {
  const { isFullscreen, exit } = useFullscreen();

  if (!isFullscreen) return null;

  return (
    <button
      type="button"
      onClick={exit}
      onTouchStart={exit}
      className={`fixed top-2 right-2 sm:top-3 sm:right-3 z-50 font-pixel text-[9px] sm:text-[10px] text-[#ffff00] border-2 border-[#ffff00] bg-black/90 px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-[0_0_10px_rgba(255,255,0,0.5)] hover:bg-[#ffff00] hover:text-black transition-all cursor-pointer active:scale-95 select-none touch-manipulation flex items-center gap-1.5 ${className}`}
      title="Exit Fullscreen Mode"
      aria-label="Exit Fullscreen"
    >
      <span className="text-xs">⊠</span>
      <span>EXIT FS</span>
    </button>
  );
}

export default FloatingFullscreenButton;
