import { ExternalLink } from "lucide-react";

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Compact card for a server-fetched link preview; the whole card opens the link. */
export default function LinkPreviewCard({ preview, mine }) {
  if (!preview?.url || (!preview.title && !preview.description)) return null;
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`block mt-1.5 rounded-lg overflow-hidden border text-left no-underline ${
        mine
          ? "border-primary-content/30 bg-primary-content/10 hover:bg-primary-content/20"
          : "border-base-300 bg-base-100/70 hover:bg-base-100"
      }`}
      aria-label={`Open link: ${preview.title ?? preview.url}`}
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          className="w-full max-h-40 object-cover bg-base-300/40"
        />
      )}
      <span className="block px-2.5 py-2">
        <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide opacity-70">
          <ExternalLink className="size-3" aria-hidden="true" />
          {preview.siteName ?? hostOf(preview.url)}
        </span>
        {preview.title && (
          <span className="block text-sm font-semibold leading-snug line-clamp-2">
            {preview.title}
          </span>
        )}
        {preview.description && (
          <span className="block text-xs opacity-80 leading-snug line-clamp-2 mt-0.5">
            {preview.description}
          </span>
        )}
      </span>
    </a>
  );
}
