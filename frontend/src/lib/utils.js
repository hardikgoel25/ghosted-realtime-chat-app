export function formatMessageTime(date) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatLastSeen(date) {
  if (!date) return "Offline";
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Last seen just now";
  if (minutes < 60) return `Last seen ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last seen ${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `Last seen ${days} d ago`;
  return `Last seen ${new Date(date).toLocaleDateString()}`;
}

export function newClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Fallback for insecure contexts (plain http on a LAN address)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function messagePreview(message) {
  if (message.text)
    return message.text.length > 60 ? `${message.text.slice(0, 60)}…` : message.text;
  if (message.image) return "📷 Photo";
  return "";
}
