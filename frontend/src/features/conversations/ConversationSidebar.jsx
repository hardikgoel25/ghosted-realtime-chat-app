import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ghost, MessageSquarePlus, Search, SquarePen, Archive, Inbox } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { useUIStore } from "../../stores/useUIStore";
import { useConversationList } from "./useConversationList";
import ConversationItem from "./ConversationItem";
import UserMenu from "./UserMenu";
import EmptyState from "../../components/ui/EmptyState";

const TABS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "archived", label: "Archived" },
];

function SidebarSkeleton() {
  return (
    <div className="px-2 py-1 space-y-1" aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <div className="skeleton size-11 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-2/3" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ConversationSidebar() {
  const authUser = useAuthStore((s) => s.authUser);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const fetchList = useConversationStore((s) => s.fetchList);
  const loading = useConversationStore((s) => s.loading);
  const lists = useConversationStore((s) => s.lists);
  const totalUnread = useConversationStore((s) => s.totalUnread());
  const setNewChatOpen = useUIStore((s) => s.setNewChatOpen);
  const items = useConversationList(filter, query.trim());

  const listKey = filter === "archived" ? "archived" : "all";
  const { loaded, nextCursor } = lists[listKey];

  useEffect(() => {
    fetchList(listKey);
  }, [fetchList, listKey]);

  return (
    <>
      <header className="px-3 pt-3 pb-2 space-y-3">
        <div className="flex items-center justify-between px-1">
          <Link to="/" className="flex items-center gap-2" aria-label="Ghosted home">
            <span className="size-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <Ghost className="size-5 text-primary" />
            </span>
            <span className="text-lg font-bold tracking-tight">Ghosted</span>
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-primary btn-sm btn-circle"
              onClick={() => setNewChatOpen(true)}
              aria-label="New chat"
              title="New chat"
            >
              <SquarePen className="size-4" />
            </button>
            <UserMenu user={authUser} />
          </div>
        </div>

        <label className="input input-sm w-full">
          <Search className="size-4 opacity-50" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search chats"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search chats"
          />
        </label>

        <div role="tablist" className="tabs tabs-box tabs-sm w-full" aria-label="Filter chats">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              className={`tab flex-1 gap-1 ${filter === tab.id ? "tab-active" : ""}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              {tab.id === "unread" && totalUnread > 0 && (
                <span className="badge badge-primary badge-xs">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-2" role="list" aria-label="Chats">
        {!loaded && loading[listKey] ? (
          <SidebarSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={filter === "archived" ? Archive : query ? Search : Inbox}
            title={
              query
                ? "No chats match"
                : filter === "unread"
                  ? "You're all caught up"
                  : filter === "archived"
                    ? "Nothing archived"
                    : "No conversations yet"
            }
            description={
              query
                ? "Try a different name or username."
                : filter === "all"
                  ? "Start a chat with someone to see it here."
                  : undefined
            }
            action={
              filter === "all" && !query ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setNewChatOpen(true)}
                >
                  <MessageSquarePlus className="size-4" /> New chat
                </button>
              ) : null
            }
            className="py-14"
          />
        ) : (
          items.map((c) => <ConversationItem key={c._id} conversation={c} />)
        )}
        {nextCursor && !query && (
          <button
            type="button"
            className="btn btn-ghost btn-sm w-[calc(100%-1rem)] mx-2 mt-1"
            onClick={() => fetchList(listKey, { more: true })}
            disabled={loading[listKey]}
          >
            Load more
          </button>
        )}
      </div>
    </>
  );
}
