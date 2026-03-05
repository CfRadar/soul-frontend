import React from "react";

/**
 * Diamond Rank Icon - Crystal-like shape with multiple facets
 * Prism glint animation moving across icon
 */
export default function DiamondRank({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="diamond-rank"
    >
      {/* Main crystal shape */}
      <path
        d="M12 2L2 12L7 22L12 18L17 22L22 12L12 2Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Facet lines - connecting corners */}
      <path
        d="M12 2V12M2 12L12 18M22 12L12 18M12 12V18"
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Left facet */}
      <path
        d="M2 12L12 2L12 12Z"
        fill="rgba(255, 255, 255, 0.1)"
      />
      {/* Right facet */}
      <path
        d="M22 12L12 2L12 12Z"
        fill="rgba(255, 255, 255, 0.1)"
      />
      {/* Bottom left facet */}
      <path
        d="M2 12L7 22L12 18L12 12Z"
        fill="rgba(255, 255, 255, 0.08)"
      />
      {/* Bottom right facet */}
      <path
        d="M22 12L17 22L12 18L12 12Z"
        fill="rgba(255, 255, 255, 0.08)"
      />
      {/* Prism glint */}
      <rect
        x="4"
        y="4"
        width="4"
        height="4"
        fill="white"
        className="prism-glint"
        opacity="0.6"
      />
      <style>{`
        .diamond-rank .prism-glint {
          transform: rotate(45deg);
          animation: prismGlint 3s ease-in-out infinite;
        }
        @keyframes prismGlint {
          0%, 100% { 
            transform: rotate(45deg) translateX(-10px) scale(0.5); 
            opacity: 0;
          }
          20% { 
            opacity: 0.5;
          }
          50% { 
            transform: rotate(45deg) translateX(10px) scale(1); 
            opacity: 0.4;
          }
          80% { 
            opacity: 0.5;
          }
        }
      `}</style>
    </svg>
  );
}

