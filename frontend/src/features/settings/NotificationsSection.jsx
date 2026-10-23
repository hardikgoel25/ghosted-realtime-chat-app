import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Smartphone } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import {
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
} from "../../lib/notifications";
import { currentPushSubscription, disablePush, enablePush, pushSupported } from "../../lib/push";
import { canInstall, isStandalone, onInstallAvailable, promptInstall } from "../../lib/pwa";
import { playReceiveSound } from "../../lib/sounds";
import Toggle from "../../components/ui/Toggle";

function PushToggle() {
  const vapidKey = useAuthStore((s) => s.config?.push?.vapidPublicKey ?? null);
  const [state, setState] = useState("loading"); // loading | on | off | unsupported
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported() || !vapidKey) return setState("unsupported");
    let cancelled = false;
    currentPushSubscription().then((sub) => !cancelled && setState(sub ? "on" : "off"));
    return () => {
      cancelled = true;
    };
  }, [vapidKey]);

  if (!vapidKey) return null;

  const onChange = async (enabled) => {
    setBusy(true);
    try {
      if (enabled) {
        const result = await enablePush(vapidKey);
        if (result === "granted") setState("on");
        else if (result === "denied")
          toast.error("Notifications are blocked in your browser settings");
        else toast.error("This browser cannot receive push notifications");
      } else {
        await disablePush();
        setState("off");
      }
    } catch {
      // toast shown by the API client
    } finally {
      setBusy(false);
    }
  };

  return (
    <Toggle
      label="Push notifications on this device"
      description={
        state === "unsupported"
          ? "Not available in this browser. Install Ghosted or use a recent Chrome, Edge, Firefox or Safari."
          : "Get notified about new messages even when Ghosted is closed"
      }
      checked={state === "on"}
      onChange={onChange}
      disabled={busy || state === "loading" || state === "unsupported"}
    />
  );
}

function InstallCard() {
  const [available, setAvailable] = useState(canInstall());
  useEffect(() => onInstallAvailable(setAvailable), []);
  if (isStandalone() || !available) return null;
  return (
    <div className="surface p-5 flex items-center gap-4">
      <span className="size-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
        <Smartphone className="size-5 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium">Install Ghosted</h3>
        <p className="text-sm text-base-content/60">
          Add it to your home screen or dock for a full-screen app that opens instantly.
        </p>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={promptInstall}>
        <Download className="size-4" /> Install
      </button>
    </div>
  );
}

export default function NotificationsSection() {
  const prefs = useAuthStore((s) => s.authUser?.notificationPrefs) ?? {};
  const update = useAuthStore((s) => s.updateNotificationPrefs);
  const [permission, setPermission] = useState(notificationPermission());

  const onDesktop = async (enabled) => {
    if (enabled) {
      if (!notificationsSupported())
        return toast.error("This browser does not support notifications");
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result !== "granted")
        return toast.error("Notifications are blocked in your browser settings");
    }
    await update({ desktop: enabled });
  };

  return (
    <div className="space-y-6">
      <InstallCard />
      <div className="surface px-5 divide-y divide-base-300">
        <Toggle
          label="Sounds"
          description="Play a sound for new messages and when you send one"
          checked={prefs.sound !== false}
          onChange={(v) => {
            update({ sound: v });
            if (v) playReceiveSound();
          }}
        />
        <Toggle
          label="Desktop notifications"
          description={
            permission === "denied"
              ? "Blocked by your browser. Allow notifications for this site to turn them on."
              : "Show a system notification when Ghosted is open in the background"
          }
          checked={Boolean(prefs.desktop) && permission === "granted"}
          onChange={onDesktop}
          disabled={permission === "denied" || !notificationsSupported()}
        />
        <PushToggle />
        <Toggle
          label="Show message preview"
          description="Include the message text in notifications instead of just the sender"
          checked={prefs.preview !== false}
          onChange={(v) => update({ preview: v })}
        />
      </div>
      <p className="text-xs text-base-content/50">
        Muted chats never notify. You can mute a chat from its menu or details panel.
      </p>
    </div>
  );
}
