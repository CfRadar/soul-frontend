import React, { useState, useCallback } from "react";

export function LoginForm({ onLogin, loading, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setLocalError("");

      if (!email.trim()) {
        setLocalError("Please enter your email or username");
        return;
      }
      if (!password) {
        setLocalError("Please enter your password");
        return;
      }

      try {
        await onLogin({ email, password });
      } catch (err) {
        // Parent already handles error state
      }
    },
    [email, password, onLogin]
  );

  const displayError = localError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block font-dialogue text-lg text-neutral-300 mb-1">
          * Email or Username:
        </label>
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="player@example.com"
          disabled={loading}
          autoComplete="username"
          className="w-full bg-black border-2 border-white px-3 py-2 text-sm font-pixel outline-none text-[#ffff00] focus:border-[#ff9900] transition disabled:opacity-50"
        />
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
          placeholder="••••••••"
          disabled={loading}
          autoComplete="current-password"
          className="w-full bg-black border-2 border-white px-3 py-2 text-sm font-pixel outline-none text-[#ffff00] focus:border-[#ff9900] transition disabled:opacity-50"
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
        className="w-full mt-3 border-2 border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black font-pixel text-xs py-3 tracking-wider transition-colors duration-150 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
      >
        {loading ? (
          <>
            <span className="text-[#ff0000] animate-heartbeat">❤️</span>
            <span>CONNECTING SOUL...</span>
          </>
        ) : (
          "[ ENTER SOUL DUEL ]"
        )}
      </button>
    </form>
  );
}

export default LoginForm;
