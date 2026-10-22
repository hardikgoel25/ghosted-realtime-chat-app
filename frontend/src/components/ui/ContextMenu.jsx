import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Right-click / long-press menu rendered at a viewport point.
 * @param {{ anchor: {clientX:number, clientY:number} | null, items: Array<{label, icon?, onSelect, danger?}>, onClose, header? }} props
 */
export default function ContextMenu({ anchor, items, onClose, header = null, width = "w-52" }) {
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
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;

  return createPortal(
    <div
      ref={ref}
      className={`fixed z-50 ${width} bg-base-100 rounded-box shadow-xl border border-base-300 p-1.5`}
      style={{ left: pos?.x ?? anchor.clientX, top: pos?.y ?? anchor.clientY }}
    >
      {header}
      <ul role="menu" className="menu p-0 text-sm w-full">
        {items.filter(Boolean).map((item) => (
          <li key={item.label}>
            <button
              type="button"
              role="menuitem"
              className={item.danger ? "text-error" : ""}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body
  );
}
