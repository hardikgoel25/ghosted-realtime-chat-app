import { create } from "zustand";
import { toast } from "sonner";
import { api } from "../lib/api";
import { playSendSound } from "../lib/sounds";
import { newClientId } from "../lib/utils";
import { useAuthStore } from "./useAuthStore";
import { useConversationStore } from "./useConversationStore";

const PAGE_SIZE = 40;

export const EMPTY = Object.freeze({
  items: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  loaded: false,
  olderLoaded: 0,
  error: null,
});

const byCreatedAt = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

function dedupe(items) {
  const seen = new Set();
  return items.filter((m) => {
    const key = m._id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function revokeLocalUrls(message) {
  for (const a of message.attachments ?? []) {
    if (a.local && a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
  }
}

export const useMessageStore = create((set, get) => {
  const patch = (id, changes) =>
    set((s) => ({
      byConversation: {
        ...s.byConversation,
        [id]: { ...(s.byConversation[id] ?? EMPTY), ...changes },
      },
    }));

  return {
    byConversation: {},

    reset: () => set({ byConversation: {} }),

    stateFor: (id) => get().byConversation[id] ?? EMPTY,

    load: async (id) => {
      const current = get().stateFor(id);
      if (current.loading) return;
      patch(id, { loading: true, error: null });
      try {
        const { items, nextCursor } = await api.get(`/conversations/${id}/messages`, {
          params: { limit: PAGE_SIZE },
          silent: true,
        });
        const unsent = get()
          .stateFor(id)
          .items.filter((m) => m.pending || m.failed);
        patch(id, {
          items: dedupe([...items, ...unsent]).sort(byCreatedAt),
          nextCursor,
          loaded: true,
          loading: false,
          olderLoaded: 0,
        });
      } catch (err) {
        patch(id, { loading: false, error: err.message });
      }
    },

    loadOlder: async (id) => {
      const current = get().stateFor(id);
      if (!current.nextCursor || current.loadingMore) return 0;
      patch(id, { loadingMore: true });
      try {
        const { items, nextCursor } = await api.get(`/conversations/${id}/messages`, {
          params: { cursor: current.nextCursor, limit: PAGE_SIZE },
          silent: true,
        });
        const now = get().stateFor(id);
        patch(id, {
          items: dedupe([...items, ...now.items]),
          nextCursor,
          loadingMore: false,
          olderLoaded: now.olderLoaded + items.length,
        });
        return items.length;
      } catch {
        patch(id, { loadingMore: false });
        return 0;
      }
    },

    send: async (id, { text = "", files = [] }) => {
      const me = useAuthStore.getState().authUser;
      if (!me) return false;
      const clientId = newClientId();
      const local = {
        _id: `local-${clientId}`,
        clientId,
        conversationId: id,
        senderId: me._id,
        type: files.length ? "image" : "text",
        text,
        attachments: files.map((f) => ({ url: URL.createObjectURL(f), local: true, name: f.name })),
        createdAt: new Date().toISOString(),
        pending: true,
        failed: false,
        _files: files,
      };
      patch(id, { items: [...get().stateFor(id).items, local] });
      useConversationStore.getState().bumpLastMessage(id, local);
      return get().transmit(id, local);
    },

    transmit: async (id, local) => {
      let body;
      if (local._files?.length) {
        body = new FormData();
        if (local.text) body.append("text", local.text);
        body.append("clientId", local.clientId);
        for (const f of local._files) body.append("images", f, f.name);
      } else {
        body = { text: local.text, clientId: local.clientId };
      }
      try {
        const { message } = await api.post(`/conversations/${id}/messages`, body, {
          silent: true,
          timeout: 60_000,
        });
        get().replaceLocal(id, local.clientId, message);
        playSendSound();
        return true;
      } catch (err) {
        patch(id, {
          items: get()
            .stateFor(id)
            .items.map((m) =>
              m.clientId === local.clientId
                ? { ...m, pending: false, failed: true, error: err.message }
                : m
            ),
        });
        if (err.code !== "NETWORK") toast.error(err.message);
        return false;
      }
    },

    retry: (id, clientId) => {
      const message = get()
        .stateFor(id)
        .items.find((m) => m.clientId === clientId);
      if (!message) return Promise.resolve(false);
      patch(id, {
        items: get()
          .stateFor(id)
          .items.map((m) => (m.clientId === clientId ? { ...m, pending: true, failed: false } : m)),
      });
      return get().transmit(id, message);
    },

    discard: (id, clientId) => {
      const current = get().stateFor(id);
      const target = current.items.find((m) => m.clientId === clientId);
      if (target) revokeLocalUrls(target);
      patch(id, { items: current.items.filter((m) => m.clientId !== clientId) });
    },

    replaceLocal: (id, clientId, message) => {
      const current = get().stateFor(id);
      const local = current.items.find((m) => m.clientId === clientId && m._id !== message._id);
      if (local) revokeLocalUrls(local);
      patch(id, {
        items: dedupe(current.items.map((m) => (m.clientId === clientId ? message : m))).sort(
          byCreatedAt
        ),
      });
    },

    /** Incoming message from the socket (ours from another device, or someone else's). */
    receive: (message) => {
      const id = message.conversationId;
      const current = get().stateFor(id);
      if (!current.loaded) return; // the list carries the preview; messages load on open
      if (current.items.some((m) => m._id === message._id)) return;
      if (message.clientId && current.items.some((m) => m.clientId === message.clientId)) {
        get().replaceLocal(id, message.clientId, message);
        return;
      }
      patch(id, { items: [...current.items, message] });
    },

    mergeSynced: (id, messages) => {
      const current = get().stateFor(id);
      if (!current.loaded || messages.length === 0) return;
      patch(id, { items: dedupe([...current.items, ...messages]).sort(byCreatedAt) });
    },
  };
});
