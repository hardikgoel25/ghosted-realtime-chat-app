import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Info,
  LogOut,
  MailOpen,
  MoreVertical,
  Pin,
  PinOff,
  Search,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { useUIStore } from "../../stores/useUIStore";
import { lastSeenLabel } from "../../lib/format";
import Avatar from "../../components/ui/Avatar";
import ContextMenu from "../../components/ui/ContextMenu";
import Dialog from "../../components/ui/Dialog";
import {
  activeMembers,
  conversationAvatarUser,
  conversationTitle,
  isGroup,
  memberName,
  otherParticipant,
} from "../conversations/conversationHelpers";

export default function ChatHeader({ conversation }) {
  const me = useAuthStore((s) => s.authUser);
  const group = isGroup(conversation);
  const other = group ? null : (otherParticipant(conversation, me._id)?.user ?? null);
  const online = useAuthStore((s) => (other ? s.onlineUsers.includes(other._id) : false));
  const presenceLastSeen = useAuthStore((s) => (other ? s.lastSeen[other._id] : undefined));
  const block = useAuthStore((s) => s.block);
  const unblock = useAuthStore((s) => s.unblock);
  const typing = useConversationStore((s) => s.typing[conversation._id]);
  const setFlags = useConversationStore((s) => s.setFlags);
  const markUnread = useConversationStore((s) => s.markUnread);
  const clearChat = useConversationStore((s) => s.clearChat);
  const toggleDetails = useUIStore((s) => s.toggleDetails);
  const searchOpen = useUIStore((s) => s.chatSearchOpen);
  const setSearchOpen = useUIStore((s) => s.setChatSearchOpen);
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [confirm, setConfirm] = useState(null); // "delete" | "block" | "leave"

  const id = conversation._id;
  const title = conversationTitle(conversation, me._id);
  const avatarUser = conversationAvatarUser(conversation, me._id);
  const blocked = conversation.blocked ?? {};
  const typingIds = Object.keys(typing ?? {}).filter((uid) => uid !== me._id);
  const typingNow = typingIds.length > 0;
  const lastSeen = presenceLastSeen !== undefined ? presenceLastSeen : other?.lastSeenAt;
  const hidePresence = !group && (blocked.byMe || blocked.byThem);
  const memberCount = activeMembers(conversation).length;
  const status = group
    ? typingNow
      ? `${typingIds.map((uid) => memberName(conversation, uid, me._id)).join(", ")} typing…`
      : `${memberCount} member${memberCount === 1 ? "" : "s"}`
    : hidePresence
      ? blocked.byMe
        ? "Blocked"
        : ""
      : typingNow
        ? "typing…"
        : online
          ? "Online"
          : lastSeenLabel(lastSeen);
  const { muted, pinned, archived, unread } = conversation.me ?? {};

  const items = [
    other && {
      label: "View profile",
      icon: <User className="size-4" />,
      onSelect: () => navigate(`/u/${other.username}`),
    },
    group && {
      label: "Group info",
      icon: <Users className="size-4" />,
      onSelect: toggleDetails,
    },
    {
      label: muted ? "Unmute" : "Mute",
      icon: muted ? <Bell className="size-4" /> : <BellOff className="size-4" />,
      onSelect: () => setFlags(id, { muted: !muted }),
    },
    {
      label: pinned ? "Unpin" : "Pin",
      icon: pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />,
      onSelect: () => setFlags(id, { pinned: !pinned }),
    },
    conversation.lastMessage &&
      unread === 0 && {
        label: "Mark as unread",
        icon: <MailOpen className="size-4" />,
        onSelect: async () => {
          await markUnread(id);
          navigate("/");
        },
      },
    {
      label: archived ? "Unarchive" : "Archive",
      icon: <Archive className="size-4" />,
      onSelect: () => setFlags(id, { archived: !archived }),
    },
    other &&
      (blocked.byMe
        ? {
            label: "Unblock",
            icon: <ShieldCheck className="size-4" />,
            onSelect: () => unblock(other._id),
          }
        : {
            label: "Block",
            icon: <Ban className="size-4" />,
            danger: true,
            onSelect: () => setConfirm("block"),
          }),
    group
      ? {
          label: "Leave group",
          icon: <LogOut className="size-4" />,
          danger: true,
          onSelect: () => setConfirm("leave"),
        }
      : {
          label: "Delete chat",
          icon: <Trash2 className="size-4" />,
          danger: true,
          onSelect: () => setConfirm("delete"),
        },
  ];

  const dialogCopy = {
    block: {
      title: `Block ${other?.fullname ?? "this user"}?`,
      body: "They will not be able to message you, and neither of you will see the other's online status. Your existing chat stays.",
      action: "Block",
    },
    delete: {
      title: "Delete this chat?",
      body: "This removes the messages from your side only. New messages will still reach you.",
      action: "Delete",
    },
    leave: {
      title: `Leave ${title}?`,
      body: "You will stop receiving messages from this group. An admin can add you back later.",
      action: "Leave",
    },
  }[confirm] ?? { title: "", body: "", action: "" };

  return (
    <header className="h-14 shrink-0 flex items-center gap-1 px-2 sm:px-3 border-b border-base-300 bg-base-100/90 backdrop-blur">
      <Link to="/" className="btn btn-ghost btn-sm btn-circle md:hidden" aria-label="Back to chats">
        <ArrowLeft className="size-5" />
      </Link>

      {group ? (
        <button
          type="button"
          onClick={toggleDetails}
          className="flex items-center gap-3 min-w-0 flex-1 rounded-lg hover:bg-base-200 px-1.5 py-1 text-left"
          aria-label={`${title}: ${status}`}
        >
          <Avatar user={avatarUser} size="sm" />
          <span className="min-w-0">
            <span className="block font-semibold truncate leading-tight">{title}</span>
            <span
              className={`block text-xs truncate ${typingNow ? "text-primary" : "text-base-content/60"}`}
              aria-live="polite"
            >
              {status}
            </span>
          </span>
        </button>
      ) : (
        <Link
          to={other ? `/u/${other.username}` : "#"}
          className="flex items-center gap-3 min-w-0 flex-1 rounded-lg hover:bg-base-200 px-1.5 py-1"
          aria-label={`${title}${status ? `: ${status}` : ""}`}
        >
          <Avatar
            user={avatarUser}
            size="sm"
            online={other && !hidePresence ? online : undefined}
          />
          <span className="min-w-0">
            <span className="block font-semibold truncate leading-tight">{title}</span>
            <span
              className={`block text-xs truncate ${typingNow && !hidePresence ? "text-primary" : "text-base-content/60"}`}
              aria-live="polite"
            >
              {status}
            </span>
          </span>
        </Link>
      )}

      <button
        type="button"
        className={`btn btn-ghost btn-sm btn-circle ${searchOpen ? "btn-active" : ""}`}
        onClick={() => setSearchOpen(!searchOpen)}
        aria-label="Search in conversation"
        aria-pressed={searchOpen}
        title="Search"
      >
        <Search className="size-5" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-circle"
        onClick={toggleDetails}
        aria-label="Conversation details"
        title="Details"
      >
        <Info className="size-5" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-circle"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMenu({ clientX: rect.right - 208, clientY: rect.bottom + 4 });
        }}
        aria-label="More options"
        aria-haspopup="menu"
      >
        <MoreVertical className="size-5" />
      </button>

      <ContextMenu anchor={menu} items={items} onClose={() => setMenu(null)} />

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={dialogCopy.title}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={async () => {
                const which = confirm;
                setConfirm(null);
                if (which === "block" && other) await block(other._id);
                else if ((which === "delete" || which === "leave") && (await clearChat(id)))
                  navigate("/", { replace: true });
              }}
            >
              {dialogCopy.action}
            </button>
          </>
        }
      >
        <p className="text-sm text-base-content/70">{dialogCopy.body}</p>
      </Dialog>
    </header>
  );
}
