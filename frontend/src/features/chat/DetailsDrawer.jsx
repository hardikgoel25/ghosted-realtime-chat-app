import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Ban, ShieldCheck, Trash2, X } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { useUIStore } from "../../stores/useUIStore";
import { useIsWide } from "../../hooks/useMediaQuery";
import { lastSeenLabel } from "../../lib/format";
import Avatar from "../../components/ui/Avatar";
import Dialog from "../../components/ui/Dialog";
import Toggle from "../../components/ui/Toggle";
import { otherParticipant } from "../conversations/conversationHelpers";

const MUTE_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "60", label: "1 hour" },
  { value: "480", label: "8 hours" },
  { value: "10080", label: "1 week" },
  { value: "forever", label: "Always" },
];

function muteValueOf(me) {
  if (!me?.muted) return "off";
  const until = new Date(me.mutedUntil);
  return until.getFullYear() >= 9999 ? "forever" : "custom";
}

export default function DetailsDrawer({ conversation }) {
  const isWide = useIsWide();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.authUser);
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const presenceLastSeen = useAuthStore((s) => s.lastSeen);
  const setDetailsOpen = useUIStore((s) => s.setDetailsOpen);
  const setFlags = useConversationStore((s) => s.setFlags);
  const clearChat = useConversationStore((s) => s.clearChat);
  const block = useAuthStore((s) => s.block);
  const unblock = useAuthStore((s) => s.unblock);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const user = otherParticipant(conversation, me._id)?.user;
  const blockedByMe = Boolean(conversation.blocked?.byMe);
  const hidePresence = blockedByMe || Boolean(conversation.blocked?.byThem);
  const online = user && !hidePresence ? onlineUsers.includes(user._id) : false;
  const lastSeen = user
    ? presenceLastSeen[user._id] !== undefined
      ? presenceLastSeen[user._id]
      : user.lastSeenAt
    : null;
  const flags = conversation.me ?? {};
  const muteValue = muteValueOf(flags);
  const close = () => setDetailsOpen(false);

  const onMuteChange = (value) => {
    if (value === "off") return setFlags(conversation._id, { muted: false });
    if (value === "forever") return setFlags(conversation._id, { muted: true });
    return setFlags(conversation._id, { muted: Number(value) });
  };

  const content = (
    <div className="h-full flex flex-col">
      <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-base-300">
        <h2 className="font-semibold">Details</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-circle"
          onClick={close}
          aria-label="Close details"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {user && (
          <div className="flex flex-col items-center text-center gap-3">
            <Avatar user={user} size="xl" online={hidePresence ? undefined : online} />
            <div>
              <div className="text-lg font-semibold">{user.fullname}</div>
              <div className="text-sm text-base-content/60">@{user.username}</div>
              <div className="text-xs text-base-content/60 mt-1">
                {hidePresence
                  ? blockedByMe
                    ? "Blocked"
                    : ""
                  : online
                    ? "Online"
                    : lastSeenLabel(lastSeen)}
              </div>
            </div>
            {user.bio && <p className="text-sm text-base-content/80 max-w-xs">{user.bio}</p>}
            <Link
              to={`/u/${user.username}`}
              className="btn btn-sm btn-outline"
              onClick={() => !isWide && close()}
            >
              View profile
            </Link>
          </div>
        )}

        <div className="divide-y divide-base-300 border-y border-base-300">
          <div className="py-3">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-medium">Mute notifications</span>
                <span className="block text-sm text-base-content/60">
                  {muteValue === "custom"
                    ? `Muted until ${new Date(flags.mutedUntil).toLocaleString()}`
                    : "Silence toasts and sounds for this chat"}
                </span>
              </span>
              <select
                className="select select-sm w-32"
                value={muteValue === "custom" ? "custom" : muteValue}
                onChange={(e) => onMuteChange(e.target.value)}
                aria-label="Mute duration"
              >
                {muteValue === "custom" && <option value="custom">Custom</option>}
                {MUTE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Toggle
            label="Pin to top"
            description="Keep this chat at the top of your list"
            checked={Boolean(flags.pinned)}
            onChange={(v) => setFlags(conversation._id, { pinned: v })}
          />
          <Toggle
            label="Archive"
            description="Hide it from the main list until a new message arrives"
            checked={Boolean(flags.archived)}
            onChange={(v) => setFlags(conversation._id, { archived: v })}
          />
        </div>

        {user && (
          <button
            type="button"
            className={`btn btn-sm w-full ${blockedByMe ? "btn-outline" : "btn-outline btn-warning"}`}
            onClick={() => (blockedByMe ? unblock(user._id) : setConfirmBlock(true))}
          >
            {blockedByMe ? (
              <>
                <ShieldCheck className="size-4" /> Unblock {user.fullname.split(" ")[0]}
              </>
            ) : (
              <>
                <Ban className="size-4" /> Block {user.fullname.split(" ")[0]}
              </>
            )}
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline btn-error btn-sm w-full"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-4" /> Delete chat for me
        </button>
      </div>

      <Dialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        title={`Block ${user?.fullname ?? "this user"}?`}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmBlock(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={async () => {
                setConfirmBlock(false);
                if (user) await block(user._id);
              }}
            >
              Block
            </button>
          </>
        }
      >
        <p className="text-sm text-base-content/70">
          They will not be able to message you, and neither of you will see the other&apos;s online
          status. Your existing chat stays.
        </p>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this chat?"
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
                if (await clearChat(conversation._id)) {
                  close();
                  navigate("/", { replace: true });
                }
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-base-content/70">
          This removes the messages from your side only. New messages will still reach you.
        </p>
      </Dialog>
    </div>
  );

  if (isWide) {
    return (
      <motion.aside
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 320, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="shrink-0 border-l border-base-300 bg-base-100 overflow-hidden"
        aria-label="Conversation details"
      >
        <div className="w-80 h-full">{content}</div>
      </motion.aside>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-40 flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
      <motion.aside
        initial={{ x: 320 }}
        animate={{ x: 0 }}
        exit={{ x: 320 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="relative w-80 max-w-[90vw] h-full bg-base-100 shadow-2xl"
        aria-label="Conversation details"
      >
        {content}
      </motion.aside>
    </motion.div>
  );
}
