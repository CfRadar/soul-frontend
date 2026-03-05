import React from "react";

/**
 * Silver Rank Icon - Double-outline diamond shape
 * Subtle shimmer animation
 */
export default function SilverRank({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="silver-rank"
    >
      {/* Outer diamond */}
      <path
        d="M12 2L22 12L12 22L2 12L12 2Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Inner diamond */}
      <path
        d="M12 6L18 12L12 18L6 12L12 6Z"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Shimmer overlay */}
      <defs>
        <linearGradient id="silverShimmer" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="50%" stopColor="white" stopOpacity="0.3" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M12 2L22 12L12 22L2 12L12 2Z"
        fill="url(#silverShimmer)"
        className="animate-shimmer-overlay"
      />
      <style>{`
        .silver-rank .animate-shimmer-overlay {
          animation: shimmerOverlay 2s ease-in-out infinite;
        }
        @keyframes shimmerOverlay {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
      `}</style>
    </svg>
  );
}

