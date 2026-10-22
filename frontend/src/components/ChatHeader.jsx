import { X } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { formatLastSeen } from "../lib/utils";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser, typing, lastSeen } = useChatStore();
  const { onlineUsers } = useAuthStore();

  const isOnline = onlineUsers.includes(selectedUser._id);
  const isTyping = Boolean(typing[selectedUser._id]);
  const lastSeenAt = lastSeen[selectedUser._id] ?? selectedUser.lastSeenAt;

  return (
    <div className="p-2.5 border-b border-base-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="avatar">
            <div className="size-10 rounded-full relative">
              <img src={selectedUser.avatar?.url || "/avatar.png"} alt="" />
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="font-medium truncate">{selectedUser.fullname}</h3>
            <p className="text-sm text-base-content/70 truncate" aria-live="polite">
              {isTyping ? (
                <span className="text-primary">typing…</span>
              ) : isOnline ? (
                "Online"
              ) : (
                formatLastSeen(lastSeenAt)
              )}
            </p>
          </div>
        </div>

        <button
          onClick={() => setSelectedUser(null)}
          className="btn btn-ghost btn-sm btn-circle"
          aria-label="Close conversation"
        >
          <X />
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
