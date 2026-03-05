// client/src/ui/RankBadge.jsx
import React from "react";
import { getRankData } from "./ranks";

// Import rank icons
import BronzeRank from "../components/ranks/BronzeRank";
import SilverRank from "../components/ranks/SilverRank";
import GoldRank from "../components/ranks/GoldRank";
import PlatinumRank from "../components/ranks/PlatinumRank";
import DiamondRank from "../components/ranks/DiamondRank";
import LegendaryRank from "../components/ranks/LegendaryRank";
import MasterRank from "../components/ranks/MasterRank";
import GrandmasterRank from "../components/ranks/GrandmasterRank";

// Rank icon mapping
const rankIcons = {
  bronze: BronzeRank,
  silver: SilverRank,
  gold: GoldRank,
  platinum: PlatinumRank,
  diamond: DiamondRank,
  legendary: LegendaryRank,
  master: MasterRank,
  grandmaster: GrandmasterRank,
};

export default function RankBadge({ rank, rating, size = "md", animated = false }) {
  const rankData = getRankData(rank);
  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-lg",
  };
  
  // Get the appropriate icon component
  const RankIcon = rankIcons[rank] || BronzeRank;

  // Get rank-specific effect
  const getRankEffect = () => {
    switch (rank) {
      case "bronze":
        return <BronzeEffect />;
      case "silver":
        return <SilverEffect />;
      case "gold":
        return <GoldEffect />;
      case "platinum":
        return <PlatinumEffect />;
      case "diamond":
        return <DiamondEffect />;
      case "legendary":
        return <LegendaryEffect />;
      case "master":
        return <MasterEffect />;
      case "grandmaster":
        return <GrandmasterEffect />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 border border-white/30 rounded-lg bg-black/50 relative overflow-hidden ${
        animated ? "animate-float" : ""
      }`}
    >
      {/* Rank-specific effect layer */}
      {getRankEffect()}
      
      <div className="flex-shrink-0 relative z-10 w-7 h-7">
        <RankIcon size={size === "sm" ? 20 : size === "lg" ? 32 : 28} />
      </div>
      <div className={`font-mono relative z-10 ${sizeClasses[size] || sizeClasses.md}`}>
        <div className="text-white/90">{rankData.label}</div>
        <div className="text-white/70">{rating}</div>
      </div>
    </div>
  );
}

// Bronze: subtle dot
function BronzeEffect() {
  return (
    <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-amber-700/40" />
  );
}

// Silver: subtle shimmer pulse
function SilverEffect() {
  return (
    <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
  );
}

// Gold: small sparkle twinkle
function GoldEffect() {
  return (
    <>
      <div className="absolute top-1 left-2 w-1 h-1 rounded-full bg-white/40 animate-ping opacity-40" />
      <div className="absolute bottom-1 right-2 w-0.5 h-0.5 rounded-full bg-white animate-pulse opacity-60" style={{ animationDelay: '0.5s' }} />
      <div className="absolute top-2 right-4 w-0.5 h-0.5 rounded-full bg-white animate-pulse opacity-50" style={{ animationDelay: '1s' }} />
    </>
  );
}

// Platinum: thin rotating ring
function PlatinumEffect() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border border-white/20 rounded-full animate-spin-slow opacity-40" style={{ animationDuration: '8s' }} />
    </div>
  );
}

// Diamond: faint prism glint
function DiamondEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-white/10 to-transparent rotate-45 animate-prism opacity-30" style={{ animationDuration: '4s' }} />
    </div>
  );
}

// Legendary: glow + rare spark flicker
function LegendaryEffect() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/10 to-white/5 animate-pulse" />
      <div className="absolute top-0 left-1/2 w-0.5 h-full bg-gradient-to-b from-transparent via-white/20 to-transparent animate-shimmer" />
      <div className="absolute top-1 right-3 w-1 h-1 rounded-full bg-white/80 animate-spark opacity-0" style={{ animationDelay: '2s' }} />
    </>
  );
}

// Master: orbiting particles effect
function MasterEffect() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/8 to-white/5 animate-pulse" />
      <div className="absolute top-0 left-1/2 w-0.5 h-0.5 rounded-full bg-white animate-ping opacity-30" />
      <div className="absolute bottom-0 right-2 w-0.5 h-0.5 rounded-full bg-white animate-pulse opacity-40" style={{ animationDelay: '0.5s' }} />
    </>
  );
}

// Grandmaster: radiant pulse + sparkles
function GrandmasterEffect() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-white/15 to-white/10 animate-pulse" />
      <div className="absolute top-0 left-1/2 w-0.5 h-full bg-gradient-to-b from-transparent via-white/30 to-transparent animate-shimmer" />
      <div className="absolute top-1 right-2 w-1 h-1 rounded-full bg-white animate-spark opacity-0" style={{ animationDelay: '1s' }} />
      <div className="absolute bottom-2 left-2 w-0.5 h-0.5 rounded-full bg-white animate-spark opacity-0" style={{ animationDelay: '2s' }} />
    </>
  );
}
