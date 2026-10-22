import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import ConversationSidebar from "../features/conversations/ConversationSidebar";
import NewChatDialog from "../features/conversations/NewChatDialog";
import CommandPalette from "../features/palette/CommandPalette";
import OfflineBanner from "../components/ui/OfflineBanner";
import Spinner from "../components/ui/Spinner";
import { useUIStore } from "../stores/useUIStore";

function useGlobalHotkeys() {
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!useUIStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);
}

/**
 * Two-pane shell. On phones only one pane is visible at a time and the URL decides which:
 * "/" shows the conversation list, everything else shows the page.
 */
export default function AppShell() {
  const { pathname } = useLocation();
  const listOnly = pathname === "/";
  useGlobalHotkeys();

  return (
    <div className="h-dvh w-full flex bg-base-200 overflow-hidden">
      <aside
        className={`${listOnly ? "flex" : "hidden"} md:flex w-full md:w-80 lg:w-[22rem] shrink-0 flex-col border-r border-base-300 bg-base-100`}
        aria-label="Conversations"
      >
        <ConversationSidebar />
      </aside>

      <main
        className={`${listOnly ? "hidden md:flex" : "flex"} flex-1 min-w-0 flex-col bg-base-100 relative`}
      >
        <OfflineBanner />
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <Spinner size="lg" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <NewChatDialog />
      <CommandPalette />
    </div>
  );
}
