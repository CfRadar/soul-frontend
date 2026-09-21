import React, { Suspense } from "react";

/**
 * SuspenseLoader provides a consistent, layout-stable fallback UI
 * adhering to the frontend-expert guideline (Zero Layout Shift).
 */
export function SuspenseLoader({ children, fallback, minHeight = "200px" }) {
  const defaultFallback = (
    <div
      className="w-full flex flex-col items-center justify-center p-8 font-mono text-xs opacity-70 animate-pulse"
      style={{ minHeight }}
    >
      <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
      <div>LOADING...</div>
    </div>
  );

  return <Suspense fallback={fallback || defaultFallback}>{children}</Suspense>;
}

export default SuspenseLoader;
