import React, { useState } from "react";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";

export function AuthCard({ onLogin, onSignup, loading, error, clearError, onlineCount = 0 }) {
  const [activeTab, setActiveTab] = useState("login"); // "login" | "signup"

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (clearError) clearError();
  };

  return (
    <div className="max-w-md w-full mx-auto undertale-box p-6 md:p-8 bg-black text-white relative">
      {/* Soul Heart Icon */}
      <div className="flex justify-center mb-3">
        <span className="text-3xl text-[#ff0000] animate-heartbeat">❤️</span>
      </div>

      {/* Header Dialogue */}
      <div className="text-center mb-6">
        <h2 className="font-pixel text-base md:text-lg text-white tracking-widest uppercase">
          SOUL DUEL
        </h2>
        <p className="font-dialogue text-lg text-neutral-400 mt-1">
          {activeTab === "login"
            ? "* Entering your credentials fills you with DETERMINATION."
            : "* A new human soul prepares to fall underground."}
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="grid grid-cols-2 gap-2 mb-6 font-pixel text-xs">
        <button
          type="button"
          onClick={() => handleTabChange("login")}
          className={`py-2 px-3 border-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === "login"
              ? "border-[#ff9900] text-[#ff9900] bg-white/5"
              : "border-neutral-700 text-neutral-500 hover:border-white hover:text-white"
          }`}
        >
          {activeTab === "login" && <span className="text-[#ff0000]">❤️</span>}
          [ LOG IN ]
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("signup")}
          className={`py-2 px-3 border-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === "signup"
              ? "border-[#00ffff] text-[#00ffff] bg-white/5"
              : "border-neutral-700 text-neutral-500 hover:border-white hover:text-white"
          }`}
        >
          {activeTab === "signup" && <span className="text-[#ff0000]">❤️</span>}
          [ SIGN UP ]
        </button>
      </div>

      {/* Forms */}
      {activeTab === "login" ? (
        <LoginForm onLogin={onLogin} loading={loading} error={error} />
      ) : (
        <SignupForm onSignup={onSignup} loading={loading} error={error} />
      )}

      {/* Online Souls Indicator */}
      <div className="mt-5 pt-3.5 border-t border-neutral-800 flex items-center justify-center gap-2 font-pixel text-[10px] text-neutral-400 select-none">
        <span className="w-2 h-2 rounded-full bg-[#00ff00] shadow-[0_0_6px_#00ff00] animate-pulse" />
        <span className="tracking-wide">
          {onlineCount} {onlineCount === 1 ? "SOUL ACTIVE" : "SOULS ACTIVE"} IN THE UNDERGROUND
        </span>
      </div>
    </div>
  );
}

export default AuthCard;
