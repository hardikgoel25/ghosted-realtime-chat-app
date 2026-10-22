import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import Avatar from "../../components/ui/Avatar";
import Toggle from "../../components/ui/Toggle";

export default function PrivacySection() {
  const privacy = useAuthStore((s) => s.authUser?.privacy) ?? {};
  const update = useAuthStore((s) => s.updatePrivacy);
  const blocked = useAuthStore((s) => s.blocked);
  const fetchBlocked = useAuthStore((s) => s.fetchBlocked);
  const unblock = useAuthStore((s) => s.unblock);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

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

      <div className="surface p-5">
        <h3 className="font-medium">Blocked users</h3>
        <p className="text-sm text-base-content/60 mb-3">
          Blocked people cannot message you or find you in search, and you do not see each
          other&apos;s online status.
        </p>
        {blocked.length === 0 ? (
          <p className="text-sm text-base-content/50 py-2">You have not blocked anyone.</p>
        ) : (
          <ul className="divide-y divide-base-300">
            {blocked.map((u) => (
              <li key={u._id} className="py-2.5 flex items-center gap-3">
                <Avatar user={u} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate">{u.fullname}</span>
                  <span className="block text-xs text-base-content/60">@{u.username}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={busy === u._id}
                  onClick={async () => {
                    setBusy(u._id);
                    await unblock(u._id);
                    setBusy(null);
                  }}
                >
                  <ShieldCheck className="size-3.5" /> Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-base-content/50">
        Your online status while you are actively connected is always visible to people you have not
        blocked.
      </p>
    </div>
  );
}
