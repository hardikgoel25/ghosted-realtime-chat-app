import { WifiOff, RefreshCw } from "lucide-react";
import { useUIStore } from "../../stores/useUIStore";

export default function OfflineBanner() {
  const online = useUIStore((s) => s.online);
  const socketConnected = useUIStore((s) => s.socketConnected);
  const everConnected = useUIStore((s) => s.everConnected);

  if (online && (socketConnected || !everConnected)) return null;

  return (
    <div
      role="status"
      className="shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs bg-warning/15 text-warning-content border-b border-warning/30"
    >
      {online ? (
        <>
          <RefreshCw className="size-3.5 animate-spin" /> Reconnecting…
        </>
      ) : (
        <>
          <WifiOff className="size-3.5" /> You&apos;re offline. Messages will send once you&apos;re
          back.
        </>
      )}
    </div>
  );
}
