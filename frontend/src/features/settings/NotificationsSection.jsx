import { useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "../../stores/useAuthStore";
import {
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
} from "../../lib/notifications";
import { playReceiveSound } from "../../lib/sounds";
import Toggle from "../../components/ui/Toggle";

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
              : "Show a system notification when Ghosted is in the background"
          }
          checked={Boolean(prefs.desktop) && permission === "granted"}
          onChange={onDesktop}
          disabled={permission === "denied" || !notificationsSupported()}
        />
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
