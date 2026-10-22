import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { MessageSquareOff } from "lucide-react";
import { SOCKET_EVENTS } from "@ghosted/shared";
import { emit } from "../../lib/socket";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { EMPTY, useMessageStore } from "../../stores/useMessageStore";
import { useUIStore } from "../../stores/useUIStore";
import EmptyState from "../../components/ui/EmptyState";
import Spinner from "../../components/ui/Spinner";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import TypingIndicator from "./TypingIndicator";
import Composer from "./Composer";
import DetailsDrawer from "./DetailsDrawer";

export default function ChatPage() {
  const { conversationId } = useParams();
  const me = useAuthStore((s) => s.authUser);
  const conversation = useConversationStore((s) => s.byId[conversationId]);
  const ensure = useConversationStore((s) => s.ensure);
  const markRead = useConversationStore((s) => s.markRead);
  const load = useMessageStore((s) => s.load);
  const messageState = useMessageStore((s) => s.byConversation[conversationId]) ?? EMPTY;
  const setActive = useUIStore((s) => s.setActiveConversation);
  const windowFocused = useUIStore((s) => s.windowFocused);
  const detailsOpen = useUIStore((s) => s.detailsOpen);

  const [missing, setMissing] = useState(false);
  const [unreadMarker, setUnreadMarker] = useState(undefined);
  const [dragging, setDragging] = useState(false);
  const composerRef = useRef(null);

  useEffect(() => {
    setMissing(false);
    setUnreadMarker(undefined);
    let cancelled = false;
    ensure(conversationId).then((c) => {
      if (!cancelled && !c) setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, ensure]);

  useEffect(() => {
    setActive(conversationId);
    emit(SOCKET_EVENTS.CONVERSATION_OPEN, { conversationId });
    return () => {
      setActive(null);
      emit(SOCKET_EVENTS.CONVERSATION_CLOSE, { conversationId });
    };
  }, [conversationId, setActive]);

  useEffect(() => {
    load(conversationId);
  }, [conversationId, load]);

  // Freeze where "new messages" starts when the chat opens, before marking it read
  useEffect(() => {
    if (conversation && unreadMarker === undefined) {
      setUnreadMarker(
        conversation.me.unread > 0 ? (conversation.me.lastReadAt ?? "1970-01-01T00:00:00Z") : null
      );
    }
  }, [conversation, unreadMarker]);

  const unread = conversation?.me?.unread ?? 0;
  const lastMessageAt = conversation?.lastMessageAt;
  useEffect(() => {
    if (conversation && messageState.loaded && windowFocused) markRead(conversationId);
  }, [
    conversation,
    unread,
    lastMessageAt,
    messageState.loaded,
    windowFocused,
    conversationId,
    markRead,
  ]);

  if (missing) {
    return (
      <EmptyState
        icon={MessageSquareOff}
        title="Conversation not found"
        description="It may have been deleted, or the link is wrong."
        action={
          <Link to="/" className="btn btn-primary btn-sm">
            Back to chats
          </Link>
        }
        className="flex-1"
      />
    );
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const onDragOver = (e) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      setDragging(true);
    }
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) composerRef.current?.addFiles(files);
  };

  return (
    <div
      className="flex-1 flex min-h-0"
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <section className="flex-1 min-w-0 flex flex-col relative" aria-label="Conversation">
        <ChatHeader conversation={conversation} />
        <MessageList
          key={conversationId}
          conversation={conversation}
          state={messageState}
          meId={me._id}
          unreadMarker={unreadMarker ?? null}
        />
        <TypingIndicator conversation={conversation} meId={me._id} />
        <Composer ref={composerRef} conversation={conversation} />
        {dragging && (
          <div className="absolute inset-2 z-20 rounded-2xl border-2 border-dashed border-primary bg-primary/10 flex items-center justify-center pointer-events-none">
            <p className="font-medium text-primary">Drop images to send</p>
          </div>
        )}
      </section>
      <AnimatePresence>
        {detailsOpen && <DetailsDrawer conversation={conversation} />}
      </AnimatePresence>
    </div>
  );
}
