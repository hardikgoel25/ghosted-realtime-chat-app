import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, UserX, Users } from "lucide-react";
import { LIMITS } from "@ghosted/shared";
import { api } from "../../lib/api";
import { useDebounce } from "../../hooks/useDebounce";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { useUIStore } from "../../stores/useUIStore";
import Avatar from "../../components/ui/Avatar";
import Dialog from "../../components/ui/Dialog";
import Spinner from "../../components/ui/Spinner";
import UserPicker from "./UserPicker";

function DirectTab({ onPicked }) {
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
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

  const pick = async (user) => {
    setBusyId(user._id);
    try {
      await onPicked(user);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
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
    </>
  );
}

function GroupTab({ onCreated }) {
  const createGroup = useConversationStore((s) => s.createGroup);
  const [name, setName] = useState("");
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const canCreate = name.trim().length > 0 && members.length > 0 && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    try {
      const conversation = await createGroup({
        name: name.trim(),
        memberIds: members.map((u) => u._id),
      });
      onCreated(conversation);
    } catch {
      // toast shown by the API client
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label className="input w-full">
        <Users className="size-4 opacity-50" aria-hidden="true" />
        <input
          type="text"
          placeholder="Group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.GROUP_NAME_MAX}
          aria-label="Group name"
          autoFocus
        />
      </label>
      <UserPicker
        selected={members}
        onChange={setMembers}
        max={LIMITS.GROUP_MEMBERS_MAX - 1}
        autoFocus={false}
      />
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-xs text-base-content/50">
          {members.length === 0
            ? "Pick at least one person"
            : `${members.length + 1} members including you`}
        </span>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!canCreate}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Create group"}
        </button>
      </div>
    </form>
  );
}

export default function NewChatDialog() {
  const open = useUIStore((s) => s.newChatOpen);
  const setOpen = useUIStore((s) => s.setNewChatOpen);
  const openDirect = useConversationStore((s) => s.openDirect);
  const groupsEnabled = useAuthStore((s) => s.config?.features?.groups !== false);
  const navigate = useNavigate();
  const [tab, setTab] = useState("direct");

  useEffect(() => {
    if (!open) setTab("direct");
  }, [open]);

  const go = (conversation) => {
    setOpen(false);
    navigate(`/c/${conversation._id}`);
  };

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="New chat">
      {groupsEnabled && (
        <div role="tablist" className="tabs tabs-box tabs-sm w-full mb-3" aria-label="Chat type">
          {[
            ["direct", "Direct message"],
            ["group", "New group"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`tab flex-1 ${tab === id ? "tab-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {open && tab === "group" ? (
        <GroupTab onCreated={go} />
      ) : open ? (
        <DirectTab
          onPicked={async (user) => {
            try {
              go(await openDirect(user._id));
            } catch {
              // toast shown by the API client
            }
          }}
        />
      ) : null}
    </Dialog>
  );
}
