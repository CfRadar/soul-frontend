import { useState, useEffect, useCallback } from "react";
import { isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen } from "../utils/fullscreen";

/**
 * Hook to monitor and toggle fullscreen state reactively.
 */
export function useFullscreen() {
  const [active, setActive] = useState(isFullscreen);

  useEffect(() => {
    const handler = () => setActive(isFullscreen());
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    document.addEventListener("mozfullscreenchange", handler);
    document.addEventListener("MSFullscreenChange", handler);

    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
      document.removeEventListener("mozfullscreenchange", handler);
      document.removeEventListener("MSFullscreenChange", handler);
    };
  }, []);

  const toggle = useCallback((el) => toggleFullscreen(el), []);
  const enter = useCallback((el) => enterFullscreen(el), []);
  const exit = useCallback(() => exitFullscreen(), []);

  return { isFullscreen: active, toggle, enter, exit };
}

export default useFullscreen;
