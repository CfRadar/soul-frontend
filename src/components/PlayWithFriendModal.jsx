import React, { useState, useEffect } from "react";
import { socket } from "../socket";
import { friendsApi } from "../api";
import RankBadge from "../ui/RankBadge";

export default function PlayWithFriendModal({ open, onClose, me }) {
  const [tab, setTab] = useState("roomCode"); // "roomCode" | "friends"

  // Room Code state
  const [hostedCode, setHostedCode] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [roomError, setRoomError] = useState("");
  const [roomLoading, setRoomLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Friends state
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [inviteStatus, setInviteStatus] = useState({}); // friendUid -> "sent" | "failed" | null

  // Fetch friends list
  const loadFriends = async () => {
    try {
      setFriendsLoading(true);
      const res = await friendsApi.list();
      if (res?.ok) {
        setFriends(res.friends || []);
      }
    } catch {
      // ignore
    } finally {
      setFriendsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadFriends();
      setRoomError("");
      setAddMsg("");
    } else {
      // If modal was closed while hosting, cancel the hosted room
      if (hostedCode) {
        socket.emit("room:cancel", { code: hostedCode });
        setHostedCode(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Real-time online/offline updates & invite feedback
  useEffect(() => {
    if (!open) return;

    const onStatusChange = ({ uid, online }) => {
      setFriends((prev) =>
        prev.map((f) => (f.uid === uid ? { ...f, online } : f))
      );
    };

    const onInviteStatus = (data) => {
      if (!data) return;
      if (data.toUid) {
        if (data.ok === false) {
          setInviteStatus((prev) => ({ ...prev, [data.toUid]: "failed" }));
          setRoomError(data.error === "friend_offline" ? "Friend is currently offline." : "Invite failed.");
        } else if (data.status === "sent") {
          setInviteStatus((prev) => ({ ...prev, [data.toUid]: "sent" }));
        }
      }
    };

    socket.on("player:statusChange", onStatusChange);
    socket.on("friend:invite:status", onInviteStatus);

    return () => {
      socket.off("player:statusChange", onStatusChange);
      socket.off("friend:invite:status", onInviteStatus);
    };
  }, [open]);

  // Room Code: Create Room
  const handleCreateRoom = () => {
    setRoomLoading(true);
    setRoomError("");
    socket.emit("room:create", (res) => {
      setRoomLoading(false);
      if (res?.ok) {
        setHostedCode(res.code);
        setCopied(false);
      } else {
        setRoomError(res?.error || "Failed to create room.");
      }
    });
  };

  // Room Code: Cancel Hosting
  const handleCancelHosting = () => {
    if (hostedCode) {
      socket.emit("room:cancel", { code: hostedCode });
      setHostedCode(null);
      setCopied(false);
    }
  };

  // Room Code: Join Room
  const handleJoinRoom = (e) => {
    if (e) e.preventDefault();
    const clean = joinCode.trim().toUpperCase();
    if (!clean) {
      setRoomError("Please enter a room code.");
      return;
    }
    setRoomLoading(true);
    setRoomError("");

    socket.emit("room:join", { code: clean }, (res) => {
      setRoomLoading(false);
      if (!res?.ok) {
        setRoomError(res?.error || "Failed to join room.");
      }
      // On success, backend emits matchFound to both players automatically!
    });
  };

  // Copy Code to Clipboard
  const handleCopyCode = () => {
    if (!hostedCode) return;
    navigator.clipboard.writeText(hostedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Send Direct Friend Duel Invite
  const handleInviteFriend = (friendUid) => {
    setInviteStatus((prev) => ({ ...prev, [friendUid]: "sending" }));
    setRoomError("");
    socket.emit("friend:invite", { toUid: friendUid });
  };

  // Add Friend by Username or UID
  const handleAddFriend = async (e) => {
    if (e) e.preventDefault();
    const q = addInput.trim();
    if (!q) return;

    try {
      setAddLoading(true);
      setAddMsg("");
      const res = await friendsApi.requestFriend(q);
      if (res?.ok) {
        setAddInput("");
        if (res.status === "accepted") {
          setAddMsg(`* Accepted! You and ${res.friend?.username || q} are now friends!`);
          loadFriends();
        } else {
          setAddMsg(`* Friend request sent to ${res.target?.username || q}!`);
        }
      } else {
        setAddMsg(`* ${res?.error === "no_user" ? "Soul not found. Check username or UID." : (res?.error || "Request failed.")}`);
      }
    } catch {
      setAddMsg("* Request failed. Try again.");
    } finally {
      setAddLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-black border-2 border-white text-white font-dialogue p-4 sm:p-6 flex flex-col max-h-[90vh] shadow-[0_0_30px_rgba(255,255,255,0.2)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[#ff0000] text-xl animate-heartbeat">❤️</span>
            <div className="font-pixel text-sm sm:text-base text-[#00ffff] tracking-wider uppercase">
              * PLAY WITH FRIEND
            </div>
          </div>
          <button
            onClick={onClose}
            className="font-pixel text-xs border-2 border-white px-3 py-1 hover:bg-white hover:text-black transition cursor-pointer"
          >
            [ CLOSE ]
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex gap-2 my-4 flex-shrink-0 font-pixel text-xs">
          <button
            onClick={() => {
              setTab("roomCode");
              setRoomError("");
            }}
            className={`flex-1 py-2.5 border-2 transition cursor-pointer ${
              tab === "roomCode"
                ? "border-[#00ffff] bg-[#00ffff]/15 text-[#00ffff]"
                : "border-white/40 text-neutral-400 hover:border-white hover:text-white"
            }`}
          >
            [ ROOM CODE ]
          </button>
          <button
            onClick={() => {
              setTab("friends");
              setRoomError("");
              loadFriends();
            }}
            className={`flex-1 py-2.5 border-2 transition cursor-pointer ${
              tab === "friends"
                ? "border-[#00ff00] bg-[#00ff00]/15 text-[#00ff00]"
                : "border-white/40 text-neutral-400 hover:border-white hover:text-white"
            }`}
          >
            [ FRIEND LIST ({friends.length}) ]
          </button>
        </div>

        {/* Tab 1: Room Code */}
        {tab === "roomCode" && (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
            {roomError && (
              <div className="p-2.5 bg-red-950/40 border border-red-500 font-dialogue text-sm text-red-300">
                * {roomError}
              </div>
            )}

            {/* Create Room Box */}
            <div className="border-2 border-white/40 p-4 bg-white/[0.02]">
              <div className="font-pixel text-xs text-[#00ffff] mb-2 uppercase">
                * CREATE A PRIVATE ROOM
              </div>
              <div className="font-dialogue text-sm text-neutral-300 mb-3">
                Generate a unique room code and share it with your friend to duel!
              </div>

              {!hostedCode ? (
                <button
                  onClick={handleCreateRoom}
                  disabled={roomLoading}
                  className="w-full font-pixel text-xs border-2 border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff] hover:text-black py-2.5 transition cursor-pointer disabled:opacity-50"
                >
                  {roomLoading ? "[ GENERATING CODE... ]" : "[ CREATE ROOM ]"}
                </button>
              ) : (
                <div className="bg-black border-2 border-[#00ffff] p-4 text-center space-y-3 shadow-[0_0_20px_rgba(0,255,255,0.25)]">
                  <div className="font-dialogue text-sm text-neutral-400">
                    * SHARE THIS ROOM CODE WITH YOUR FRIEND:
                  </div>
                  <div className="font-pixel text-2xl sm:text-3xl text-white tracking-widest font-bold select-all py-1">
                    {hostedCode}
                  </div>
                  <div className="flex gap-2 justify-center font-pixel text-xs">
                    <button
                      onClick={handleCopyCode}
                      className="border-2 border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff] hover:text-black px-4 py-2 transition cursor-pointer"
                    >
                      {copied ? "[ COPIED! ]" : "[ COPY CODE ]"}
                    </button>
                    <button
                      onClick={handleCancelHosting}
                      className="border-2 border-red-500 text-red-400 hover:bg-red-500 hover:text-white px-3 py-2 transition cursor-pointer"
                    >
                      [ CANCEL ]
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 font-dialogue text-sm text-neutral-400 animate-pulse pt-1">
                    <span>* Waiting for friend to join</span>
                    <span className="inline-block animate-spin">⏳</span>
                  </div>
                </div>
              )}
            </div>

            {/* Join Room Box */}
            <div className="border-2 border-white/40 p-4 bg-white/[0.02]">
              <div className="font-pixel text-xs text-[#ff9900] mb-2 uppercase">
                * JOIN BY ROOM CODE
              </div>
              <div className="font-dialogue text-sm text-neutral-300 mb-3">
                Have a room code from a friend? Enter it below:
              </div>
              <form onSubmit={handleJoinRoom} className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="SD-XXXX"
                  maxLength={10}
                  disabled={roomLoading}
                  className="flex-1 bg-black border-2 border-white px-3 py-2 font-pixel text-sm text-[#ff9900] outline-none focus:border-[#ff9900] transition uppercase"
                />
                <button
                  type="submit"
                  disabled={roomLoading || !joinCode.trim()}
                  className="font-pixel text-xs border-2 border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black px-4 py-2 transition cursor-pointer disabled:opacity-40"
                >
                  {roomLoading ? "[ ... ]" : "[ JOIN ROOM ]"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Tab 2: Direct Friends & Invitations */}
        {tab === "friends" && (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
            {/* Add Friend Row */}
            <form onSubmit={handleAddFriend} className="border-2 border-[#00ff00]/60 p-3 bg-white/[0.02]">
              <div className="font-pixel text-[11px] text-[#00ff00] mb-2 uppercase">
                * ADD FRIEND BY USERNAME OR UID
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  placeholder="Username or SD-XXXXXX"
                  disabled={addLoading}
                  className="flex-1 bg-black border-2 border-white px-3 py-1.5 font-dialogue text-base text-white outline-none focus:border-[#00ff00] transition"
                />
                <button
                  type="submit"
                  disabled={addLoading || !addInput.trim()}
                  className="font-pixel text-xs border-2 border-[#00ff00] text-[#00ff00] hover:bg-[#00ff00] hover:text-black px-3 py-1.5 transition cursor-pointer disabled:opacity-40"
                >
                  {addLoading ? "[ ... ]" : "[ ADD ]"}
                </button>
              </div>
              {addMsg && (
                <div className="mt-2 font-dialogue text-sm text-[#00ffff]">
                  {addMsg}
                </div>
              )}
            </form>

            {roomError && (
              <div className="p-2.5 bg-red-950/40 border border-red-500 font-dialogue text-sm text-red-300">
                * {roomError}
              </div>
            )}

            {/* Friends List */}
            <div className="space-y-2">
              <div className="font-pixel text-xs text-white tracking-wider mb-2 flex items-center justify-between">
                <span>* SELECT FRIEND TO INVITE:</span>
                <button
                  onClick={loadFriends}
                  className="font-pixel text-[10px] text-neutral-400 hover:text-white"
                >
                  [ REFRESH ]
                </button>
              </div>

              {friendsLoading ? (
                <div className="text-center py-6 font-dialogue text-neutral-400">
                  * Loading friends...
                </div>
              ) : friends.length === 0 ? (
                <div className="border-2 border-white/20 p-6 text-center font-dialogue text-neutral-400">
                  * No friends added yet. Add friends using their Username or UID above!
                </div>
              ) : (
                friends.map((f) => {
                  const status = inviteStatus[f.uid];
                  return (
                    <div
                      key={f.uid}
                      className="border-2 border-white/30 hover:border-white p-3 flex items-center justify-between gap-3 transition bg-white/[0.01]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <RankBadge rank={f.rank} rating={f.rating} size="sm" />
                          <span
                            className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-black ${
                              f.online ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-neutral-600"
                            }`}
                            title={f.online ? "Online" : "Offline"}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-pixel text-xs text-white truncate">
                              {f.username}
                            </span>
                            <span
                              className={`font-pixel text-[9px] px-1.5 py-0.2 border ${
                                f.online
                                  ? "border-emerald-500 text-emerald-400"
                                  : "border-neutral-700 text-neutral-500"
                              }`}
                            >
                              {f.online ? "ONLINE" : "OFFLINE"}
                            </span>
                          </div>
                          <div className="font-dialogue text-sm text-neutral-400">
                            {f.uid}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleInviteFriend(f.uid)}
                        disabled={status === "sending" || status === "sent"}
                        className={`font-pixel text-xs border-2 px-3 py-1.5 transition cursor-pointer whitespace-nowrap flex-shrink-0 ${
                          status === "sent"
                            ? "border-emerald-500 text-emerald-400 bg-emerald-950/30"
                            : "border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff] hover:text-black"
                        }`}
                      >
                        {status === "sending"
                          ? "[ SENDING... ]"
                          : status === "sent"
                          ? "[ INVITE SENT! ]"
                          : "[ INVITE ]"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="pt-3 mt-3 border-t border-white/20 flex items-center justify-between text-neutral-400 font-dialogue text-xs sm:text-sm flex-shrink-0">
          <span>* Your Soul UID: <strong className="text-white select-all">{me?.uid}</strong></span>
          <span>* Username: <strong className="text-white">{me?.username}</strong></span>
        </div>
      </div>
    </div>
  );
}
