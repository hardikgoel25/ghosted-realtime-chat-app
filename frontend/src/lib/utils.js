export function newClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Fallback for insecure contexts (plain http on a LAN address)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function attachmentKinds(message) {
  const kinds = new Set((message.attachments ?? []).map((a) => a.kind ?? "image"));
  if (kinds.size === 0 && message.hasAttachments) {
    kinds.add(message.type === "file" || message.type === "audio" ? message.type : "image");
  }
  return kinds;
}

export function messagePreview(message, { maxLength = 70 } = {}) {
  if (!message) return "";
  if (message.deletedAt) return "Message deleted";
  const text = (message.text ?? "").replace(/\s+/g, " ").trim();
  const kinds = attachmentKinds(message);
  const icon = kinds.has("audio")
    ? "🎤 "
    : kinds.has("file")
      ? "📎 "
      : kinds.has("image")
        ? "📷 "
        : "";
  if (text) return icon + (text.length > maxLength ? `${text.slice(0, maxLength)}…` : text);
  if (kinds.has("audio")) return "🎤 Voice message";
  if (kinds.has("file")) return "📎 File";
  if (kinds.has("image")) return "📷 Photo";
  return "";
}

export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function initialsOf(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
