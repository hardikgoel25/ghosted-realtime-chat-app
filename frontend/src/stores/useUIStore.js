import { create } from "zustand";

export const useUIStore = create((set) => ({
  newChatOpen: false,
  detailsOpen: false,
  socketConnected: false,
  /** True once the socket has connected at least once this session (drives "Reconnecting…") */
  everConnected: false,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  windowFocused: typeof document === "undefined" ? true : document.visibilityState === "visible",
  /** Conversation currently shown in the main pane, if any */
  activeConversationId: null,

  setNewChatOpen: (open) => set({ newChatOpen: open }),
  setDetailsOpen: (open) => set({ detailsOpen: open }),
  toggleDetails: () => set((s) => ({ detailsOpen: !s.detailsOpen })),
  setSocketConnected: (socketConnected) =>
    set((s) => ({ socketConnected, everConnected: s.everConnected || socketConnected })),
  setOnline: (online) => set({ online }),
  setWindowFocused: (windowFocused) => set({ windowFocused }),
  setActiveConversation: (activeConversationId) => set({ activeConversationId }),
}));
