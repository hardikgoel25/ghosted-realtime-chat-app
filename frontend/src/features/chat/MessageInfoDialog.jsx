import { Check, CheckCheck, Clock } from "lucide-react";
import Dialog from "../../components/ui/Dialog";
import Avatar from "../../components/ui/Avatar";
import { format } from "date-fns";

const stamp = (d) => format(new Date(d), "d MMM yyyy, HH:mm:ss");

export default function MessageInfoDialog({ open, onClose, message, conversation, meId }) {
  if (!message) return null;
  const mine = message.senderId === meId;
  const t = new Date(message.createdAt).getTime();
  const others = conversation.participants.filter((p) => p.userId !== meId);

  return (
    <Dialog open={open} onClose={onClose} title="Message info" size="sm">
      <dl className="text-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-base-content/60 flex items-center gap-2">
            <Clock className="size-4" /> Sent
          </dt>
          <dd className="tabular-nums">{stamp(message.createdAt)}</dd>
        </div>
        {message.editedAt && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-base-content/60">Edited</dt>
            <dd className="tabular-nums">{stamp(message.editedAt)}</dd>
          </div>
        )}
        {mine &&
          others.map((p) => {
            const delivered = p.lastDeliveredAt && new Date(p.lastDeliveredAt).getTime() >= t;
            const seen = p.lastReadAt && new Date(p.lastReadAt).getTime() >= t;
            return (
              <div key={p.userId} className="pt-3 border-t border-base-300 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <Avatar user={p.user} size="xs" /> {p.user?.fullname ?? "Participant"}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-base-content/60 flex items-center gap-2">
                    <CheckCheck className="size-4" /> Delivered
                  </dt>
                  <dd className="tabular-nums">
                    {delivered ? `by ${stamp(p.lastDeliveredAt)}` : "Not yet"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-base-content/60 flex items-center gap-2">
                    <Check className="size-4 text-secondary" /> Seen
                  </dt>
                  <dd className="tabular-nums">
                    {seen
                      ? `by ${stamp(p.lastReadAt)}`
                      : p.lastReadAt === null && !p.user?.lastSeenAt
                        ? "Hidden or not yet"
                        : "Not yet"}
                  </dd>
                </div>
              </div>
            );
          })}
      </dl>
      <p className="text-[11px] text-base-content/50 mt-4">
        Delivery and seen times are when the other person's device last caught up, so they can be
        later than the exact moment.
      </p>
    </Dialog>
  );
}
