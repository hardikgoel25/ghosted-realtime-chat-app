export function newClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Fallback for insecure contexts (plain http on a LAN address)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function messagePreview(message, { maxLength = 70 } = {}) {
  if (!message) return "";
  if (message.deletedAt) return "Message deleted";
  const text = (message.text ?? "").replace(/\s+/g, " ").trim();
  const hasImages =
    (message.attachments?.length ?? 0) > 0 || message.hasAttachments || message.type === "image";
  if (text) {
    const prefix = hasImages ? "📷 " : "";
    return prefix + (text.length > maxLength ? `${text.slice(0, maxLength)}…` : text);
  }
  if (hasImages) return "📷 Photo";
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
