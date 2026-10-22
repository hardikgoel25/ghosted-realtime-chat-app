import { create } from "zustand";
import { SYSTEM_THEME, THEMES } from "@ghosted/shared";

const KEY = "ghosted-theme";
const VALID = new Set(THEMES.map((t) => t.id));

function readStored() {
  try {
    const value = localStorage.getItem(KEY) ?? localStorage.getItem("chat-theme");
    return value && (value === SYSTEM_THEME || VALID.has(value)) ? value : SYSTEM_THEME;
  } catch {
    return SYSTEM_THEME;
  }
}

export function resolveTheme(theme) {
  if (theme !== SYSTEM_THEME) return theme;
  const dark =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return dark ? "ghosted-dark" : "ghosted-light";
}

export const useThemeStore = create((set, get) => {
  const initial = readStored();
  return {
    theme: initial,
    resolved: resolveTheme(initial),
    setTheme: (theme) => {
      try {
        localStorage.setItem(KEY, theme);
      } catch {
        // ignore
      }
      set({ theme, resolved: resolveTheme(theme) });
    },
    refresh: () => set({ resolved: resolveTheme(get().theme) }),
  };
});
