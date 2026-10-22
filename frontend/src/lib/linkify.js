// Only http(s) and "www." links are recognised, so no other URL scheme can ever be rendered
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,:;!?)\]]+$/;

/**
 * Splits text into plain and link tokens. Pure, so it can be tested without React.
 * @returns {Array<{ type: "text" | "link", value: string, href?: string }>}
 */
export function tokenizeLinks(text) {
  const tokens = [];
  let last = 0;
  for (const match of String(text).matchAll(URL_RE)) {
    let raw = match[0];
    const trailing = raw.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    raw = raw.slice(0, raw.length - trailing.length);
    if (!raw) continue;
    const start = match.index;
    if (start > last) tokens.push({ type: "text", value: text.slice(last, start) });
    tokens.push({
      type: "link",
      value: raw,
      href: raw.toLowerCase().startsWith("http") ? raw : `https://${raw}`,
    });
    last = start + raw.length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}
