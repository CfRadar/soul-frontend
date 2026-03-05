import React from "react";

/**
 * Platinum Rank Icon - Layered square outlines (3 stacked frames)
 * Slow rotating outer frame
 */
export default function PlatinumRank({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="platinum-rank"
    >
      {/* Outer rotating frame */}
      <rect
        x="1"
        y="1"
        width="22"
        height="22"
        rx="2"
        stroke="white"
        strokeWidth="1.5"
        fill="none"
        className="rotate-outer"
      />
      {/* Middle frame */}
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="1.5"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="1"
        fill="none"
      />
      {/* Inner frame */}
      <rect
        x="7"
        y="7"
        width="10"
        height="10"
        rx="1"
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth="1"
        fill="none"
      />
      {/* Center diamond */}
      <path
        d="M12 10L15 12L12 14L9 12L12 10Z"
        fill="rgba(255, 255, 255, 0.3)"
      />
      <style>{`
        .platinum-rank .rotate-outer {
          transform-origin: center;
          animation: platinumRotate 12s linear infinite;
        }
        @keyframes platinumRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}

