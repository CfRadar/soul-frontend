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
    <div className="min-h-screen bg-black text-white p-6 font-mono">
      {/* top bar */}
      <div className="max-w-4xl mx-auto border border-white/80 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-xl tracking-widest">FRIENDS</div>
            <div className="text-xs opacity-70 mt-1">
              UID: <span className="opacity-100">{me?.uid}</span>
            </div>
          </div>

          <button
            onClick={onBack}
            className="border border-white/70 px-4 py-2 rounded-xl hover:bg-white hover:text-black transition text-sm"
          >
            BACK
          </button>
        </div>

        <div className="h-px bg-white/40" />

        {/* send request */}
        <div className="px-5 py-5">
          <div className="text-sm opacity-80">ADD FRIEND BY UID</div>

          <div className="mt-3 flex gap-3">
            <input
              value={uidInput}
              onChange={(e) => setUidInput(e.target.value)}
              placeholder="SD-XXXXXX"
              className="flex-1 bg-black border border-white/60 rounded-xl px-4 py-3 outline-none"
            />
            <button
              onClick={sendFriendRequest}
              className="border border-white/70 rounded-xl px-4 py-3 hover:bg-white hover:text-black transition"
            >
              SEND
            </button>
          </div>

          {msg && <div className="mt-3 text-xs opacity-80">{msg}</div>}
        </div>

        <div className="h-px bg-white/30" />

        {/* requests */}
        <div className="px-5 py-5 grid md:grid-cols-2 gap-4">
          <Panel title={`INCOMING (${incoming.length})`}>
            {incoming.length === 0 ? (
              <Empty>no requests</Empty>
            ) : (
              incoming.map((p) => (
                <Row key={p.uid}>
                  <div>
                    <div className="text-sm">{p.username}</div>
                    <div className="text-xs opacity-70">{p.uid}</div>
                  </div>
                  <div className="flex gap-2">
                    <Btn onClick={() => acceptRequest(p.uid)}>ACCEPT</Btn>
                    <Btn soft onClick={() => declineRequest(p.uid)}>
                      DECLINE
                    </Btn>
                  </div>
                </Row>
              ))
            )}
          </Panel>

          <Panel title={`OUTGOING (${outgoing.length})`}>
            {outgoing.length === 0 ? (
              <Empty>no outgoing</Empty>
            ) : (
              outgoing.map((p) => (
                <Row key={p.uid}>
                  <div>
                    <div className="text-sm">{p.username}</div>
                    <div className="text-xs opacity-70">{p.uid}</div>
                  </div>
                  <div className="text-xs opacity-60">pending</div>
                </Row>
              ))
            )}
          </Panel>
        </div>

        <div className="h-px bg-white/30" />

        {/* friends list */}
        <div className="px-5 py-5">
          <div className="text-sm opacity-80">YOUR FRIENDS ({friends.length})</div>

          <div className="mt-4 grid gap-3">
            {friends.length === 0 ? (
              <Empty>no friends yet</Empty>
            ) : (
              friends.map((f) => (
                <div
                  key={f.uid}
                  className="border border-white/50 rounded-2xl p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-sm">{f.username}</div>
                      <div className="text-xs opacity-70">{f.uid}</div>
                    </div>
                    <RankBadge rank={f.rank} rating={f.rating} size="sm" />
                  </div>

                  <button
                    onClick={() => inviteFriend(f.uid)}
                    className="border border-white/70 px-4 py-2 rounded-xl hover:bg-white hover:text-black transition text-sm"
                  >
                    INVITE
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ✅ INVITE POPUP */}
      {invitePopup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg border border-white/80 rounded-2xl bg-black p-6">
            <div className="text-lg tracking-widest">FRIEND INVITE</div>
            <div className="mt-3 text-sm opacity-90">
              <span className="opacity-70">From:</span>{" "}
              {invitePopup.from?.username || "Unknown"}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <RankBadge rank={invitePopup.from?.rank} rating={invitePopup.from?.rating} size="sm" />
            </div>

            <div className="mt-5 h-px bg-white/30" />

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => acceptInvite(invitePopup.inviteId)}
                className="flex-1 border border-white/80 rounded-xl px-4 py-3 hover:bg-white hover:text-black transition"
              >
                ACCEPT
              </button>
              <button
                onClick={() => declineInvite(invitePopup.inviteId)}
                className="flex-1 border border-white/40 rounded-xl px-4 py-3 hover:bg-white hover:text-black transition"
              >
                DECLINE
              </button>
            </div>

            <div className="mt-4 text-[11px] opacity-70">
              Match will start automatically after accept.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- UI bits (B/W lines vibe) ---------------- */

function Panel({ title, children }) {
  return (
    <div className="border border-white/40 rounded-2xl p-4">
      <div className="text-xs opacity-70 tracking-widest">{title}</div>
      <div className="mt-3 grid gap-2">{children}</div>
    </div>
  );
}

function Row({ children }) {
  return (
    <div className="border border-white/30 rounded-xl px-3 py-3 flex items-center justify-between gap-3">
      {children}
    </div>
  );
}

function Btn({ children, onClick, soft = false }) {
  return (
    <button
      onClick={onClick}
      className={
        "text-xs px-3 py-2 rounded-lg border transition " +
        (soft
          ? "border-white/40 hover:bg-white hover:text-black"
          : "border-white/70 hover:bg-white hover:text-black")
      }
    >
      {children}
    </button>
  );
}

function Empty({ children }) {
  return <div className="text-xs opacity-60">{children}</div>;
}