import { useRef } from "react";

/** Touch-friendly "right click": fires `onLongPress(event)` after holding for `delayMs`. */
export function useLongPress(onLongPress, { delayMs = 450 } = {}) {
  const timer = useRef(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onTouchStart: (e) => {
      fired.current = false;
      const touch = e.touches?.[0];
      const point = touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress(point);
      }, delayMs);
    },
    onTouchMove: clear,
    onTouchEnd: clear,
    onTouchCancel: clear,
    onContextMenu: (e) => {
      e.preventDefault();
      if (fired.current) return; // the long press already opened the menu
      onLongPress({ clientX: e.clientX, clientY: e.clientY });
    },
    onClickCapture: (e) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}
