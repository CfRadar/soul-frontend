import React from "react";

/**
 * Bronze Rank Icon - Minimal hexagon outline
 * Subtle bronze tint on stroke
 */
export default function BronzeRank({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hexagon outline */}
      <path
        d="M12 2L21 7V17L12 22L3 17V7L12 2Z"
        stroke="rgba(205, 127, 50, 0.7)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Inner hexagon */}
      <path
        d="M12 5L17 8.5V15.5L12 19L7 15.5V8.5L12 5Z"
        stroke="rgba(205, 127, 50, 0.5)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

