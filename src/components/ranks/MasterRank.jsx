import React from "react";

/**
 * Master Rank Icon - Bright gold glowing star
 * Minimalist star with glow effect
 * Only available: TOP 10 players with rating >= 550
 */
export default function MasterRank({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="master-rank w-7 h-7"
      style={{
        filter: "drop-shadow(0 0 6px rgba(212,175,55,0.9)) drop-shadow(0 0 12px rgba(212,175,55,0.55))"
      }}
    >
      {/* Outer star outline */}
      <path
        d="M12 2L14.5 9L22 9L16 14L18 22L12 17L6 22L8 14L2 9L9.5 9L12 2Z"
        stroke="#D4AF37"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Inner star */}
      <path
        d="M12 6L13.5 11L18 11L14.5 14.5L15.5 19L12 16L8.5 19L9.5 14.5L6 11L10.5 11L12 6Z"
        stroke="#D4AF37"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      
      <style>{`
        .master-rank {
          animation: masterGlow 2s ease-in-out infinite;
        }
        @keyframes masterGlow {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
      `}</style>
    </svg>
  );
}

