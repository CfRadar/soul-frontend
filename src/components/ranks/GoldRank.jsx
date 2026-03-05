import React from "react";

/**
 * Gold Rank Icon - Rotated square (diamond) with inner cross lines
 * Subtle sparkle animation
 * Color: Soft golden (#D4AF37)
 */
export default function GoldRank({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="gold-rank w-7 h-7"
    >
      {/* Outer diamond */}
      <path
        d="M12 2L22 12L12 22L2 12L12 2Z"
        stroke="#D4AF37"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Inner cross lines */}
      <path
        d="M12 2V22M2 12L22 12"
        stroke="rgba(212, 175, 55, 0.4)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Inner diamond */}
      <path
        d="M12 7L17 12L12 17L7 12L12 7Z"
        stroke="rgba(212, 175, 55, 0.6)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Center gem */}
      <path
        d="M12 10L14 12L12 14L10 12L12 10Z"
        fill="#D4AF37"
        opacity="0.8"
      />
      {/* Sparkle stars */}
      <g className="sparkles">
        <circle cx="6" cy="6" r="1" fill="#D4AF37" className="sparkle-1" />
        <circle cx="18" cy="6" r="0.5" fill="#D4AF37" className="sparkle-2" />
        <circle cx="6" cy="18" r="0.5" fill="#D4AF37" className="sparkle-3" />
      </g>
      <style>{`
        .gold-rank .sparkle-1 {
          animation: sparkleFade 1.5s ease-in-out infinite;
        }
        .gold-rank .sparkle-2 {
          animation: sparkleFade 1.5s ease-in-out infinite 0.5s;
        }
        .gold-rank .sparkle-3 {
          animation: sparkleFade 1.5s ease-in-out infinite 1s;
        }
        @keyframes sparkleFade {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </svg>
  );
}

