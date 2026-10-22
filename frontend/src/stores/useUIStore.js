import { create } from "zustand";

export const useUIStore = create((set) => ({
  newChatOpen: false,
  detailsOpen: false,
  paletteOpen: false,
  chatSearchOpen: false,
  socketConnected: false,
  /** True once the socket has connected at least once this session (drives "Reconnecting…") */
  everConnected: false,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  windowFocused: typeof document === "undefined" ? true : document.visibilityState === "visible",
  /** Conversation currently shown in the main pane, if any */
  activeConversationId: null,
  /** Message being replied to / edited in the composer (per active conversation) */
  replyTo: null,
  editing: null,

  setNewChatOpen: (open) => set({ newChatOpen: open }),
  setDetailsOpen: (open) => set({ detailsOpen: open }),
  toggleDetails: () => set((s) => ({ detailsOpen: !s.detailsOpen })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setChatSearchOpen: (open) => set({ chatSearchOpen: open }),
  setSocketConnected: (socketConnected) =>
    set((s) => ({ socketConnected, everConnected: s.everConnected || socketConnected })),
  setOnline: (online) => set({ online }),
  setWindowFocused: (windowFocused) => set({ windowFocused }),
  setActiveConversation: (activeConversationId) =>
    set({ activeConversationId, replyTo: null, editing: null, chatSearchOpen: false }),
  setReplyTo: (replyTo) => set({ replyTo, editing: null }),
  setEditing: (editing) => set({ editing, replyTo: null }),
  clearComposerContext: () => set({ replyTo: null, editing: null }),
}));
