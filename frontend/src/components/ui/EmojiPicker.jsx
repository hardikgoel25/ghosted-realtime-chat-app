import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QUICK_REACTIONS } from "@ghosted/shared";
import { EMOJI_GROUPS } from "../../lib/emoji";

/** Floating emoji grid anchored at a viewport point. */
export default function EmojiPicker({ anchor, onPick, onClose, quick = QUICK_REACTIONS }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(anchor.clientX, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(anchor.clientY, window.innerHeight - rect.height - 8)),
    });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;

  const pick = (emoji) => {
    onPick(emoji);
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Pick an emoji"
      className="fixed z-50 w-72 bg-base-100 rounded-box shadow-xl border border-base-300 p-2"
      style={{ left: pos?.x ?? anchor.clientX, top: pos?.y ?? anchor.clientY }}
    >
      {quick?.length > 0 && (
        <div className="flex justify-between px-1 pb-2 mb-2 border-b border-base-300">
          {quick.map((e) => (
            <button
              key={e}
              type="button"
              className="text-2xl leading-none p-1 rounded-lg hover:bg-base-200 hover:scale-110 transition-transform"
              onClick={() => pick(e)}
              aria-label={`React with ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
        {EMOJI_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="text-[11px] uppercase tracking-wide text-base-content/50 px-1 mb-1">
              {group.label}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {group.emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="text-xl leading-none p-1 rounded-md hover:bg-base-200"
                  onClick={() => pick(e)}
                  aria-label={e}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
