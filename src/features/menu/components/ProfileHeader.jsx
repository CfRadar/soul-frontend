import React from "react";
import RankBadge from "../../../ui/RankBadge";

function safeUsername(username) {
  if (!username) return "Human";
  if (username.includes("@")) {
    return username.split("@")[0];
  }
  return username;
}

export function ProfileHeader({ me, onEditUsername }) {
  if (!me) return null;

  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <div className="font-pixel text-xs text-white tracking-wider">* STATUS</div>
        <div className="mt-2 font-pixel text-xs flex items-center gap-1.5">
          <span className="text-[#ff0000]">❤️</span>
          <span className="text-white">{safeUsername(me.username)}</span>
          <button
            onClick={onEditUsername}
            className="ml-2 text-[9px] text-neutral-400 hover:text-white underline cursor-pointer"
          >
            [RENAME]
          </button>
        </div>
        <div className="mt-1 font-dialogue text-lg text-neutral-300">
          * LV 1 | EXP: {me.rating ?? 0}
        </div>
        <div className="font-dialogue text-lg text-neutral-300">
          * Record: {me.wins ?? 0}W / {me.losses ?? 0}L
        </div>
      </div>

      {/* Rank badge top right */}
      <div className="flex-shrink-0">
        <RankBadge rank={me.rank} rating={me.rating} size="md" />
      </div>
    </div>
  );
}

export default ProfileHeader;
