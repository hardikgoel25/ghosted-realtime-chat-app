const KEY = "ghosted-drafts";

export function loadDrafts() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveDrafts(drafts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(drafts));
  } catch {
    // Storage may be unavailable (private mode); drafts simply do not persist
  }
}
