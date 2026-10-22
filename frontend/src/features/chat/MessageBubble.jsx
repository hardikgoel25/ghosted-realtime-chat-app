import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Ban,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Info,
  MoreHorizontal,
  Pencil,
  Reply,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { LIMITS, MESSAGE_STATUS, QUICK_REACTIONS } from "@ghosted/shared";
import { dayLabel, timeOf } from "../../lib/format";
import { tokenizeLinks } from "../../lib/linkify";
import { copyText } from "../../lib/utils";
import { useLongPress } from "../../hooks/useLongPress";
import { useMessageStore } from "../../stores/useMessageStore";
import { useUIStore } from "../../stores/useUIStore";
import Avatar from "../../components/ui/Avatar";
import ContextMenu from "../../components/ui/ContextMenu";
import Dialog from "../../components/ui/Dialog";
import EmojiPicker from "../../components/ui/EmojiPicker";
import AudioPlayer from "./AudioPlayer";
import FileChip from "./FileChip";
import MessageInfoDialog from "./MessageInfoDialog";
import { messageStatus } from "./messageStatus";

const COLLAPSE_AT = 700;

function StatusTicks({ status }) {
  switch (status) {
    case MESSAGE_STATUS.PENDING:
      return <Clock className="size-3" aria-label="Sending" />;
    case MESSAGE_STATUS.FAILED:
      return <AlertCircle className="size-3 text-error" aria-label="Not sent" />;
    case MESSAGE_STATUS.SENT:
      return <Check className="size-3" aria-label="Sent" />;
    case MESSAGE_STATUS.DELIVERED:
      return <CheckCheck className="size-3" aria-label="Delivered" />;
    case MESSAGE_STATUS.SEEN:
      return <CheckCheck className="size-3 text-secondary" aria-label="Seen" />;
    default:
      return null;
  }
}

function renderText(text) {
  return tokenizeLinks(text).map((token, i) =>
    token.type === "link" ? (
      <a
        key={i}
        href={token.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all"
      >
        {token.value}
      </a>
    ) : (
      <Fragment key={i}>{token.value}</Fragment>
    )
  );
}

const pointOf = (el) => {
  const r = el.getBoundingClientRect();
  return { clientX: r.left, clientY: r.bottom + 4 };
};

export default function MessageBubble({
  row,
  conversation,
  meId,
  onOpenImage,
  onJumpTo,
  highlighted,
}) {
  const { message, showDay, groupStart, groupEnd, firstUnread } = row;
  const retry = useMessageStore((s) => s.retry);
  const discard = useMessageStore((s) => s.discard);
  const react = useMessageStore((s) => s.react);
  const remove = useMessageStore((s) => s.remove);
  const setReplyTo = useUIStore((s) => s.setReplyTo);
  const setEditing = useUIStore((s) => s.setEditing);

  const [menu, setMenu] = useState(null);
  const [emojiAnchor, setEmojiAnchor] = useState(null);
  const [info, setInfo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const mine = message.senderId === meId;
  const deleted = Boolean(message.deletedAt);
  const local = message.pending || message.failed;
  const sender = conversation.participants.find((p) => p.userId === message.senderId)?.user;
  const status = messageStatus(message, conversation, meId);
  const attachments = message.attachments ?? [];
  const images = attachments.filter((a) => (a.kind ?? "image") === "image");
  const files = attachments.filter((a) => a.kind === "file");
  const audios = attachments.filter((a) => a.kind === "audio");
  const long = message.text.length > COLLAPSE_AT;
  const text = long && !expanded ? `${message.text.slice(0, COLLAPSE_AT)}…` : message.text;
  const reactions = message.reactions ?? [];
  const myReactions = new Set(
    reactions.filter((r) => r.userIds.includes(meId)).map((r) => r.emoji)
  );
  const canEdit =
    mine &&
    !deleted &&
    !local &&
    Date.now() - new Date(message.createdAt).getTime() < LIMITS.MESSAGE_EDIT_WINDOW_MS;
  const interactive = !deleted && !local;

  const longPress = useLongPress((point) => interactive && point && setMenu(point));

  const nameOf = (id) =>
    id === meId
      ? "You"
      : (conversation.participants.find((p) => p.userId === id)?.user?.fullname?.split(" ")[0] ??
        "Someone");

  const toggleReaction = (emoji) =>
    react(conversation._id, message._id, emoji, !myReactions.has(emoji));

  const menuItems = interactive
    ? [
        {
          label: "Reply",
          icon: <Reply className="size-4" />,
          onSelect: () => setReplyTo(message),
        },
        message.text && {
          label: "Copy text",
          icon: <Copy className="size-4" />,
          onSelect: async () =>
            (await copyText(message.text)) ? toast.success("Copied") : toast.error("Copy failed"),
        },
        canEdit && {
          label: "Edit",
          icon: <Pencil className="size-4" />,
          onSelect: () => setEditing(message),
        },
        mine && {
          label: "Message info",
          icon: <Info className="size-4" />,
          onSelect: () => setInfo(true),
        },
        {
          label: "Delete for me",
          icon: <Trash2 className="size-4" />,
          onSelect: () => remove(conversation._id, message._id, "me"),
        },
        mine && {
          label: "Delete for everyone",
          icon: <Trash2 className="size-4" />,
          danger: true,
          onSelect: () => setConfirmDelete(true),
        },
      ]
    : [];

  const quickHeader = (
    <div className="flex justify-between px-1 pb-1.5 mb-1.5 border-b border-base-300">
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          className={`text-xl leading-none p-1 rounded-lg hover:bg-base-200 ${
            myReactions.has(e) ? "bg-primary/15" : ""
          }`}
          onClick={() => {
            setMenu(null);
            toggleReaction(e);
          }}
          aria-label={`React with ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );

  const toolbar = interactive && (
    <div
      className={`hidden sm:flex items-center gap-0.5 self-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${
        mine ? "order-first mr-1" : "ml-1"
      }`}
    >
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-circle"
        aria-label="Add reaction"
        onClick={(e) => setEmojiAnchor(pointOf(e.currentTarget))}
      >
        <SmilePlus className="size-4" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-circle"
        aria-label="Reply"
        onClick={() => setReplyTo(message)}
      >
        <Reply className="size-4" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-circle"
        aria-label="More actions"
        aria-haspopup="menu"
        onClick={(e) => setMenu(pointOf(e.currentTarget))}
      >
        <MoreHorizontal className="size-4" />
      </button>
    </div>
  );

  return (
    <div className="px-3 sm:px-5">
      {showDay && (
        <div className="flex justify-center py-3">
          <span className="badge badge-ghost badge-sm">{dayLabel(message.createdAt)}</span>
        </div>
      )}
      {firstUnread && (
        <div className="flex items-center gap-3 py-2 text-xs text-primary" role="separator">
          <span className="flex-1 h-px bg-primary/40" />
          New messages
          <span className="flex-1 h-px bg-primary/40" />
        </div>
      )}

      <div
        className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${
          groupStart ? "pt-2" : "pt-0.5"
        } ${groupEnd ? "pb-0.5" : ""}`}
      >
        {!mine && (
          <div className="w-7 shrink-0 hidden sm:block">
            {groupEnd && <Avatar user={sender} size="xs" />}
          </div>
        )}

        <div
          className={`flex flex-col min-w-0 max-w-[min(78%,36rem)] ${mine ? "items-end" : "items-start"}`}
        >
          <div
            className={`bubble ${mine ? "bubble-mine" : "bubble-theirs"} ${
              message.pending ? "opacity-75" : ""
            } ${message.failed ? "ring-1 ring-error" : ""} ${highlighted ? "bubble-highlight" : ""} select-text`}
            {...longPress}
          >
            {deleted ? (
              <p className="flex items-center gap-1.5 text-sm italic opacity-70">
                <Ban className="size-3.5" aria-hidden="true" /> This message was deleted
              </p>
            ) : (
              <>
                {message.replyTo && (
                  <button
                    type="button"
                    className={`block w-full text-left rounded-md px-2 py-1 mb-1.5 border-l-2 ${
                      mine
                        ? "bg-primary-content/10 border-primary-content/60"
                        : "bg-base-300/60 border-primary"
                    }`}
                    onClick={() => onJumpTo?.(message.replyTo.messageId)}
                    aria-label="Jump to the quoted message"
                  >
                    <span className="block text-xs font-semibold opacity-90">
                      {nameOf(message.replyTo.senderId)}
                    </span>
                    <span className="block text-xs opacity-80 truncate">
                      {message.replyTo.text ||
                        (message.replyTo.type === "audio"
                          ? "🎤 Voice message"
                          : message.replyTo.hasAttachments
                            ? "📎 Attachment"
                            : "")}
                    </span>
                  </button>
                )}

                {images.length > 0 && (
                  <div
                    className={`grid gap-1 ${text || files.length || audios.length ? "mb-1.5" : ""} ${
                      images.length === 1 ? "grid-cols-1" : "grid-cols-2"
                    }`}
                  >
                    {images.map((a, i) => (
                      <button
                        key={a.url ?? i}
                        type="button"
                        className="block overflow-hidden rounded-lg bg-base-300/40"
                        onClick={() =>
                          a.url &&
                          onOpenImage(
                            images.map((x) => x.url),
                            i
                          )
                        }
                        aria-label={`Open image ${i + 1} of ${images.length}`}
                        disabled={!a.url}
                      >
                        {a.url ? (
                          <img
                            src={a.url}
                            alt={a.name ?? ""}
                            loading="lazy"
                            className={`w-full object-cover ${
                              images.length === 1 ? "max-h-80 max-w-xs" : "aspect-square"
                            }`}
                          />
                        ) : (
                          <div className="aspect-square w-40 skeleton" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {files.length > 0 && (
                  <div className={`flex flex-col gap-1 ${text || audios.length ? "mb-1.5" : ""}`}>
                    {files.map((a, i) => (
                      <FileChip key={a.url ?? i} attachment={a} mine={mine} />
                    ))}
                  </div>
                )}

                {audios.map((a, i) => (
                  <div key={a.url ?? i} className={text ? "mb-1" : ""}>
                    {a.url ? (
                      <AudioPlayer src={a.url} durationMs={a.durationMs} mine={mine} />
                    ) : (
                      <span className="text-xs opacity-70">Uploading voice note…</span>
                    )}
                  </div>
                ))}

                {text && (
                  <p className="whitespace-pre-wrap break-words text-[0.95rem]">
                    {renderText(text)}
                  </p>
                )}
                {long && (
                  <button
                    type="button"
                    className="text-xs underline opacity-80 mt-1"
                    onClick={() => setExpanded((v) => !v)}
                  >
                    {expanded ? "Show less" : "Show more"}
                  </button>
                )}
              </>
            )}

            <div
              className={`flex items-center gap-1 justify-end mt-0.5 text-[10px] leading-none ${
                mine ? "text-primary-content/75" : "text-base-content/50"
              }`}
            >
              {message.editedAt && !deleted && <span className="italic">edited</span>}
              <time dateTime={message.createdAt} className="whitespace-nowrap">
                {timeOf(message.createdAt)}
              </time>
              {mine && !deleted && <StatusTicks status={status} />}
            </div>
          </div>

          {reactions.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${mine ? "justify-end" : ""}`}>
              {reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs leading-none ${
                    myReactions.has(r.emoji)
                      ? "border-primary bg-primary/15"
                      : "border-base-300 bg-base-100"
                  }`}
                  title={r.userIds.map(nameOf).join(", ")}
                  onClick={() => toggleReaction(r.emoji)}
                  aria-label={`${r.emoji} ${r.userIds.length}, ${r.userIds.map(nameOf).join(", ")}`}
                  aria-pressed={myReactions.has(r.emoji)}
                >
                  <span className="text-sm leading-none">{r.emoji}</span>
                  <span>{r.userIds.length}</span>
                </button>
              ))}
            </div>
          )}

          {message.failed && (
            <div className="flex items-center gap-2 mt-1 text-xs text-error">
              <span>Not sent.</span>
              <button
                type="button"
                className="link"
                onClick={() => retry(conversation._id, message.clientId)}
              >
                Retry
              </button>
              <button
                type="button"
                className="link opacity-70"
                onClick={() => discard(conversation._id, message.clientId)}
              >
                Discard
              </button>
            </div>
          )}
        </div>

        {toolbar}
      </div>

      <ContextMenu
        anchor={menu}
        items={menuItems}
        onClose={() => setMenu(null)}
        header={quickHeader}
        width="w-64"
      />
      <EmojiPicker
        anchor={emojiAnchor}
        onPick={toggleReaction}
        onClose={() => setEmojiAnchor(null)}
      />
      <MessageInfoDialog
        open={info}
        onClose={() => setInfo(false)}
        message={message}
        conversation={conversation}
        meId={meId}
      />
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete for everyone?"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={() => {
                setConfirmDelete(false);
                remove(conversation._id, message._id, "everyone");
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-base-content/70">
          The message is replaced with &ldquo;This message was deleted&rdquo; for everyone in the
          chat.
        </p>
      </Dialog>
    </div>
  );
}
