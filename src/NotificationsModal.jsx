import { useEffect, useCallback } from "react";

export default function NotificationsModal({ open, onClose }) {
  // Handle ESC key to close
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  // Handle click on backdrop to close
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={handleBackdropClick}
    >
      {/* Modal container */}
      <div className="w-full max-w-md border-2 border-white bg-black rounded-xl overflow-hidden">
        {/* Header with title and close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/40">
          <div className="font-mono text-sm tracking-widest">NOTIFICATIONS</div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border border-white/60 rounded hover:bg-white hover:text-black transition"
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 1L13 13M1 13L13 1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-8 min-h-[200px] flex items-center justify-center">
          <div className="text-center font-mono text-sm opacity-60">
            No notifications yet.
          </div>
        </div>

        {/* Footer with close button */}
        <div className="px-6 py-4 border-t border-white/40">
          <button
            onClick={onClose}
            className="w-full py-3 border border-white/60 rounded-xl font-mono text-sm tracking-wider hover:bg-white hover:text-black transition"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

