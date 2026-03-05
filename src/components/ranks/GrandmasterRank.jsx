import React from "react";

/**
 * Grandmaster Rank Icon - Bright red glowing star
 * More powerful glow than Master
 * Only available: TOP 1 player (leaderboard #1)
 */
export default function GrandmasterRank({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="grandmaster-rank w-7 h-7"
      style={{
        filter: "drop-shadow(0 0 7px rgba(255,60,60,0.95)) drop-shadow(0 0 16px rgba(255,60,60,0.65))"
      }}
    >
      {/* Outer star outline - larger than Master */}
      <path
        d="M12 1L15 8.5L23 9L17 14L19 22L12 17.5L5 22L7 14L1 9L9 8.5L12 1Z"
        stroke="#FF3C3C"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Inner star */}
      <path
        d="M12 5L13.8 10.5L19.5 11L15 14.5L16.2 20L12 16.5L7.8 20L9 14.5L4.5 11L10.2 10.5L12 5Z"
        stroke="#FF3C3C"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Center glow */}
      <circle
        cx="12"
        cy="12"
        r="2"
        fill="#FF3C3C"
        opacity="0.6"
      />
      
      <style>{`
        .grandmaster-rank {
          animation: gmGlow 1.5s ease-in-out infinite;
        }
        @keyframes gmGlow {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </svg>
  );
}

