import { useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { ChevronDown } from "lucide-react";
import { useMessageStore } from "../../stores/useMessageStore";
import Spinner from "../../components/ui/Spinner";
import MessageBubble from "./MessageBubble";
import Lightbox from "./Lightbox";
import { annotateMessages } from "./messageStatus";

// Virtuoso needs a large starting index so older pages can be prepended without reflow
const START_INDEX = 1_000_000;

function MessageSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-4" aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className={`flex ${i % 3 === 1 ? "justify-end" : "justify-start"}`}>
          <div className={`skeleton h-10 rounded-2xl ${i % 2 ? "w-48" : "w-64"}`} />
        </div>
      ))}
    </div>
  );
}

export default function MessageList({ conversation, state, meId, unreadMarker }) {
  const loadOlder = useMessageStore((s) => s.loadOlder);
  const virtuoso = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newSinceScroll, setNewSinceScroll] = useState(0);
  const [lightbox, setLightbox] = useState(null);

  const rows = useMemo(
    () => annotateMessages(state.items, { meId, firstUnreadAfter: unreadMarker }),
    [state.items, meId, unreadMarker]
  );
  const firstItemIndex = START_INDEX - state.olderLoaded;

  // React to appended messages: scroll for our own, count the others while scrolled up
  const lastId = rows.at(-1)?.message._id ?? null;
  const prevLastId = useRef(lastId);
  useEffect(() => {
    if (lastId === prevLastId.current) return;
    prevLastId.current = lastId;
    const last = rows.at(-1)?.message;
    if (!last) return;
    if (last.senderId === meId) {
      virtuoso.current?.scrollToIndex({ index: "LAST", behavior: "smooth", align: "end" });
    } else if (!atBottom) {
      setNewSinceScroll((n) => n + 1);
    }
  }, [lastId, rows, meId, atBottom]);

  useEffect(() => {
    if (atBottom) setNewSinceScroll(0);
  }, [atBottom]);

  if (state.loading && !state.loaded) return <MessageSkeleton />;

  if (state.error && !state.loaded) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-base-content/60">
        Could not load messages.
      </div>
    );
  }

  if (state.loaded && rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <p className="text-base-content/60">No messages yet. Say hello 👋</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 relative">
      <Virtuoso
        ref={virtuoso}
        className="h-full"
        data={rows}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={{ index: rows.length - 1, align: "end" }}
        alignToBottom
        followOutput={(isAtBottom) => (isAtBottom ? "smooth" : false)}
        atBottomStateChange={setAtBottom}
        atBottomThreshold={60}
        startReached={() => loadOlder(conversation._id)}
        increaseViewportBy={{ top: 600, bottom: 300 }}
        computeItemKey={(_, row) => row.message._id}
        itemContent={(_, row) => (
          <MessageBubble
            row={row}
            conversation={conversation}
            meId={meId}
            onOpenImage={(urls, index) => setLightbox({ urls, index })}
          />
        )}
        components={{
          Header: () => (
            <div className="h-10 flex items-center justify-center text-xs text-base-content/50">
              {state.loadingMore ? (
                <Spinner size="sm" />
              ) : state.nextCursor ? (
                "Scroll up for earlier messages"
              ) : (
                "This is the beginning of your conversation"
              )}
            </div>
          ),
          Footer: () => <div className="h-2" />,
        }}
      />

      {!atBottom && (
        <button
          type="button"
          className="btn btn-sm btn-circle shadow-lg absolute bottom-3 right-4 bg-base-100 border border-base-300"
          onClick={() =>
            virtuoso.current?.scrollToIndex({ index: "LAST", behavior: "smooth", align: "end" })
          }
          aria-label="Jump to latest messages"
        >
          <ChevronDown className="size-4" />
          {newSinceScroll > 0 && (
            <span className="badge badge-primary badge-xs absolute -top-1.5 -right-1.5">
              {newSinceScroll}
            </span>
          )}
        </button>
      )}

      {lightbox && (
        <Lightbox images={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
