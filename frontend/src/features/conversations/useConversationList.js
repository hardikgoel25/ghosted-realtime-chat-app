import { useMemo } from "react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { matchesQuery, sortConversations } from "./conversationHelpers";

/** Conversations for a sidebar tab, filtered by the search box and sorted (pinned first). */
export function useConversationList(filter, query = "") {
  const meId = useAuthStore((s) => s.authUser?._id);
  const byId = useConversationStore((s) => s.byId);
  const lists = useConversationStore((s) => s.lists);

  return useMemo(() => {
    const key = filter === "archived" ? "archived" : "all";
    let items = lists[key].ids.map((id) => byId[id]).filter(Boolean);
    if (filter === "unread") items = items.filter((c) => (c.me?.unread ?? 0) > 0);
    if (query) items = items.filter((c) => matchesQuery(c, meId, query));
    return sortConversations(items);
  }, [byId, lists, filter, query, meId]);
}
