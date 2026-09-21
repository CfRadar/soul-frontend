import React, { useState } from "react";

export function UsernameModal({ open, onClose, onSave }) {
  const [newUsername, setNewUsername] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSave = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed) {
      setErrorMsg("Please enter a name");
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 16 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setErrorMsg("Invalid: 3-16 chars, letters/numbers/_ only");
      return;
    }

    setErrorMsg("");
    setLoading(true);
    try {
      await onSave(trimmed);
      setNewUsername("");
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Failed to update name");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setNewUsername("");
    setErrorMsg("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-md undertale-box p-6 bg-black text-white">
        <div className="text-center mb-5">
          <div className="font-pixel text-sm text-[#ffff00] mb-2">
            * NAME THE FALLEN HUMAN.
          </div>
          <div className="font-dialogue text-base text-neutral-400">
            Choose a name to be remembered across the underground.
          </div>
        </div>

        <div>
          <input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="w-full bg-black border-2 border-white px-4 py-3 outline-none font-pixel text-xs text-center text-[#00ffff] focus:border-[#ffff00] transition"
            placeholder="HUMAN NAME"
            autoFocus
            disabled={loading}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>

        {errorMsg && (
          <div className="mt-3 font-dialogue text-base text-red-500 text-center">
            * {errorMsg}
          </div>
        )}

        <div className="mt-6 flex gap-3 font-pixel text-xs">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 border-2 border-[#00ff00] text-[#00ff00] py-2.5 hover:bg-[#00ff00] hover:text-black transition cursor-pointer disabled:opacity-50"
          >
            {loading ? "[ SAVING... ]" : "[ CONFIRM ]"}
          </button>
          <button
            onClick={handleClose}
            disabled={loading}
            className="flex-1 border-2 border-white/50 text-neutral-400 py-2.5 hover:border-white hover:text-white transition cursor-pointer disabled:opacity-50"
          >
            [ QUIT ]
          </button>
        </div>
      </div>
    </div>
  );
}

export default UsernameModal;
