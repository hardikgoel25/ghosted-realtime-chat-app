import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  LogOut,
  MessageSquare,
  Palette,
  Search,
  ShieldCheck,
  SquarePen,
  User,
  Wrench,
} from "lucide-react";
import { SYSTEM_THEME, THEMES } from "@ghosted/shared";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConversationStore } from "../../stores/useConversationStore";
import { useThemeStore } from "../../stores/useThemeStore";
import { useUIStore } from "../../stores/useUIStore";
import { conversationAvatarUser, conversationTitle } from "../conversations/conversationHelpers";
import Avatar from "../../components/ui/Avatar";
import Dialog from "../../components/ui/Dialog";

export default function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const setNewChatOpen = useUIStore((s) => s.setNewChatOpen);
  const me = useAuthStore((s) => s.authUser);
  const logout = useAuthStore((s) => s.logout);
  const byId = useConversationStore((s) => s.byId);
  const setTheme = useThemeStore((s) => s.setTheme);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  const items = useMemo(() => {
    if (!me) return [];
    const q = query.trim().toLowerCase();
    const run = (fn) => () => {
      setOpen(false);
      fn();
    };
    const conversations = Object.values(byId)
      .filter((c) => c.lastMessage || c.createdBy === me._id)
      .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      .map((c) => ({
        id: `c-${c._id}`,
        group: "Chats",
        label: conversationTitle(c, me._id),
        hint: c.me?.unread ? `${c.me.unread} unread` : "",
        avatar: conversationAvatarUser(c, me._id),
        keywords: c.participants.map((p) => p.user?.username ?? "").join(" "),
        run: run(() => navigate(`/c/${c._id}`)),
      }));
    const actions = [
      {
        id: "new",
        group: "Actions",
        label: "New chat",
        icon: SquarePen,
        run: run(() => setNewChatOpen(true)),
      },
      {
        id: "s-profile",
        group: "Settings",
        label: "Profile settings",
        icon: User,
        run: run(() => navigate("/settings/profile")),
      },
      {
        id: "s-appearance",
        group: "Settings",
        label: "Appearance",
        icon: Palette,
        run: run(() => navigate("/settings/appearance")),
      },
      {
        id: "s-notifications",
        group: "Settings",
        label: "Notifications",
        icon: Bell,
        run: run(() => navigate("/settings/notifications")),
      },
      {
        id: "s-privacy",
        group: "Settings",
        label: "Privacy",
        icon: ShieldCheck,
        run: run(() => navigate("/settings/privacy")),
      },
      {
        id: "s-account",
        group: "Settings",
        label: "Account & devices",
        icon: Wrench,
        run: run(() => navigate("/settings/account")),
      },
      ...[{ id: SYSTEM_THEME, label: "System" }, ...THEMES].map((t) => ({
        id: `t-${t.id}`,
        group: "Theme",
        label: `Theme: ${t.label}`,
        icon: Palette,
        keywords: "theme dark light",
        run: run(() => setTheme(t.id)),
      })),
      {
        id: "logout",
        group: "Actions",
        label: "Log out",
        icon: LogOut,
        run: run(async () => {
          await logout();
          navigate("/login", { replace: true });
        }),
      },
    ];
    const all = [...conversations, ...actions];
    if (!q) return all.slice(0, 12);
    return all
      .filter((i) => `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q))
      .slice(0, 14);
  }, [byId, me, query, navigate, setOpen, setNewChatOpen, setTheme, logout]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView?.({ block: "nearest" });
  }, [index]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[index]?.run();
    }
  };

  let lastGroup = null;

  return (
    <Dialog open={open} onClose={() => setOpen(false)} size="md">
      <label className="input w-full">
        <Search className="size-4 opacity-50" aria-hidden="true" />
        <input
          type="text"
          placeholder="Jump to a chat, a setting or a theme…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Command palette"
          autoFocus
        />
        <kbd className="kbd kbd-sm">esc</kbd>
      </label>
      <ul
        ref={listRef}
        className="mt-3 max-h-80 overflow-y-auto -mx-2"
        role="listbox"
        aria-label="Results"
      >
        {items.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-base-content/60">Nothing matches.</li>
        )}
        {items.map((item, i) => {
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          const Icon = item.icon;
          return (
            <li key={item.id} role="option" aria-selected={i === index}>
              {showGroup && (
                <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-base-content/50">
                  {item.group}
                </div>
              )}
              <button
                type="button"
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left ${i === index ? "bg-base-200" : "hover:bg-base-200/60"}`}
                onMouseEnter={() => setIndex(i)}
                onClick={item.run}
              >
                {item.avatar ? (
                  <Avatar user={item.avatar} size="xs" />
                ) : Icon ? (
                  <span className="size-7 rounded-lg bg-base-300 flex items-center justify-center">
                    <Icon className="size-4" />
                  </span>
                ) : (
                  <MessageSquare className="size-4" />
                )}
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && <span className="badge badge-primary badge-sm">{item.hint}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-base-content/50 mt-3 px-1">
        ↑↓ to move · Enter to open · Ctrl/⌘ K to toggle
      </p>
    </Dialog>
  );
}
