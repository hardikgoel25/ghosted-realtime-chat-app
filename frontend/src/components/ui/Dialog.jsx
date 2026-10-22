import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const WIDTHS = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };

/** Accessible modal on the native <dialog>: focus trap, Escape and backdrop close for free. */
export default function Dialog({ open, onClose, title, children, footer, size = "md" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className={`modal-box surface p-0 w-full ${WIDTHS[size]}`}>
        {title && (
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-circle"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="px-5 pb-5">{children}</div>
        {footer && <div className="px-5 pb-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  );
}
