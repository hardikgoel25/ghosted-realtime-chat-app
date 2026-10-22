import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UserX } from "lucide-react";
import { api } from "../../lib/api";
import { useDebounce } from "../../hooks/useDebounce";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { useUIStore } from "../../stores/useUIStore";
import Avatar from "../../components/ui/Avatar";
import Dialog from "../../components/ui/Dialog";
import Spinner from "../../components/ui/Spinner";

export default function NewChatDialog() {
  const open = useUIStore((s) => s.newChatOpen);
  const setOpen = useUIStore((s) => s.setNewChatOpen);
  const openDirect = useConversationStore((s) => s.openDirect);
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      return;
    }
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
  }, [open, debounced]);

  const pick = async (user) => {
    setBusyId(user._id);
    try {
      const conversation = await openDirect(user._id);
      setOpen(false);
      navigate(`/c/${conversation._id}`);
    } catch {
      // toast shown by the API client
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="New chat">
      <label className="input w-full">
        <Search className="size-4 opacity-50" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search by name or username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search people"
          autoFocus
        />
      </label>

      <div className="mt-3 max-h-80 overflow-y-auto -mx-2" role="list">
        {loading && results.length === 0 ? (
          <div className="py-8 flex justify-center">
            <Spinner />
          </div>
        ) : results.length === 0 ? (
          <div className="py-10 text-center text-sm text-base-content/60 flex flex-col items-center gap-2">
            <UserX className="size-6 opacity-40" />
            {query ? "No one matches that search." : "No other people have joined yet."}
          </div>
        ) : (
          results.map((u) => (
            <button
              key={u._id}
              type="button"
              role="listitem"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-base-200 text-left disabled:opacity-60"
              onClick={() => pick(u)}
              disabled={busyId !== null}
            >
              <Avatar user={u} size="sm" online={onlineUsers.includes(u._id)} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium truncate">{u.fullname}</span>
                <span className="block text-xs text-base-content/60 truncate">
                  @{u.username}
                  {u.bio ? ` · ${u.bio}` : ""}
                </span>
              </span>
              {busyId === u._id && <Spinner size="sm" />}
            </button>
          ))
        )}
      </div>
    </Dialog>
  );
}
