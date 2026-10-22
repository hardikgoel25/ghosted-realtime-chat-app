import { Fragment, useState } from "react";
import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import { MESSAGE_STATUS } from "@ghosted/shared";
import { dayLabel, timeOf } from "../../lib/format";
import { tokenizeLinks } from "../../lib/linkify";
import { useMessageStore } from "../../stores/useMessageStore";
import Avatar from "../../components/ui/Avatar";
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

export default function MessageBubble({ row, conversation, meId, onOpenImage }) {
  const { message, showDay, groupStart, groupEnd, firstUnread } = row;
  const retry = useMessageStore((s) => s.retry);
  const discard = useMessageStore((s) => s.discard);
  const [expanded, setExpanded] = useState(false);

  const mine = message.senderId === meId;
  const sender = conversation.participants.find((p) => p.userId === message.senderId)?.user;
  const status = messageStatus(message, conversation, meId);
  const images = message.attachments ?? [];
  const long = message.text.length > COLLAPSE_AT;
  const text = long && !expanded ? `${message.text.slice(0, COLLAPSE_AT)}…` : message.text;

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
        className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${
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
            } ${message.failed ? "ring-1 ring-error" : ""}`}
          >
            {images.length > 0 && (
              <div
                className={`grid gap-1 ${text ? "mb-1.5" : ""} ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
              >
                {images.map((a, i) => (
                  <button
                    key={a.url}
                    type="button"
                    className="block overflow-hidden rounded-lg bg-base-300/40"
                    onClick={() =>
                      onOpenImage(
                        images.map((x) => x.url),
                        i
                      )
                    }
                    aria-label={`Open image ${i + 1} of ${images.length}`}
                  >
                    <img
                      src={a.url}
                      alt={a.name ?? ""}
                      loading="lazy"
                      className={`w-full object-cover ${
                        images.length === 1 ? "max-h-80 max-w-xs" : "aspect-square"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}

            {text && (
              <p className="whitespace-pre-wrap break-words text-[0.95rem]">{renderText(text)}</p>
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

            <div
              className={`flex items-center gap-1 justify-end mt-0.5 text-[10px] leading-none ${
                mine ? "text-primary-content/75" : "text-base-content/50"
              }`}
            >
              <time dateTime={message.createdAt} className="whitespace-nowrap">
                {timeOf(message.createdAt)}
              </time>
              {mine && <StatusTicks status={status} />}
            </div>
          </div>

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
      </div>
    </div>
  );
}
