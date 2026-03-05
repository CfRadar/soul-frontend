// client/src/ui/ranks.js
import React from "react";

// Import rank icons
import BronzeRank from "../components/ranks/BronzeRank";
import SilverRank from "../components/ranks/SilverRank";
import GoldRank from "../components/ranks/GoldRank";
import PlatinumRank from "../components/ranks/PlatinumRank";
import DiamondRank from "../components/ranks/DiamondRank";
import LegendaryRank from "../components/ranks/LegendaryRank";
import MasterRank from "../components/ranks/MasterRank";
import GrandmasterRank from "../components/ranks/GrandmasterRank";

export const RANKS = {
  bronze: {
    label: "BRONZE",
    minRating: 0,
    accentColor: "rgba(205, 127, 50, 0.5)",
    icon: <BronzeRank size={28} />,
  },
  silver: {
    label: "SILVER",
    minRating: 75,
    accentColor: "rgba(192, 192, 192, 0.6)",
    icon: <SilverRank size={28} />,
  },
  gold: {
    label: "GOLD",
    minRating: 150,
    accentColor: "rgba(255, 215, 0, 0.5)",
    icon: <GoldRank size={28} />,
  },
  platinum: {
    label: "PLATINUM",
    minRating: 250,
    accentColor: "rgba(229, 228, 226, 0.6)",
    icon: <PlatinumRank size={28} />,
  },
  diamond: {
    label: "DIAMOND",
    minRating: 350,
    accentColor: "rgba(185, 242, 255, 0.5)",
    icon: <DiamondRank size={28} />,
  },
  legendary: {
    label: "LEGENDARY",
    minRating: 450,
    accentColor: "rgba(255, 107, 53, 0.5)",
    icon: <LegendaryRank size={28} />,
  },
  master: {
    label: "MASTER",
    minRating: 550,
    accentColor: "rgba(255, 255, 255, 0.7)",
    icon: <MasterRank size={28} />,
  },
  grandmaster: {
    label: "GRANDMASTER",
    minRating: 550,
    accentColor: "rgba(255, 255, 255, 0.9)",
    icon: <GrandmasterRank size={28} />,
  },
};

export function getRank(rating) {
  const r = Number(rating) || 0;
  if (r >= 450) return "legendary";
  if (r >= 350) return "diamond";
  if (r >= 250) return "platinum";
  if (r >= 150) return "gold";
  if (r >= 75) return "silver";
  return "bronze";
}

export function getRankData(rank) {
  return RANKS[rank] || RANKS.bronze;
}
