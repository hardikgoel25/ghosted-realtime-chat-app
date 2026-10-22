import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { LIMITS } from "@ghosted/shared";
import { useAuthStore } from "../store/useAuthStore";

export default function AccountSettings() {
  const navigate = useNavigate();
  const {
    authUser,
    disableAccount,
    deleteAccount,
    changePassword,
    isDisablingAccount,
    isDeletingAccount,
  } = useAuthStore();

  const [modal, setModal] = useState(null); // null | "disable" | "delete"
  const [password, setPassword] = useState("");
  const [agreementText, setAgreementText] = useState("");

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  if (!authUser) return null;

  const resetModal = () => {
    setPassword("");
    setAgreementText("");
    setModal(null);
  };

  const handleConfirm = async () => {
    if (!password) return;
    if (modal === "delete" && agreementText !== "I agree") return;
    const ok = modal === "delete" ? await deleteAccount(password) : await disableAccount(password);
    resetModal();
    if (ok) navigate("/login", { replace: true });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return;
    setIsChangingPassword(true);
    const ok = await changePassword({
      currentPassword: pw.currentPassword,
      newPassword: pw.newPassword,
    });
    setIsChangingPassword(false);
    if (ok) setPw({ currentPassword: "", newPassword: "", confirm: "" });
  };

  const pwMismatch = pw.confirm.length > 0 && pw.newPassword !== pw.confirm;
  const busy = isDisablingAccount || isDeletingAccount;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Account Settings</h2>
        <p className="text-sm text-base-content/70">
          Manage your password, account status and data.
        </p>
      </div>

      <form
        onSubmit={handleChangePassword}
        className="border border-base-300 rounded-lg p-4 bg-base-100 space-y-3"
      >
        <h3 className="text-md font-medium">Change password</h3>
        <p className="text-sm text-base-content/70">
          Changing your password signs you out of every other device.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Current password"
            className="input input-bordered input-sm w-full"
            value={pw.currentPassword}
            onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
            maxLength={LIMITS.PASSWORD_MAX}
            required
          />
          <input
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            placeholder="New password"
            className="input input-bordered input-sm w-full"
            value={pw.newPassword}
            onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
            minLength={LIMITS.PASSWORD_MIN}
            maxLength={LIMITS.PASSWORD_MAX}
            required
          />
          <input
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Confirm new password"
            className={`input input-bordered input-sm w-full ${pwMismatch ? "input-error" : ""}`}
            value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            maxLength={LIMITS.PASSWORD_MAX}
            required
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="btn btn-sm btn-primary"
            disabled={isChangingPassword || pwMismatch}
          >
            {isChangingPassword ? <Loader2 className="size-4 animate-spin" /> : "Update password"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost gap-1"
            onClick={() => setShowPw((v) => !v)}
          >
            {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showPw ? "Hide" : "Show"}
          </button>
          {pwMismatch && <span className="text-error text-xs">Passwords do not match</span>}
        </div>
      </form>

      <div className="border border-base-300 rounded-lg p-4 bg-base-100">
        <h3 className="text-md font-medium mb-1">Disable Account</h3>
        <p className="text-sm text-base-content/70 mb-4">
          Temporarily deactivate your account. Others will no longer see you or message you. You can
          reactivate it at any time from the login page.
        </p>
        <button
          className="btn btn-outline btn-warning"
          onClick={() => setModal("disable")}
          disabled={busy}
        >
          {isDisablingAccount ? "Disabling..." : "Disable Account"}
        </button>
      </div>

      <div className="border border-error/40 rounded-lg p-4 bg-base-100">
        <h3 className="text-md font-medium mb-1 text-error">Delete Account</h3>
        <p className="text-sm text-base-content/70 mb-4">
          Permanently delete your account, your messages and your uploaded images. This cannot be
          undone.
        </p>
        <button
          className="btn btn-error text-error-content"
          onClick={() => setModal("delete")}
          disabled={busy}
        >
          {isDeletingAccount ? "Deleting..." : "Delete Account"}
        </button>
      </div>

      {modal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-base-100 rounded-lg shadow-lg p-6 w-full max-w-md space-y-4 border border-base-300">
            <h2
              className={`text-xl font-semibold ${modal === "delete" ? "text-error" : "text-warning"}`}
            >
              {modal === "delete" ? "Confirm Deletion" : "Confirm Disable"}
            </h2>
            <p className="text-sm">
              {modal === "delete"
                ? "This will permanently delete your account and all of its data."
                : "This will disable your account until you re-enable it from the login page."}
            </p>
            <p className="text-sm font-medium text-warning">Enter your password to confirm.</p>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              className="input input-bordered w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {modal === "delete" && (
              <input
                type="text"
                placeholder='Type "I agree" to confirm'
                className="input input-bordered w-full"
                value={agreementText}
                onChange={(e) => setAgreementText(e.target.value)}
              />
            )}
            <div className="flex justify-end space-x-3">
              <button className="btn btn-ghost" onClick={resetModal} disabled={busy}>
                Cancel
              </button>
              <button
                className={`btn ${modal === "delete" ? "btn-error text-error-content" : "btn-warning"}`}
                onClick={handleConfirm}
                disabled={busy || !password || (modal === "delete" && agreementText !== "I agree")}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : modal === "delete" ? (
                  "Confirm Delete"
                ) : (
                  "Confirm Disable"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
