import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  CheckCheck,
  LogOut,
  MailOpen,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { useLongPress } from "../../hooks/useLongPress";
import { listTime } from "../../lib/format";
import Avatar from "../../components/ui/Avatar";
import ContextMenu from "../../components/ui/ContextMenu";
import Dialog from "../../components/ui/Dialog";
import {
  conversationAvatarUser,
  conversationTitle,
  isGroup,
  memberName,
  previewFor,
} from "./conversationHelpers";

export default function ConversationItem({ conversation }) {
  const me = useAuthStore((s) => s.authUser);
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const typing = useConversationStore((s) => s.typing[conversation._id]);
  const setFlags = useConversationStore((s) => s.setFlags);
  const markRead = useConversationStore((s) => s.markRead);
  const markUnread = useConversationStore((s) => s.markUnread);
  const clearChat = useConversationStore((s) => s.clearChat);
  const { conversationId } = useParams();

  const [menu, setMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const longPress = useLongPress((point) => point && setMenu(point));

  const id = conversation._id;
  const group = isGroup(conversation);
  const active = conversationId === id;
  const user = conversationAvatarUser(conversation, me._id);
  const online = !group && user ? onlineUsers.includes(user._id) : undefined;
  const typingIds = Object.keys(typing ?? {}).filter((uid) => uid !== me._id);
  const { unread = 0, muted, pinned, archived } = conversation.me ?? {};

  const items = [
    {
      label: pinned ? "Unpin" : "Pin",
      icon: pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />,
      onSelect: () => setFlags(id, { pinned: !pinned }),
    },
    {
      label: muted ? "Unmute" : "Mute",
      icon: muted ? <Bell className="size-4" /> : <BellOff className="size-4" />,
      onSelect: () => setFlags(id, { muted: !muted }),
    },
    unread > 0
      ? {
          label: "Mark as read",
          icon: <CheckCheck className="size-4" />,
          onSelect: () => markRead(id),
        }
      : conversation.lastMessage &&
        !active && {
          label: "Mark as unread",
          icon: <MailOpen className="size-4" />,
          onSelect: () => markUnread(id),
        },
    {
      label: archived ? "Unarchive" : "Archive",
      icon: archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />,
      onSelect: () => setFlags(id, { archived: !archived }),
    },
    {
      label: group ? "Leave group" : "Delete chat",
      icon: group ? <LogOut className="size-4" /> : <Trash2 className="size-4" />,
      danger: true,
      onSelect: () => setConfirmDelete(true),
    },
  ];

  return (
    <>
      <Link
        to={`/c/${id}`}
        role="listitem"
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl transition-colors select-none hover:bg-base-200 ${
          active ? "bg-base-200" : ""
        }`}
        {...longPress}
      >
        <Avatar user={user} size="md" online={online} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`truncate ${unread ? "font-semibold" : "font-medium"}`}>
              {conversationTitle(conversation, me._id)}
            </span>
            {pinned && <Pin className="size-3 opacity-50 shrink-0" aria-label="Pinned" />}
            <span className="ml-auto text-[11px] text-base-content/50 shrink-0">
              {conversation.lastMessage ? listTime(conversation.lastMessageAt) : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-sm ${unread ? "text-base-content" : "text-base-content/60"}`}
            >
              {typingIds.length > 0 ? (
                <span className="text-primary">
                  {group
                    ? `${typingIds.map((uid) => memberName(conversation, uid, me._id)).join(", ")} typing…`
                    : "typing…"}
                </span>
              ) : (
                previewFor(conversation, me._id)
              )}
            </span>
            <span className="ml-auto flex items-center gap-1 shrink-0">
              {muted && <BellOff className="size-3.5 opacity-50" aria-label="Muted" />}
              {unread > 0 && (
                <span className={`badge badge-sm ${muted ? "badge-ghost" : "badge-primary"}`}>
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
          </div>
        </div>
      </Link>

      <ContextMenu anchor={menu} items={items} onClose={() => setMenu(null)} />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={group ? `Leave ${conversation.group?.name ?? "this group"}?` : "Delete this chat?"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={async () => {
                setConfirmDelete(false);
                await clearChat(id);
              }}
            >
              {group ? "Leave" : "Delete"}
            </button>
          </>
        }
      >
        <p className="text-sm text-base-content/70">
          {group
            ? "You will stop receiving messages from this group. An admin can add you back later."
            : `This removes the messages from your side only. ${user?.fullname?.split(" ")[0] ?? "The other person"} keeps their copy, and new messages will still reach you.`}
        </p>
      </Dialog>
    </>
  );
}
