import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { SOCKET_EVENTS } from "@ghosted/shared";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { playReceiveSound } from "../lib/sounds";
import { showNotification } from "../lib/notifications";
import { messagePreview } from "../lib/utils";
import { useAuthStore } from "../stores/useAuthStore";
import { useConversationStore } from "../stores/useConversationStore";
import { useMessageStore } from "../stores/useMessageStore";
import { useUIStore } from "../stores/useUIStore";
import { otherParticipant } from "../features/conversations/conversationHelpers";

/**
 * Owns the socket for the lifetime of a login: connects, wires every server event to the
 * stores, resyncs after reconnects, and decides how to notify about incoming messages.
 */
export default function SocketBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const auth = () => useAuthStore.getState();
    const conversations = () => useConversationStore.getState();
    const messages = () => useMessageStore.getState();
    const ui = () => useUIStore.getState();

    const socket = connectSocket({ onAuthFailure: () => auth().handleSessionLost() });

    const onConnect = async () => {
      ui().setSocketConnected(true);
      conversations().fetchList("all");
      messages().retryNetworkFailures();
      const activeId = ui().activeConversationId;
      if (activeId) {
        const state = messages().stateFor(activeId);
        const last = state.items.filter((m) => !m.pending && !m.failed).at(-1);
        try {
          socket.emit(SOCKET_EVENTS.CONVERSATION_OPEN, { conversationId: activeId });
          const ack = await socket.emitWithAck(SOCKET_EVENTS.SYNC, {
            conversations: [{ id: activeId, since: last?.createdAt }],
          });
          if (ack?.ok) {
            for (const entry of ack.conversations) messages().mergeSynced(entry.id, entry.messages);
          }
        } catch {
          // Best-effort catch-up; the list refresh above still shows anything missed
        }
      }
    };
    const onDisconnect = () => ui().setSocketConnected(false);

    const onMessageNew = ({ conversationId, message }) => {
      messages().receive(message);
      const me = auth().authUser;
      if (!me || message.senderId === me._id) return;

      const conv = conversations().byId[conversationId];
      const prefs = me.notificationPrefs ?? {};
      const viewing =
        ui().activeConversationId === conversationId &&
        ui().windowFocused &&
        document.visibilityState === "visible";

      if (viewing) {
        if (prefs.sound !== false) playReceiveSound();
        conversations().markRead(conversationId);
        return;
      }
      if (conv?.me?.muted) return;
      if (prefs.sound !== false) playReceiveSound();

      const sender = otherParticipant(conv, me._id)?.user;
      const title = sender?.fullname ?? "New message";
      const body = prefs.preview === false ? "New message" : messagePreview(message);
      if (document.visibilityState === "visible") {
        toast(title, {
          description: body,
          id: `msg-${conversationId}`,
          action: { label: "Open", onClick: () => navigate(`/c/${conversationId}`) },
        });
      } else if (prefs.desktop) {
        showNotification({
          title,
          body,
          tag: conversationId,
          onClick: () => navigate(`/c/${conversationId}`),
        });
      }
    };

    const onMessageUpdated = ({ message }) => messages().update(message);
    const onMessageDeleted = (payload) => messages().applyDeleted(payload);
    const onMessageReaction = ({ conversationId, messageId, reactions }) =>
      messages().setReactions(conversationId, messageId, reactions);
    const onConversationUpdated = ({ conversation }) => conversations().upsert(conversation);
    const onMessageStatus = (payload) => conversations().applyStatus(payload);
    const onTyping = ({ conversationId, userId, isTyping }) =>
      conversations().setTyping(conversationId, userId, isTyping);
    const onPresenceSnapshot = ({ userIds }) => auth().setOnlineUsers(userIds);
    const onPresenceUpdate = ({ userId, online, lastSeenAt }) =>
      auth().setPresence(userId, online, lastSeenAt);
    const onUserUpdated = ({ user }) => {
      const me = auth().authUser;
      if (me && user._id === me._id) auth().mergeSelf(user);
      else conversations().updateUser(user);
    };
    const onUserGone = (reason) => (payload) => {
      const removed = conversations().removeUser(payload.userId);
      if (removed.includes(ui().activeConversationId)) {
        toast(reason);
        navigate("/", { replace: true });
      }
    };
    const onSessionRevoked = ({ reason }) => {
      auth().clearSession();
      toast.error(
        reason === "password_change"
          ? "Your password was changed on another device. Please sign in again."
          : "This session was signed out from another device."
      );
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onMessageNew);
    socket.on(SOCKET_EVENTS.MESSAGE_UPDATED, onMessageUpdated);
    socket.on(SOCKET_EVENTS.MESSAGE_DELETED, onMessageDeleted);
    socket.on(SOCKET_EVENTS.MESSAGE_REACTION, onMessageReaction);
    socket.on(SOCKET_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);
    socket.on(SOCKET_EVENTS.MESSAGE_STATUS, onMessageStatus);
    socket.on(SOCKET_EVENTS.TYPING, onTyping);
    socket.on(SOCKET_EVENTS.PRESENCE_SNAPSHOT, onPresenceSnapshot);
    socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, onPresenceUpdate);
    socket.on(SOCKET_EVENTS.USER_UPDATED, onUserUpdated);
    const onDisabled = onUserGone("This user has disabled their account");
    const onDeleted = onUserGone("This user has deleted their account");
    socket.on(SOCKET_EVENTS.USER_DISABLED, onDisabled);
    socket.on(SOCKET_EVENTS.USER_DELETED, onDeleted);
    socket.on(SOCKET_EVENTS.SESSION_REVOKED, onSessionRevoked);
    if (socket.connected) onConnect();

    const onOnline = () => messages().retryNetworkFailures();
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("online", onOnline);
      disconnectSocket();
    };
  }, [navigate]);

  return null;
}
