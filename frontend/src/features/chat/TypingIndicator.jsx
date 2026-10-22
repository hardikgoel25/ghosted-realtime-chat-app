import { useConversationStore } from "../../stores/useConversationStore";

export default function TypingIndicator({ conversation, meId }) {
  const typing = useConversationStore((s) => s.typing[conversation._id]);
  const ids = Object.keys(typing ?? {}).filter((id) => id !== meId);
  if (ids.length === 0) return <div className="h-5 shrink-0" aria-hidden="true" />;

  const names = ids.map(
    (id) =>
      conversation.participants.find((p) => p.userId === id)?.user?.fullname?.split(" ")[0] ??
      "Someone"
  );

  return (
    <div
      className="h-5 shrink-0 px-4 sm:px-6 text-xs text-base-content/60 flex items-center gap-2"
      aria-live="polite"
    >
      <span className="flex items-center gap-0.5 text-primary" aria-hidden="true">
        <i className="typing-dot" />
        <i className="typing-dot" />
        <i className="typing-dot" />
      </span>
      {names.join(", ")} {names.length > 1 ? "are" : "is"} typing
    </div>
  );
}
