import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime } from "../lib/utils";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";

const ChatContainer = () => {
  const {
    messages,
    getMessages,
    loadOlderMessages,
    nextCursor,
    isLoadingMore,
    isMessagesLoading,
    selectedUser,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const listRef = useRef(null);
  const bottomRef = useRef(null);
  const lastMessageIdRef = useRef(null);

  useEffect(() => {
    getMessages(selectedUser._id);
  }, [selectedUser._id, getMessages]);

  // Scroll to the bottom only when a message is appended, not when older ones are prepended
  useEffect(() => {
    const last = messages[messages.length - 1]?._id ?? null;
    if (last !== lastMessageIdRef.current) {
      lastMessageIdRef.current = last;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleLoadOlder = async () => {
    const list = listRef.current;
    const prevHeight = list?.scrollHeight ?? 0;
    const prevTop = list?.scrollTop ?? 0;
    const added = await loadOlderMessages();
    if (added && list) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight - prevHeight + prevTop;
      });
    }
  };

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <ChatHeader />

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {nextCursor && (
          <div className="flex justify-center">
            <button
              className="btn btn-xs btn-ghost"
              onClick={handleLoadOlder}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                "Load earlier messages"
              )}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="text-center text-sm text-base-content/50 pt-8">
            No messages yet. Say hello to {selectedUser.fullname.split(" ")[0]}!
          </p>
        )}

        {messages.map((message) => {
          const mine = message.senderId === authUser._id;
          return (
            <div key={message._id} className={`chat ${mine ? "chat-end" : "chat-start"}`}>
              <div className="chat-image avatar">
                <div className="size-10 rounded-full border">
                  <img
                    src={(mine ? authUser.avatar?.url : selectedUser.avatar?.url) || "/avatar.png"}
                    alt=""
                  />
                </div>
              </div>
              <div className="chat-header mb-1">
                <time className="text-xs opacity-50 ml-1" dateTime={message.createdAt}>
                  {formatMessageTime(message.createdAt)}
                </time>
              </div>
              <div className="chat-bubble flex flex-col">
                {message.image && (
                  <a href={message.image} target="_blank" rel="noopener noreferrer">
                    <img
                      src={message.image}
                      alt="Attachment"
                      loading="lazy"
                      className="sm:max-w-[200px] rounded-md mb-2"
                    />
                  </a>
                )}
                {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <MessageInput />
    </div>
  );
};

export default ChatContainer;
