import { useEffect, useState } from "react";
import { Check, Search, UserX, X } from "lucide-react";
import { api } from "../../lib/api";
import { useDebounce } from "../../hooks/useDebounce";
import { useAuthStore } from "../../stores/useAuthStore";
import Avatar from "../../components/ui/Avatar";
import Spinner from "../../components/ui/Spinner";

/**
 * Searchable multi-select of people. `selected` is an array of user objects so the chips can
 * show names for people who are no longer in the current search results.
 */
export default function UserPicker({
  selected,
  onChange,
  exclude = [],
  max = Infinity,
  autoFocus = true,
}) {
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get("/users", { params: { q: debounced.trim(), limit: 30 }, silent: true })
      .then(({ items }) => !cancelled && setResults(items))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const excluded = new Set(exclude);
  const selectedIds = new Set(selected.map((u) => u._id));
  const visible = results.filter((u) => !excluded.has(u._id));
  const full = selected.length >= max;

  const toggle = (user) => {
    if (selectedIds.has(user._id)) onChange(selected.filter((u) => u._id !== user._id));
    else if (!full) onChange([...selected, user]);
  };

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2" aria-label="Selected people">
          {selected.map((u) => (
            <span key={u._id} className="badge badge-primary badge-outline gap-1 pr-1 h-auto py-1">
              {u.fullname.split(" ")[0]}
              <button
                type="button"
                className="rounded-full hover:bg-primary/20 p-0.5"
                onClick={() => toggle(u)}
                aria-label={`Remove ${u.fullname}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <label className="input input-sm w-full">
        <Search className="size-4 opacity-50" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search by name or username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search people"
          autoFocus={autoFocus}
        />
      </label>
      <div className="mt-2 max-h-64 overflow-y-auto -mx-2" role="list">
        {loading && visible.length === 0 ? (
          <div className="py-8 flex justify-center">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-8 text-center text-sm text-base-content/60 flex flex-col items-center gap-2">
            <UserX className="size-6 opacity-40" />
            {query ? "No one matches that search." : "No one else to add yet."}
          </div>
        ) : (
          visible.map((u) => {
            const picked = selectedIds.has(u._id);
            return (
              <button
                key={u._id}
                type="button"
                role="listitem"
                aria-pressed={picked}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-base-200 text-left disabled:opacity-50"
                onClick={() => toggle(u)}
                disabled={!picked && full}
              >
                <Avatar user={u} size="sm" online={onlineUsers.includes(u._id)} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate">{u.fullname}</span>
                  <span className="block text-xs text-base-content/60 truncate">@{u.username}</span>
                </span>
                <span
                  className={`size-5 rounded-full border flex items-center justify-center ${
                    picked ? "bg-primary border-primary text-primary-content" : "border-base-300"
                  }`}
                  aria-hidden="true"
                >
                  {picked && <Check className="size-3" />}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
