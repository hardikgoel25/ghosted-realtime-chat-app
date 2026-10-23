import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, Monitor, Smartphone } from "lucide-react";
import { LIMITS } from "@ghosted/shared";
import { useAuthStore } from "../../stores/useAuthStore";
import { relativeTime } from "../../lib/format";
import { usePasswordToggle } from "../auth/usePasswordToggle";
import Dialog from "../../components/ui/Dialog";
import Spinner from "../../components/ui/Spinner";
import TwoFactorCard from "./TwoFactorCard";

function describeAgent(ua = "") {
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return { mobile, label: [browser, os].filter(Boolean).join(" on ") };
}

function SessionsList() {
  const fetchSessions = useAuthStore((s) => s.fetchSessions);
  const revokeSession = useAuthStore((s) => s.revokeSession);
  const logoutAll = useAuthStore((s) => s.logoutAll);
  const [sessions, setSessions] = useState(null);
  const [busy, setBusy] = useState(null);
  const navigate = useNavigate();

  const refresh = async () => setSessions(await fetchSessions());
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Devices</h3>
          <p className="text-sm text-base-content/60">Where you are signed in right now.</p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={async () => {
            if (await logoutAll()) navigate("/login", { replace: true });
          }}
        >
          <LogOut className="size-4" /> Sign out everywhere
        </button>
      </div>
      {sessions === null ? (
        <div className="py-4 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <ul className="divide-y divide-base-300">
          {sessions.map((s) => {
            const { mobile, label } = describeAgent(s.userAgent);
            const Icon = mobile ? Smartphone : Monitor;
            return (
              <li key={s._id} className="py-3 flex items-center gap-3">
                <Icon className="size-5 opacity-60 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {label}
                    {s.current && (
                      <span className="badge badge-primary badge-xs ml-2">This device</span>
                    )}
                  </div>
                  <div className="text-xs text-base-content/60">
                    Active {relativeTime(s.lastUsedAt)}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </div>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    disabled={busy === s._id}
                    onClick={async () => {
                      setBusy(s._id);
                      await revokeSession(s._id);
                      await refresh();
                      setBusy(null);
                    }}
                  >
                    {busy === s._id ? <Loader2 className="size-3 animate-spin" /> : "Sign out"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChangePassword() {
  const changePassword = useAuthStore((s) => s.changePassword);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [type, toggle] = usePasswordToggle();
  const mismatch = form.confirm.length > 0 && form.newPassword !== form.confirm;

  const submit = async (e) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    const ok = await changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    setBusy(false);
    if (ok) setForm({ currentPassword: "", newPassword: "", confirm: "" });
  };

  return (
    <form onSubmit={submit} className="surface p-5 space-y-3">
      <div>
        <h3 className="font-medium">Change password</h3>
        <p className="text-sm text-base-content/60">Signs you out of every other device.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          type={type}
          autoComplete="current-password"
          placeholder="Current password"
          className="input input-sm w-full"
          value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          maxLength={LIMITS.PASSWORD_MAX}
          required
          aria-label="Current password"
        />
        <input
          type={type}
          autoComplete="new-password"
          placeholder="New password"
          className="input input-sm w-full"
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          minLength={LIMITS.PASSWORD_MIN}
          maxLength={LIMITS.PASSWORD_MAX}
          required
          aria-label="New password"
        />
        <input
          type={type}
          autoComplete="new-password"
          placeholder="Confirm new password"
          className={`input input-sm w-full ${mismatch ? "input-error" : ""}`}
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          maxLength={LIMITS.PASSWORD_MAX}
          required
          aria-label="Confirm new password"
        />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || mismatch}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Update password"}
        </button>
        {toggle}
        {mismatch && <span className="text-error text-xs">Passwords do not match</span>}
      </div>
    </form>
  );
}

function DangerZone() {
  const navigate = useNavigate();
  const disableAccount = useAuthStore((s) => s.disableAccount);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const isDisablingAccount = useAuthStore((s) => s.isDisablingAccount);
  const isDeletingAccount = useAuthStore((s) => s.isDeletingAccount);
  const [modal, setModal] = useState(null); // null | "disable" | "delete"
  const [password, setPassword] = useState("");
  const [agreement, setAgreement] = useState("");
  const busy = isDisablingAccount || isDeletingAccount;

  const reset = () => {
    setPassword("");
    setAgreement("");
    setModal(null);
  };

  const confirm = async () => {
    if (!password) return;
    if (modal === "delete" && agreement !== "I agree") return;
    const ok = modal === "delete" ? await deleteAccount(password) : await disableAccount(password);
    reset();
    if (ok) navigate("/login", { replace: true });
  };

  return (
    <div className="surface p-5 space-y-5 border-error/30">
      <div>
        <h3 className="font-medium">Disable account</h3>
        <p className="text-sm text-base-content/60 mb-3">
          Others stop seeing you and cannot message you. Re-enable it any time from the login page.
        </p>
        <button
          type="button"
          className="btn btn-outline btn-warning btn-sm"
          onClick={() => setModal("disable")}
          disabled={busy}
        >
          Disable account
        </button>
      </div>
      <div>
        <h3 className="font-medium text-error">Delete account</h3>
        <p className="text-sm text-base-content/60 mb-3">
          Permanently deletes your account, your chats and your uploaded images. This cannot be
          undone.
        </p>
        <button
          type="button"
          className="btn btn-error btn-sm"
          onClick={() => setModal("delete")}
          disabled={busy}
        >
          Delete account
        </button>
      </div>

      <Dialog
        open={modal !== null}
        onClose={reset}
        title={modal === "delete" ? "Delete your account?" : "Disable your account?"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${modal === "delete" ? "btn-error" : "btn-warning"}`}
              onClick={confirm}
              disabled={busy || !password || (modal === "delete" && agreement !== "I agree")}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : modal === "delete" ? (
                "Delete"
              ) : (
                "Disable"
              )}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">
            {modal === "delete"
              ? "Everything you have sent and shared will be removed."
              : "You can re-enable it later by signing in with your password."}
          </p>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Confirm with your password"
            className="input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
          />
          {modal === "delete" && (
            <input
              type="text"
              placeholder='Type "I agree" to confirm'
              className="input w-full"
              value={agreement}
              onChange={(e) => setAgreement(e.target.value)}
              aria-label="Confirmation phrase"
            />
          )}
        </div>
      </Dialog>
    </div>
  );
}

export default function AccountSection() {
  return (
    <div className="space-y-6">
      <ChangePassword />
      <TwoFactorCard />
      <SessionsList />
      <DangerZone />
    </div>
  );
}
