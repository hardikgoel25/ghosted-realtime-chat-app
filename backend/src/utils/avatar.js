const PALETTE = [
  "#7C3AED",
  "#2563EB",
  "#059669",
  "#D97706",
  "#DC2626",
  "#DB2777",
  "#0891B2",
  "#4F46E5",
  "#65A30D",
  "#EA580C",
];

function hash(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/**
 * Deterministic initials avatar as an inline SVG data URI. No third-party service, no PII
 * leaves the server, and it renders anywhere an image URL is accepted.
 */
export function initialsAvatar(fullname = "", seed = fullname) {
  const initials =
    String(fullname)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => Array.from(w)[0].toUpperCase())
      .join("")
      .replace(/[^\p{L}\p{N}]/gu, "") || "?";
  const bg = PALETTE[hash(seed) % PALETTE.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" rx="64" fill="${bg}"/>` +
    `<text x="50%" y="50%" dy=".36em" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" ` +
    `font-size="${initials.length > 1 ? 48 : 56}" font-weight="600" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function isGeneratedAvatar(url) {
  return !url || url.startsWith("data:image/svg+xml");
}
