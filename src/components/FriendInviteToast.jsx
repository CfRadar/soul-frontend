import React, { useState, useEffect, useRef } from "react";
import { socket } from "../socket";
import RankBadge from "../ui/RankBadge";

function playInviteChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    // Quick two-tone pleasant chime (Undertale save/encounter tone)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.12); // A5

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {}
}

export default function FriendInviteToast({ onAccepted }) {
  const [invite, setInvite] = useState(null);
  const [timeLeft, setTimeLeft] = useState(20);
  const timerRef = useRef(null);

  useEffect(() => {
    const onInviteReceived = (data) => {
      if (!data?.inviteId) return;
      setInvite(data);
      setTimeLeft(20);
      playInviteChime();
    };

    socket.on("friend:invite:received", onInviteReceived);
    return () => socket.off("friend:invite:received", onInviteReceived);
  }, []);

  // 20-second countdown
  useEffect(() => {
    if (!invite) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleDecline(invite.inviteId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [invite]);

  const handleAccept = (inviteId) => {
    socket.emit("friend:invite:accept", { inviteId });
    if (onAccepted) onAccepted(invite);
    setInvite(null);
  };

  const handleDecline = (inviteId) => {
    socket.emit("friend:invite:decline", { inviteId });
    setInvite(null);
  };

  if (!invite) return null;

  const progressPercent = (timeLeft / 20) * 100;

  return (
    <div className="fixed top-4 right-4 z-50 w-80 sm:w-96 max-w-[calc(100vw-2rem)] animate-in slide-in-from-right duration-300">
      <div className="bg-black/95 border-2 border-[#00ffff] p-4 shadow-[0_0_25px_rgba(0,255,255,0.4)] text-white font-dialogue relative overflow-hidden backdrop-blur-md">
        {/* Top Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
          <div
            className="h-full bg-[#ff9900] transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between mt-1 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[#ff0000] text-lg animate-heartbeat">❤️</span>
            <span className="font-pixel text-xs text-[#00ffff] tracking-wider uppercase">
              * DUEL CHALLENGE!
            </span>
          </div>
          <button
            onClick={() => handleDecline(invite.inviteId)}
            className="text-neutral-400 hover:text-white font-pixel text-xs px-1.5 py-0.5 cursor-pointer"
            title="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* Challenger Card */}
        <div className="flex items-center gap-3 my-3 p-2.5 bg-white/5 border border-white/20">
          <RankBadge rank={invite.from?.rank} rating={invite.from?.rating} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="font-pixel text-xs text-white truncate">
              {invite.from?.username || "Unknown Soul"}
            </div>
            <div className="font-dialogue text-sm text-neutral-400">
              UID: {invite.from?.uid || "SD-?????"}
            </div>
          </div>
        </div>

        <div className="font-dialogue text-sm text-neutral-300 text-center mb-3">
          * Challenges you to an honorable Soul Duel! ({timeLeft}s)
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 font-pixel text-xs">
          <button
            onClick={() => handleAccept(invite.inviteId)}
            className="flex-1 border-2 border-[#ff9900] text-[#ff9900] py-2 hover:bg-[#ff9900] hover:text-black transition cursor-pointer font-bold tracking-wider"
          >
            [ ACCEPT ]
          </button>
          <button
            onClick={() => handleDecline(invite.inviteId)}
            className="flex-1 border-2 border-neutral-600 text-neutral-400 py-2 hover:border-white hover:text-white transition cursor-pointer"
          >
            [ DECLINE ]
          </button>
        </div>
      </div>
    </div>
  );
}
