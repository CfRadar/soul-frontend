import React from "react";

/**
 * Legendary Rank Icon - Crown-like triangular geometry
 * Glow ring behind icon + rare sparkle effect
 */
export default function LegendaryRank({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="legendary-rank"
    >
      {/* Glow ring behind */}
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth="1"
        fill="none"
        className="glow-ring"
      />
      
      {/* Crown shape - main body */}
      <path
        d="M4 18L8 8L12 14L16 8L20 18H4Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Crown base line */}
      <path
        d="M4 18H20"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Crown points */}
      <path
        d="M8 8V5M16 8V5M12 14V11"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Inner crown lines */}
      <path
        d="M8 14L12 18L16 14"
        stroke="rgba(255, 255, 255, 0.3)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Sparkle effects */}
      <circle cx="5" cy="6" r="1" fill="white" className="legend-sparkle-1" />
      <circle cx="19" cy="10" r="0.5" fill="white" className="legend-sparkle-2" />
      <circle cx="10" cy="20" r="0.5" fill="white" className="legend-sparkle-3" />
      
      <style>{`
        .legendary-rank .glow-ring {
          animation: legendaryGlow 3s ease-in-out infinite;
        }
        .legendary-rank .legend-sparkle-1 {
          animation: legendSparkle 2s ease-in-out infinite;
        }
        .legendary-rank .legend-sparkle-2 {
          animation: legendSparkle 2s ease-in-out infinite 0.7s;
        }
        .legendary-rank .legend-sparkle-3 {
          animation: legendSparkle 2s ease-in-out infinite 1.4s;
        }
        @keyframes legendaryGlow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
        @keyframes legendSparkle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </svg>
  );
}

