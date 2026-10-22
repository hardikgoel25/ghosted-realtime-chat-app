import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useDebounce } from "../../hooks/useDebounce";
import { listTime } from "../../lib/format";
import { useMessageStore } from "../../stores/useMessageStore";
import { useUIStore } from "../../stores/useUIStore";
import Spinner from "../../components/ui/Spinner";

function Highlight({ text, query }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  const start = Math.max(0, i - 40);
  const before = (start > 0 ? "…" : "") + text.slice(start, i);
  const match = text.slice(i, i + query.length);
  const after =
    text.slice(i + query.length, i + query.length + 80) +
    (text.length > i + query.length + 80 ? "…" : "");
  return (
    <>
      {before}
      <mark className="bg-primary/30 text-inherit rounded px-0.5">{match}</mark>
      {after}
    </>
  );
}

export default function ChatSearch({ conversation, meId }) {
  const setOpen = useUIStore((s) => s.setChatSearchOpen);
  const search = useMessageStore((s) => s.search);
  const loadAround = useMessageStore((s) => s.loadAround);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    search(conversation._id, q)
      .then((items) => !cancelled && setResults(items))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, conversation._id, search]);

  const nameOf = (senderId) =>
    senderId === meId
      ? "You"
      : (conversation.participants
          .find((p) => p.userId === senderId)
          ?.user?.fullname?.split(" ")[0] ?? "Them");

  return (
    <div className="shrink-0 border-b border-base-300 bg-base-100">
      <div className="flex items-center gap-2 px-3 py-2">
        <label className="input input-sm flex-1">
          <Search className="size-4 opacity-50" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search in this conversation"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            aria-label="Search in conversation"
            autoFocus
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-circle"
          onClick={() => setOpen(false)}
          aria-label="Close search"
        >
          <X className="size-4" />
        </button>
      </div>
      {(loading || results) && (
        <ul
          className="max-h-64 overflow-y-auto border-t border-base-300 divide-y divide-base-200"
          role="list"
        >
          {loading && results === null ? (
            <li className="py-4 flex justify-center">
              <Spinner size="sm" />
            </li>
          ) : results?.length === 0 ? (
            <li className="py-4 text-center text-sm text-base-content/60">No messages match.</li>
          ) : (
            results?.map((m) => (
              <li key={m._id}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 hover:bg-base-200"
                  onClick={async () => {
                    await loadAround(conversation._id, m._id);
                  }}
                >
                  <div className="flex items-center justify-between text-[11px] text-base-content/60">
                    <span>{nameOf(m.senderId)}</span>
                    <span>{listTime(m.createdAt)}</span>
                  </div>
                  <div className="text-sm truncate">
                    <Highlight text={m.text} query={debounced.trim()} />
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
