import { useAuthStore } from "../../stores/useAuthStore";
import Toggle from "../../components/ui/Toggle";

export default function PrivacySection() {
  const privacy = useAuthStore((s) => s.authUser?.privacy) ?? {};
  const update = useAuthStore((s) => s.updatePrivacy);

  return (
    <div className="space-y-6">
      <div className="surface px-5 divide-y divide-base-300">
        <Toggle
          label="Show when I was last online"
          description="Others see 'Last seen …' when you are offline. Turn off to show only Offline."
          checked={privacy.showLastSeen !== false}
          onChange={(v) => update({ showLastSeen: v })}
        />
        <Toggle
          label="Read receipts"
          description="Let people see when you have read their messages. When off, you will not see theirs either."
          checked={privacy.readReceipts !== false}
          onChange={(v) => update({ readReceipts: v })}
        />
      </div>
      <p className="text-xs text-base-content/50">
        Your online status while you are actively connected is always visible.
      </p>
    </div>
  );
}
