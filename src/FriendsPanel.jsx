// client/src/FriendsPanel.jsx
import { useEffect, useMemo, useState } from "react";
import { socket } from "./socket";
import { friendsApi } from "./api";
import RankBadge from "./ui/RankBadge";

export default function FriendsPanel({ me, onBack }) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]); // REST incoming requests (optional)
  const [outgoing, setOutgoing] = useState([]); // REST outgoing requests (optional)

  const [uidInput, setUidInput] = useState("");
  const [msg, setMsg] = useState("");

  // ✅ Socket invite popup
  const [invitePopup, setInvitePopup] = useState(null);
  // { inviteId, from:{uid,username,rank,rating}, startAt }

  const token = useMemo(() => localStorage.getItem("sd_token") || "", []);

  async function refreshAll() {
    try {
      // helpers automatically use stored token, no need to pass it
      const list = await friendsApi.list();
      if (list?.ok) setFriends(list.friends || []);

      const req = await friendsApi.requests();
      if (req?.ok) {
        setIncoming(req.incoming || []);
        setOutgoing(req.outgoing || []);
      }
    } catch (e) {
      setMsg("Failed to fetch friends.");
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Invite socket listeners
  useEffect(() => {
    const onInviteReceived = (data) => {
      setInvitePopup(data);
      setMsg("");
    };

    const onInviteStatus = (data) => {
      if (!data) return;
      if (data.ok === false) {
        setMsg(`Invite failed: ${data.error || "unknown"}`);
        return;
      }
      if (data.status === "sent") setMsg("Invite sent!");
      if (data.status === "accepted") setMsg("Invite accepted! Match will start.");
      if (data.status === "declined") setMsg("Invite declined.");
    };

    socket.on("friend:invite:received", onInviteReceived);
    socket.on("friend:invite:status", onInviteStatus);

    return () => {
      socket.off("friend:invite:received", onInviteReceived);
      socket.off("friend:invite:status", onInviteStatus);
    };
  }, []);

  async function sendFriendRequest() {
    setMsg("");
    try {
      const uid = uidInput.trim().toUpperCase();
      if (!uid) return setMsg("Enter UID.");

      // requestByUid only takes the uid; the helper reads the token from
      // localStorage internally via the `auth: true` flag. passing our
      // `token` variable here was harmless but misleading.
      const r = await friendsApi.requestByUid(uid);
      if (!r?.ok) return setMsg(r?.error || "Request failed");

      setUidInput("");
      setMsg(
        r.status === "accepted"
          ? "Auto-accepted (they already requested you)."
          : "Friend request sent!"
      );
      refreshAll();
    } catch {
      setMsg("Request failed.");
    }
  }

  async function acceptRequest(uid) {
    setMsg("");
    try {
      // accept() helper only takes uid; it pulls the token automatically.
      const r = await friendsApi.accept(uid);
      if (!r?.ok) return setMsg(r?.error || "Accept failed");
      setMsg("Friend added!");
      refreshAll();
    } catch {
      setMsg("Accept failed.");
    }
  }

  async function declineRequest(uid) {
    setMsg("");
    try {
      // decline() helper only takes uid; token read internally too.
      const r = await friendsApi.decline(uid);
      if (!r?.ok) return setMsg(r?.error || "Decline failed");
      setMsg("Declined.");
      refreshAll();
    } catch {
      setMsg("Decline failed.");
    }
  }

  // ✅ INVITE (socket)
  function inviteFriend(friendUid) {
    setMsg("");
    socket.emit("friend:invite", { toUid: friendUid });
  }

  function acceptInvite(inviteId) {
    socket.emit("friend:invite:accept", { inviteId });
    setInvitePopup(null);
  }

  function declineInvite(inviteId) {
    socket.emit("friend:invite:decline", { inviteId });
    setInvitePopup(null);
  }

  return (
    <div className="w-full h-full undertale-box p-4 md:p-6 flex flex-col min-h-0 bg-black text-white">
      {/* Header */}
      <div className="pb-3 border-b-2 border-white flex items-center justify-between flex-shrink-0">
        <div>
          <div className="font-pixel text-sm md:text-base text-[#00ff00]">
            * FRIENDS & SOULS
          </div>
          <div className="font-dialogue text-base text-neutral-300 mt-1">
            * YOUR SOUL ID: <span className="text-white select-all">{me?.uid}</span>
          </div>
        </div>
        <button
          onClick={onBack}
          className="font-pixel text-xs border-2 border-white px-3 py-2 hover:bg-white hover:text-black transition cursor-pointer"
        >
          [ BACK ]
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 mt-4 space-y-5">
        {/* Add Friend */}
        <div className="undertale-box-green p-3 md:p-4">
          <div className="font-pixel text-xs text-[#00ff00] mb-3">
            * ADD SOUL BY UID
          </div>
          <div className="flex gap-2">
            <input
              value={uidInput}
              onChange={(e) => setUidInput(e.target.value)}
              placeholder="SD-XXXXXX"
              className="flex-1 bg-black border-2 border-white px-3 py-2 font-pixel text-xs text-[#00ff00] outline-none focus:border-[#00ff00] transition"
              onKeyDown={(e) => e.key === "Enter" && sendFriendRequest()}
            />
            <button
              onClick={sendFriendRequest}
              className="font-pixel text-xs border-2 border-[#00ff00] text-[#00ff00] hover:bg-[#00ff00] hover:text-black px-3 py-2 transition cursor-pointer"
            >
              [ SEND ]
            </button>
          </div>
          {msg && (
            <div className="mt-2 font-dialogue text-base text-[#00ffff]">
              * {msg}
            </div>
          )}
        </div>

        {/* Requests Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Incoming */}
          <div className="undertale-box-thin p-3">
            <div className="font-pixel text-[10px] text-neutral-300 mb-3 tracking-wider">
              INCOMING ({incoming.length})
            </div>
            <div className="space-y-2">
              {incoming.length === 0 ? (
                <div className="font-dialogue text-base text-neutral-500">
                  * No pending requests.
                </div>
              ) : (
                incoming.map((p) => (
                  <div
                    key={p.uid}
                    className="border-2 border-white/30 px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-pixel text-[10px] text-white truncate">{p.username}</div>
                      <div className="font-dialogue text-sm text-neutral-400">{p.uid}</div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => acceptRequest(p.uid)}
                        className="font-pixel text-[9px] border-2 border-[#00ff00] text-[#00ff00] hover:bg-[#00ff00] hover:text-black px-2 py-1 transition cursor-pointer"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => declineRequest(p.uid)}
                        className="font-pixel text-[9px] border-2 border-neutral-600 text-neutral-400 hover:border-white hover:text-white px-2 py-1 transition cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Outgoing */}
          <div className="undertale-box-thin p-3">
            <div className="font-pixel text-[10px] text-neutral-300 mb-3 tracking-wider">
              OUTGOING ({outgoing.length})
            </div>
            <div className="space-y-2">
              {outgoing.length === 0 ? (
                <div className="font-dialogue text-base text-neutral-500">
                  * No outgoing requests.
                </div>
              ) : (
                outgoing.map((p) => (
                  <div
                    key={p.uid}
                    className="border-2 border-white/30 px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-pixel text-[10px] text-white truncate">{p.username}</div>
                      <div className="font-dialogue text-sm text-neutral-400">{p.uid}</div>
                    </div>
                    <div className="font-pixel text-[9px] text-neutral-500 tracking-wider">PENDING</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Friends List */}
        <div>
          <div className="font-pixel text-xs text-white mb-3 tracking-wider">
            * YOUR FRIENDS ({friends.length})
          </div>
          <div className="space-y-2">
            {friends.length === 0 ? (
              <div className="undertale-box-thin p-4 text-center font-dialogue text-base text-neutral-500">
                * But nobody came. Add a friend by UID above.
              </div>
            ) : (
              friends.map((f) => (
                <div
                  key={f.uid}
                  className="border-2 border-white/40 hover:border-[#00ff00] p-3 flex items-center justify-between gap-3 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <RankBadge rank={f.rank} rating={f.rating} size="sm" />
                    <div className="min-w-0">
                      <div className="font-pixel text-[10px] text-white truncate">{f.username}</div>
                      <div className="font-dialogue text-sm text-neutral-400">{f.uid}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => inviteFriend(f.uid)}
                    className="font-pixel text-[9px] border-2 border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff] hover:text-black px-3 py-1.5 transition cursor-pointer whitespace-nowrap flex-shrink-0"
                  >
                    [ INVITE ]
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Invite Popup Modal */}
      {invitePopup && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm undertale-box p-6 bg-black text-white">
            <div className="text-center mb-4">
              <span className="text-[#ff0000] text-2xl animate-heartbeat">❤️</span>
              <div className="font-pixel text-sm text-[#00ffff] mt-2">
                * SOUL DUEL INVITATION
              </div>
            </div>
            <div className="font-dialogue text-lg text-neutral-300 text-center mb-2">
              * <span className="text-white">{invitePopup.from?.username || "Unknown"}</span> challenges you to a duel!
            </div>
            <div className="flex justify-center mb-5">
              <RankBadge rank={invitePopup.from?.rank} rating={invitePopup.from?.rating} size="sm" />
            </div>
            <div className="flex gap-3 font-pixel text-xs">
              <button
                onClick={() => acceptInvite(invitePopup.inviteId)}
                className="flex-1 border-2 border-[#ff9900] text-[#ff9900] py-2.5 hover:bg-[#ff9900] hover:text-black transition cursor-pointer"
              >
                [ ACCEPT ]
              </button>
              <button
                onClick={() => declineInvite(invitePopup.inviteId)}
                className="flex-1 border-2 border-neutral-600 text-neutral-400 py-2.5 hover:border-white hover:text-white transition cursor-pointer"
              >
                [ DECLINE ]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Minimal UI helpers preserved ---------------- */

function Panel({ title, children }) {
  return (
    <div className="border-2 border-white/40 p-3">
      <div className="font-pixel text-[10px] opacity-70 tracking-widest">{title}</div>
      <div className="mt-2 grid gap-2">{children}</div>
    </div>
  );
}

function Row({ children }) {
  return (
    <div className="border border-white/30 px-3 py-2 flex items-center justify-between gap-3">
      {children}
    </div>
  );
}

function Btn({ children, onClick, soft = false }) {
  return (
    <button
      onClick={onClick}
      className={
        "font-pixel text-[9px] px-3 py-1.5 border-2 transition cursor-pointer " +
        (soft
          ? "border-neutral-600 text-neutral-400 hover:border-white hover:text-white"
          : "border-white text-white hover:bg-white hover:text-black")
      }
    >
      {children}
    </button>
  );
}

function Empty({ children }) {
  return <div className="font-dialogue text-base text-neutral-500">* {children}</div>;
}

