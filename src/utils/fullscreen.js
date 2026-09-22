// client/src/utils/fullscreen.js

/**
 * Checks if the document is currently in fullscreen mode.
 */
export function isFullscreen() {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

/**
 * Requests fullscreen and attempts to lock orientation to landscape (if mobile).
 */
export async function enterFullscreen(element = document.documentElement) {
  try {
    const el = element || document.documentElement;
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
    console.debug("[Fullscreen] Enter notice:", err);
  }

  // Attempt orientation lock (supported on Android Chrome, ignored on iOS/Desktop)
  try {
    if (window.screen?.orientation?.lock) {
      await window.screen.orientation.lock("landscape").catch(() => {});
    }
  } catch {}
}

/**
 * Exits fullscreen and releases orientation lock.
 */
export async function exitFullscreen() {
  // First unlock orientation so user device returns to natural orientation
  try {
    if (window.screen?.orientation?.unlock) {
      window.screen.orientation.unlock();
    }
  } catch {}

  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      await document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      await document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      await document.msExitFullscreen();
    }
  } catch (err) {
    console.debug("[Fullscreen] Exit notice:", err);
  }
}

/**
 * Toggles fullscreen mode safely.
 */
export async function toggleFullscreen(element) {
  if (isFullscreen()) {
    await exitFullscreen();
  } else {
    await enterFullscreen(element);
  }
}
