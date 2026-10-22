import { useEffect, useState } from "react";
import { Search, Users, X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useDebounce } from "../hooks/useDebounce";
import SidebarSkeleton from "./skeletons/SidebarSkeleton";

const SidebarComponent = () => {
  const { getUsers, users, selectedUser, setSelectedUser, isUsersLoading, unread, typing } =
    useChatStore();
  const { onlineUsers, authUser } = useAuthStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    getUsers(debouncedQuery.trim());
  }, [getUsers, debouncedQuery]);

  const onlineCount = onlineUsers.filter((id) => id !== authUser?._id).length;
  const filteredUsers = showOnlineOnly
    ? users.filter((user) => onlineUsers.includes(user._id))
    : users;

  if (isUsersLoading && users.length === 0) return <SidebarSkeleton />;

  return (
    <aside className="h-full w-20 lg:w-72 border-r border-base-300 flex flex-col transition-all duration-200">
      <div className="border-b border-base-300 w-full p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="size-6" />
          <span className="font-medium hidden lg:block">Contacts</span>
        </div>

        <div className="relative hidden lg:block">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 pointer-events-none" />
          <input
            type="search"
            className="input input-bordered input-sm w-full pl-9 pr-8"
            placeholder="Search people"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search people"
          />
          {query && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-2">
          <label className="cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlineOnly}
              onChange={(e) => setShowOnlineOnly(e.target.checked)}
              className="checkbox checkbox-sm"
            />
            <span className="text-sm">Show online only</span>
          </label>
          <span className="text-xs text-base-content/50">({onlineCount} online)</span>
        </div>
      </div>

      <div className="overflow-y-auto w-full py-3" role="list">
        {filteredUsers.map((user) => {
          const isOnline = onlineUsers.includes(user._id);
          const unreadCount = unread[user._id] ?? 0;
          const isSelected = selectedUser?._id === user._id;
          return (
            <button
              key={user._id}
              role="listitem"
              onClick={() => setSelectedUser(user)}
              className={`w-full p-3 flex items-center gap-3 hover:bg-base-300 transition-colors ${
                isSelected ? "bg-base-300 ring-1 ring-base-300" : ""
              }`}
              aria-current={isSelected ? "true" : undefined}
            >
              <div className="relative mx-auto lg:mx-0">
                <img
                  src={user.avatar?.url || "/avatar.png"}
                  alt=""
                  className="size-12 object-cover rounded-full"
                />
                <span
                  className={`absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-base-100 ${
                    isOnline ? "bg-success" : "bg-base-content/30"
                  }`}
                  aria-hidden="true"
                />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 badge badge-primary badge-sm lg:hidden">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>

              <div className="hidden lg:flex flex-1 items-center min-w-0">
                <div className="text-left min-w-0 flex-1">
                  <div className={`truncate ${unreadCount > 0 ? "font-semibold" : "font-medium"}`}>
                    {user.fullname}
                  </div>
                  <div className="text-sm text-base-content/60 truncate">
                    {typing[user._id] ? (
                      <span className="text-primary">typing…</span>
                    ) : isOnline ? (
                      "Online"
                    ) : (
                      "Offline"
                    )}
                  </div>
                </div>
                {unreadCount > 0 && (
                  <span className="badge badge-primary badge-sm ml-2">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="text-center text-base-content/50 py-6 px-3 text-sm">
            {query
              ? "No one matches that search"
              : showOnlineOnly
                ? "No one is online right now"
                : "No other users yet"}
          </div>
        )}
      </div>
    </aside>
  );
};

export default SidebarComponent;
