import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";

export default function Lightbox({ images, index = 0, onClose }) {
  const [current, setCurrent] = useState(index);
  const count = images.length;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setCurrent((i) => Math.min(count - 1, i + 1));
      if (e.key === "ArrowLeft") setCurrent((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <button
        type="button"
        className="btn btn-ghost btn-circle absolute top-3 right-3 text-white"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="size-6" />
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-circle absolute left-3 text-white disabled:opacity-30"
            onClick={(e) => {
              e.stopPropagation();
              setCurrent((i) => Math.max(0, i - 1));
            }}
            disabled={current === 0}
            aria-label="Previous image"
          >
            <ChevronLeft className="size-7" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-circle absolute right-3 text-white disabled:opacity-30"
            onClick={(e) => {
              e.stopPropagation();
              setCurrent((i) => Math.min(count - 1, i + 1));
            }}
            disabled={current === count - 1}
            aria-label="Next image"
          >
            <ChevronRight className="size-7" />
          </button>
        </>
      )}

      <img
        src={images[current]}
        alt=""
        className="max-h-[90vh] max-w-[94vw] object-contain select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-4 text-white/80 text-xs">
        {count > 1 && (
          <span>
            {current + 1} / {count}
          </span>
        )}
        <a
          href={images[current]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-3" /> Open original
        </a>
      </div>
    </div>,
    document.body
  );
}
