import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Ban,
  Camera,
  Check,
  Crown,
  Loader2,
  LogOut,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { ALLOWED_IMAGE_MIME, LIMITS } from "@ghosted/shared";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { useUIStore } from "../../stores/useUIStore";
import { useIsWide } from "../../hooks/useMediaQuery";
import { lastSeenLabel } from "../../lib/format";
import { prepareImage } from "../../lib/images";
import Avatar from "../../components/ui/Avatar";
import ContextMenu from "../../components/ui/ContextMenu";
import Dialog from "../../components/ui/Dialog";
import Toggle from "../../components/ui/Toggle";
import UserPicker from "../conversations/UserPicker";
import {
  activeMembers,
  isGroup,
  isGroupAdmin,
  otherParticipant,
} from "../conversations/conversationHelpers";

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

function ConfirmDialog({ open, onClose, title, body, action, onConfirm }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-error"
            onClick={async () => {
              onClose();
              await onConfirm();
            }}
          >
            {action}
          </button>
        </>
      }
    >
      <p className="text-sm text-base-content/70">{body}</p>
    </Dialog>
  );
}

/** Shared mute / pin / archive controls. */
function ConversationSettings({ conversation }) {
  const setFlags = useConversationStore((s) => s.setFlags);
  const flags = conversation.me ?? {};
  const muteValue = muteValueOf(flags);

  const onMuteChange = (value) => {
    if (value === "off") return setFlags(conversation._id, { muted: false });
    if (value === "forever") return setFlags(conversation._id, { muted: true });
    return setFlags(conversation._id, { muted: Number(value) });
  };

  return (
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
  );
}

// ---- groups ----------------------------------------------------------------------------------

function GroupIdentity({ conversation, admin }) {
  const updateGroup = useConversationStore((s) => s.updateGroup);
  const uploadGroupAvatar = useConversationStore((s) => s.uploadGroupAvatar);
  const removeGroupAvatar = useConversationStore((s) => s.removeGroupAvatar);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(conversation.group.name ?? "");
  const [description, setDescription] = useState(conversation.group.description ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const memberCount = activeMembers(conversation).length;

  useEffect(() => {
    if (!editing) {
      setName(conversation.group.name ?? "");
      setDescription(conversation.group.description ?? "");
    }
  }, [conversation.group.name, conversation.group.description, editing]);

  const save = async (e) => {
    e.preventDefault();
    const changes = {};
    if (name.trim() !== conversation.group.name) changes.name = name.trim();
    if (description.trim() !== (conversation.group.description ?? ""))
      changes.description = description.trim();
    if (Object.keys(changes).length === 0) return setEditing(false);
    if (changes.name === "") return toast.error("Give the group a name");
    setBusy(true);
    const ok = await updateGroup(conversation._id, changes);
    setBusy(false);
    if (ok) setEditing(false);
  };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!ALLOWED_IMAGE_MIME.includes(file.type))
      return toast.error("Please choose a JPEG, PNG, WebP or GIF image");
    const prepared = await prepareImage(file, { maxDimension: 1024 });
    if (prepared.size > LIMITS.AVATAR_MAX_BYTES) {
      return toast.error(
        `Image must be under ${Math.round(LIMITS.AVATAR_MAX_BYTES / 1024 / 1024)} MB`
      );
    }
    setBusy(true);
    await uploadGroupAvatar(conversation._id, prepared);
    setBusy(false);
  };

  return (
    <div className="flex flex-col items-center text-center gap-3">
      <div className="relative">
        <Avatar
          user={{
            fullname: conversation.group.name,
            avatar: conversation.group.avatar,
            group: true,
          }}
          size="xl"
        />
        {admin && (
          <>
            <button
              type="button"
              className="btn btn-primary btn-xs btn-circle absolute -bottom-0.5 -right-0.5"
              onClick={() => fileRef.current?.click()}
              aria-label="Change group photo"
              disabled={busy}
            >
              <Camera className="size-3.5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={ALLOWED_IMAGE_MIME.join(",")}
              onChange={onPickImage}
            />
          </>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="w-full space-y-2" noValidate>
          <input
            type="text"
            className="input input-sm w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.GROUP_NAME_MAX}
            aria-label="Group name"
            autoFocus
          />
          <textarea
            className="textarea textarea-sm w-full resize-none"
            rows={2}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={LIMITS.GROUP_DESCRIPTION_MAX}
            aria-label="Group description"
          />
          <div className="flex justify-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-xs" disabled={busy}>
              {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}{" "}
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="min-w-0 w-full">
          <div className="text-lg font-semibold break-words">{conversation.group.name}</div>
          <div className="text-sm text-base-content/60">
            {memberCount} member{memberCount === 1 ? "" : "s"}
          </div>
          {conversation.group.description && (
            <p className="text-sm text-base-content/80 mt-2 break-words">
              {conversation.group.description}
            </p>
          )}
          {admin && (
            <div className="flex justify-center gap-1 mt-2">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3" /> Edit
              </button>
              {conversation.group.avatar?.url && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => removeGroupAvatar(conversation._id)}
                  disabled={busy}
                >
                  <Trash2 className="size-3" /> Remove photo
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MemberRow({ conversation, participant, meId, admin, onlineUsers }) {
  const removeMember = useConversationStore((s) => s.removeMember);
  const setMemberRole = useConversationStore((s) => s.setMemberRole);
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const user = participant.user;
  const isMe = participant.userId === meId;
  const name = isMe ? "You" : (user?.fullname ?? "Deleted account");

  const items = [
    user && {
      label: "View profile",
      onSelect: () => navigate(`/u/${user.username}`),
    },
    admin &&
      !isMe && {
        label: participant.role === "admin" ? "Remove as admin" : "Make admin",
        icon: <Crown className="size-4" />,
        onSelect: () =>
          setMemberRole(
            conversation._id,
            participant.userId,
            participant.role === "admin" ? "member" : "admin"
          ),
      },
    admin &&
      !isMe && {
        label: "Remove from group",
        icon: <X className="size-4" />,
        danger: true,
        onSelect: () => setConfirmRemove(true),
      },
  ].filter(Boolean);

  return (
    <li className="py-2 flex items-center gap-3">
      <Avatar
        user={user}
        size="sm"
        online={user && !isMe ? onlineUsers.includes(participant.userId) : undefined}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium truncate">
          {name}
          {participant.role === "admin" && (
            <span className="badge badge-primary badge-xs ml-2 align-middle">Admin</span>
          )}
        </span>
        {user && <span className="block text-xs text-base-content/60">@{user.username}</span>}
      </span>
      {items.length > 0 && (
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-circle"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ clientX: r.right - 208, clientY: r.bottom + 4 });
          }}
          aria-label={`Options for ${user?.fullname ?? "member"}`}
          aria-haspopup="menu"
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
      <ContextMenu anchor={menu} items={items} onClose={() => setMenu(null)} />
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Remove ${user?.fullname?.split(" ")[0] ?? "this member"}?`}
        body="They will no longer see new messages in this group. An admin can add them back later."
        action="Remove"
        onConfirm={() => removeMember(conversation._id, participant.userId)}
      />
    </li>
  );
}

function AddMembersDialog({ conversation, open, onClose }) {
  const addMembers = useConversationStore((s) => s.addMembers);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const current = activeMembers(conversation).map((p) => p.userId);
  const room = Math.max(0, LIMITS.GROUP_MEMBERS_MAX - current.length);

  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title="Add people">
      {open && (
        <>
          <UserPicker selected={selected} onChange={setSelected} exclude={current} max={room} />
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={selected.length === 0 || busy}
              onClick={async () => {
                setBusy(true);
                const ok = await addMembers(
                  conversation._id,
                  selected.map((u) => u._id)
                );
                setBusy(false);
                if (ok) onClose();
              }}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                `Add${selected.length ? ` ${selected.length}` : ""}`
              )}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function GroupMembers({ conversation, me, close }) {
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const clearChat = useConversationStore((s) => s.clearChat);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const admin = isGroupAdmin(conversation, me._id);
  const members = [...activeMembers(conversation)].sort((a, b) => {
    if (a.userId === me._id) return -1;
    if (b.userId === me._id) return 1;
    if ((a.role === "admin") !== (b.role === "admin")) return a.role === "admin" ? -1 : 1;
    return (a.user?.fullname ?? "").localeCompare(b.user?.fullname ?? "");
  });

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-base-content/70">Members</h3>
          {admin && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAdding(true)}>
              <UserPlus className="size-3.5" /> Add
            </button>
          )}
        </div>
        <ul className="divide-y divide-base-300" aria-label="Group members">
          {members.map((p) => (
            <MemberRow
              key={p.userId}
              conversation={conversation}
              participant={p}
              meId={me._id}
              admin={admin}
              onlineUsers={onlineUsers}
            />
          ))}
        </ul>
      </div>

      <button
        type="button"
        className="btn btn-outline btn-error btn-sm w-full"
        onClick={() => setConfirmLeave(true)}
      >
        <LogOut className="size-4" /> Leave group
      </button>

      <AddMembersDialog
        conversation={conversation}
        open={adding}
        onClose={() => setAdding(false)}
      />
      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={`Leave ${conversation.group.name}?`}
        body="You will stop receiving messages from this group. An admin can add you back later."
        action="Leave"
        onConfirm={async () => {
          if (await clearChat(conversation._id)) {
            close();
            navigate("/", { replace: true });
          }
        }}
      />
    </>
  );
}

// ---- direct chats ----------------------------------------------------------------------------

function DirectIdentity({ conversation, me, close }) {
  const isWide = useIsWide();
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const presenceLastSeen = useAuthStore((s) => s.lastSeen);
  const user = otherParticipant(conversation, me._id)?.user;
  if (!user) return null;
  const blockedByMe = Boolean(conversation.blocked?.byMe);
  const hidePresence = blockedByMe || Boolean(conversation.blocked?.byThem);
  const online = !hidePresence && onlineUsers.includes(user._id);
  const lastSeen =
    presenceLastSeen[user._id] !== undefined ? presenceLastSeen[user._id] : user.lastSeenAt;

  return (
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
  );
}

function DirectActions({ conversation, me, close }) {
  const navigate = useNavigate();
  const clearChat = useConversationStore((s) => s.clearChat);
  const block = useAuthStore((s) => s.block);
  const unblock = useAuthStore((s) => s.unblock);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const user = otherParticipant(conversation, me._id)?.user;
  const blockedByMe = Boolean(conversation.blocked?.byMe);

  return (
    <>
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

      <ConfirmDialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        title={`Block ${user?.fullname ?? "this user"}?`}
        body="They will not be able to message you, and neither of you will see the other's online status. Your existing chat stays."
        action="Block"
        onConfirm={() => user && block(user._id)}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this chat?"
        body="This removes the messages from your side only. New messages will still reach you."
        action="Delete"
        onConfirm={async () => {
          if (await clearChat(conversation._id)) {
            close();
            navigate("/", { replace: true });
          }
        }}
      />
    </>
  );
}

// ---- drawer ----------------------------------------------------------------------------------

export default function DetailsDrawer({ conversation }) {
  const isWide = useIsWide();
  const me = useAuthStore((s) => s.authUser);
  const setDetailsOpen = useUIStore((s) => s.setDetailsOpen);
  const group = isGroup(conversation);
  const close = () => setDetailsOpen(false);

  const content = (
    <div className="h-full flex flex-col">
      <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-base-300">
        <h2 className="font-semibold">{group ? "Group info" : "Details"}</h2>
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
        {group ? (
          <GroupIdentity conversation={conversation} admin={isGroupAdmin(conversation, me._id)} />
        ) : (
          <DirectIdentity conversation={conversation} me={me} close={close} />
        )}
        <ConversationSettings conversation={conversation} />
        {group ? (
          <GroupMembers conversation={conversation} me={me} close={close} />
        ) : (
          <DirectActions conversation={conversation} me={me} close={close} />
        )}
      </div>
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
