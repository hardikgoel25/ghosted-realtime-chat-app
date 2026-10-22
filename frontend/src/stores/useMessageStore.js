import { create } from "zustand";
import { toast } from "sonner";
import { ERROR_CODES, LIMITS } from "@ghosted/shared";
import { api } from "../lib/api";
import { playSendSound } from "../lib/sounds";
import { newClientId } from "../lib/utils";
import { useAuthStore } from "./useAuthStore";
import { useConversationStore } from "./useConversationStore";

const PAGE_SIZE = 40;

export const EMPTY = Object.freeze({
  items: [],
  nextCursor: null, // older
  newerCursor: null, // newer; non-null while viewing a window that is not the latest
  loading: false,
  loadingMore: false,
  loaded: false,
  olderLoaded: 0,
  /** Message the current window was centred on (search result jump); highlighted in the list */
  anchorId: null,
  /** Changes whenever the window is replaced, so the list can remount at the right position */
  windowKey: 0,
  error: null,
});

const byCreatedAt = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

function dedupe(items) {
  const seen = new Set();
  return items.filter((m) => {
    if (seen.has(m._id)) return false;
    seen.add(m._id);
    return true;
  });
}

function revokeLocalUrls(message) {
  for (const a of message.attachments ?? []) {
    if (a.local && a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
  }
}

function snapshotReply(message) {
  if (!message) return null;
  return {
    messageId: message._id,
    senderId: message.senderId,
    type: message.type,
    text: (message.text ?? "").slice(0, LIMITS.REPLY_SNIPPET_MAX),
    hasAttachments: (message.attachments?.length ?? 0) > 0,
  };
}

export const useMessageStore = create((set, get) => {
  const patch = (id, changes) =>
    set((s) => ({
      byConversation: {
        ...s.byConversation,
        [id]: { ...(s.byConversation[id] ?? EMPTY), ...changes },
      },
    }));
  const mapItems = (id, fn) => patch(id, { items: get().stateFor(id).items.map(fn) });

  return {
    byConversation: {},

    reset: () => set({ byConversation: {} }),

    stateFor: (id) => get().byConversation[id] ?? EMPTY,

    /** Latest page (also used to leave a search window and return to the bottom). */
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
          newerCursor: null,
          anchorId: null,
          loaded: true,
          loading: false,
          olderLoaded: 0,
          windowKey: get().stateFor(id).windowKey + 1,
        });
      } catch (err) {
        patch(id, { loading: false, error: err.message });
      }
    },

    /** A window centred on one message (jumping to a search result or a quoted message). */
    loadAround: async (id, messageId) => {
      const current = get().stateFor(id);
      if (
        current.loaded &&
        current.items.some((m) => m._id === messageId) &&
        !current.newerCursor
      ) {
        patch(id, { anchorId: messageId, windowKey: current.windowKey + 1 });
        return true;
      }
      patch(id, { loading: true, error: null });
      try {
        const { items, nextCursor, newerCursor } = await api.get(`/conversations/${id}/messages`, {
          params: { around: messageId, limit: PAGE_SIZE },
          silent: true,
        });
        patch(id, {
          items,
          nextCursor,
          newerCursor,
          anchorId: messageId,
          loaded: true,
          loading: false,
          olderLoaded: 0,
          windowKey: get().stateFor(id).windowKey + 1,
        });
        return true;
      } catch (err) {
        patch(id, { loading: false });
        toast.error(err.message);
        return false;
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

    loadNewer: async (id) => {
      const current = get().stateFor(id);
      if (!current.newerCursor || current.loadingMore) return 0;
      patch(id, { loadingMore: true });
      try {
        const { items, newerCursor } = await api.get(`/conversations/${id}/messages`, {
          params: { after: current.newerCursor, limit: PAGE_SIZE },
          silent: true,
        });
        const now = get().stateFor(id);
        patch(id, {
          items: dedupe([...now.items, ...items]).sort(byCreatedAt),
          newerCursor,
          loadingMore: false,
        });
        return items.length;
      } catch {
        patch(id, { loadingMore: false });
        return 0;
      }
    },

    search: async (id, q) => {
      const { items } = await api.get(`/conversations/${id}/messages/search`, {
        params: { q, limit: 30 },
        silent: true,
      });
      return items;
    },

    /**
     * Optimistic send. `attachments` are composer items: { kind, file, url?, name, size, durationMs? }.
     */
    send: async (id, { text = "", attachments = [], replyTo = null }) => {
      const me = useAuthStore.getState().authUser;
      if (!me) return false;
      const clientId = newClientId();
      const kinds = new Set(attachments.map((a) => a.kind));
      const local = {
        _id: `local-${clientId}`,
        clientId,
        conversationId: id,
        senderId: me._id,
        type: kinds.size === 0 ? "text" : kinds.size === 1 ? [...kinds][0] : "file",
        text,
        attachments: attachments.map((a) => ({
          kind: a.kind,
          url: a.url ?? null,
          name: a.name ?? null,
          size: a.size ?? null,
          durationMs: a.durationMs ?? null,
          mime: a.file?.type ?? null,
          local: true,
        })),
        replyTo: snapshotReply(replyTo),
        reactions: [],
        createdAt: new Date().toISOString(),
        pending: true,
        failed: false,
        _payload: {
          images: attachments.filter((a) => a.kind === "image").map((a) => a.file),
          files: attachments.filter((a) => a.kind === "file").map((a) => a.file),
          audio: attachments.find((a) => a.kind === "audio") ?? null,
          replyTo: replyTo?._id ?? null,
        },
      };
      patch(id, { items: [...get().stateFor(id).items, local] });
      useConversationStore.getState().bumpLastMessage(id, local);
      return get().transmit(id, local);
    },

    transmit: async (id, local) => {
      const p = local._payload ?? {};
      const hasFiles = (p.images?.length ?? 0) + (p.files?.length ?? 0) > 0 || p.audio;
      let body;
      if (hasFiles) {
        body = new FormData();
        if (local.text) body.append("text", local.text);
        body.append("clientId", local.clientId);
        if (p.replyTo) body.append("replyTo", p.replyTo);
        for (const f of p.images ?? []) body.append("images", f, f.name);
        for (const f of p.files ?? []) body.append("files", f, f.name);
        if (p.audio) {
          body.append("audio", p.audio.file, p.audio.name ?? "voice-note.webm");
          if (p.audio.durationMs) body.append("audioDurationMs", String(p.audio.durationMs));
        }
      } else {
        body = { text: local.text, clientId: local.clientId };
        if (p.replyTo) body.replyTo = p.replyTo;
      }
      try {
        const { message } = await api.post(`/conversations/${id}/messages`, body, {
          silent: true,
          timeout: 120_000,
        });
        get().replaceLocal(id, local.clientId, message);
        playSendSound();
        return true;
      } catch (err) {
        mapItems(id, (m) =>
          m.clientId === local.clientId
            ? {
                ...m,
                pending: false,
                failed: true,
                error: err.message,
                networkError: err.code === "NETWORK" || err.code === "TIMEOUT",
              }
            : m
        );
        if (err.code === ERROR_CODES.BLOCKED) {
          useConversationStore.getState().setBlockedByThem(id, true);
        }
        if (err.code !== "NETWORK") toast.error(err.message);
        return false;
      }
    },

    retry: (id, clientId) => {
      const message = get()
        .stateFor(id)
        .items.find((m) => m.clientId === clientId);
      if (!message) return Promise.resolve(false);
      mapItems(id, (m) => (m.clientId === clientId ? { ...m, pending: true, failed: false } : m));
      return get().transmit(id, message);
    },

    /** Re-sends everything that failed for lack of connectivity (called when back online). */
    retryNetworkFailures: () => {
      for (const [id, state] of Object.entries(get().byConversation)) {
        for (const m of state.items) {
          if (m.failed && m.networkError) get().retry(id, m.clientId);
        }
      }
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
      if (!current.loaded || current.newerCursor) return; // not loaded, or viewing history
      if (current.items.some((m) => m._id === message._id)) return;
      if (message.clientId && current.items.some((m) => m.clientId === message.clientId)) {
        get().replaceLocal(id, message.clientId, message);
        return;
      }
      patch(id, { items: [...current.items, message] });
    },

    mergeSynced: (id, messages) => {
      const current = get().stateFor(id);
      if (!current.loaded || messages.length === 0 || current.newerCursor) return;
      patch(id, { items: dedupe([...current.items, ...messages]).sort(byCreatedAt) });
    },

    // ---- edits, deletes, reactions ----

    update: (message) => {
      const id = message.conversationId;
      if (!get().byConversation[id]) return;
      mapItems(id, (m) => (m._id === message._id ? { ...m, ...message } : m));
    },

    applyDeleted: ({ conversationId, messageId, scope, message }) => {
      const current = get().byConversation[conversationId];
      if (!current) return;
      if (scope === "me") {
        patch(conversationId, { items: current.items.filter((m) => m._id !== messageId) });
      } else {
        mapItems(conversationId, (m) =>
          m._id === messageId
            ? { ...m, ...message, deletedAt: message?.deletedAt ?? new Date().toISOString() }
            : m
        );
      }
    },

    setReactions: (conversationId, messageId, reactions) => {
      if (!get().byConversation[conversationId]) return;
      mapItems(conversationId, (m) => (m._id === messageId ? { ...m, reactions } : m));
    },

    edit: async (id, messageId, text) => {
      try {
        const { message } = await api.patch(`/conversations/${id}/messages/${messageId}`, { text });
        get().update(message);
        return true;
      } catch {
        return false;
      }
    },

    remove: async (id, messageId, scope) => {
      try {
        const result = await api.delete(`/conversations/${id}/messages/${messageId}`, {
          params: { scope },
        });
        get().applyDeleted({ conversationId: id, messageId, scope, message: result.message });
        return true;
      } catch {
        return false;
      }
    },

    react: async (id, messageId, emoji, on) => {
      const me = useAuthStore.getState().authUser?._id;
      // Optimistic toggle
      mapItems(id, (m) => {
        if (m._id !== messageId) return m;
        const reactions = (m.reactions ?? []).map((r) => ({ ...r, userIds: [...r.userIds] }));
        const existing = reactions.find((r) => r.emoji === emoji);
        if (on) {
          if (existing) {
            if (!existing.userIds.includes(me)) existing.userIds.push(me);
          } else reactions.push({ emoji, userIds: [me] });
        } else if (existing) {
          existing.userIds = existing.userIds.filter((u) => u !== me);
        }
        return { ...m, reactions: reactions.filter((r) => r.userIds.length > 0) };
      });
      try {
        const path = `/conversations/${id}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`;
        const result = on ? await api.put(path) : await api.delete(path);
        get().setReactions(id, messageId, result.reactions);
        return true;
      } catch {
        return false;
      }
    },
  };
});
