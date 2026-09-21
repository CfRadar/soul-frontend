import React, { useState, useCallback } from "react";

export function SignupForm({ onSignup, loading, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleGenerateRandomUsername = useCallback(() => {
    const prefixes = ["Frisk", "Chara", "Sans", "Papyrus", "Undyne", "Asriel", "Toriel", "Mettaton"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(100 + Math.random() * 900);
    setUsername(`${prefix}_${num}`);
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setLocalError("");

      if (!email.trim() || !email.includes("@")) {
        setLocalError("Please enter a valid email address");
        return;
      }
      if (!password || password.length < 6) {
        setLocalError("Password must be at least 6 characters");
        return;
      }
      if (username.trim() && (username.length < 3 || username.length > 16)) {
        setLocalError("Username must be between 3 and 16 characters");
        return;
      }
      if (username.trim() && !/^[a-zA-Z0-9_]+$/.test(username.trim())) {
        setLocalError("Username can only contain letters, numbers, and underscores");
        return;
      }

      try {
        await onSignup({
          email: email.trim(),
          password,
          username: username.trim() || undefined,
        });
      } catch (err) {
        // Handled by parent error state
      }
    },
    [email, password, username, onSignup]
  );

  const displayError = localError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block font-dialogue text-lg text-neutral-300 mb-1">
          * Email:
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@underground.com"
          disabled={loading}
          autoComplete="email"
          className="w-full bg-black border-2 border-white px-3 py-2 text-sm font-pixel outline-none text-[#00ffff] focus:border-[#ffff00] transition disabled:opacity-50"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block font-dialogue text-lg text-neutral-300">
            * Soul Name (Optional):
          </label>
          <button
            type="button"
            onClick={handleGenerateRandomUsername}
            className="font-pixel text-[9px] text-[#00ffff] hover:text-white underline cursor-pointer"
          >
            [ RANDOM ]
          </button>
        </div>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. Frisk_101"
          disabled={loading}
          autoComplete="nickname"
          className="w-full bg-black border-2 border-white px-3 py-2 text-sm font-pixel outline-none text-[#00ffff] focus:border-[#ffff00] transition disabled:opacity-50"
        />
        <p className="font-dialogue text-sm text-neutral-400 mt-1">
          * 3-16 chars (letters, numbers, _). Leave empty for auto-generation.
        </p>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block font-dialogue text-lg text-neutral-300">
            * Password:
          </label>
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="font-pixel text-[9px] text-neutral-400 hover:text-white underline cursor-pointer"
          >
            {showPassword ? "[ HIDE ]" : "[ SHOW ]"}
          </button>
        </div>
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 chars"
          disabled={loading}
          autoComplete="new-password"
          className="w-full bg-black border-2 border-white px-3 py-2 text-sm font-pixel outline-none text-[#00ffff] focus:border-[#ffff00] transition disabled:opacity-50"
        />
      </div>

      {displayError && (
        <div className="p-2 border-2 border-red-500 bg-black font-dialogue text-base text-red-400">
          * {displayError}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full mt-3 border-2 border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff] hover:text-black font-pixel text-xs py-3 tracking-wider transition-colors duration-150 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
      >
        {loading ? (
          <>
            <span className="text-[#ff0000] animate-heartbeat">❤️</span>
            <span>AWAKENING SOUL...</span>
          </>
        ) : (
          "[ FORGE SOUL ]"
        )}
      </button>
    </form>
  );
}

export default SignupForm;
