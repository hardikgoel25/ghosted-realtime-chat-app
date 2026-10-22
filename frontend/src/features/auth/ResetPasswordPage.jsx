import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { LIMITS, emailTokenSchema, newPasswordSchema } from "@ghosted/shared";
import { useAuthStore } from "../../stores/useAuthStore";
import AuthLayout from "./AuthLayout";
import Field from "./Field";
import PasswordStrength from "./PasswordStrength";
import { usePasswordToggle } from "./usePasswordToggle";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [type, toggle] = usePasswordToggle();
  const validToken = useMemo(() => emailTokenSchema.safeParse(token).success, [token]);
  const inputs = useMemo(() => [], []);

  const submit = async (e) => {
    e.preventDefault();
    const parsed = newPasswordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (password !== confirm) return setError("Passwords do not match");
    setError("");
    setBusy(true);
    const result = await resetPassword(token, password);
    setBusy(false);
    if (result.ok) {
      toast.success("Password updated. Sign in with it now.");
      navigate("/login", { replace: true });
    } else {
      setError(
        result.error?.details?.[0]?.message ??
          result.error?.message ??
          "Could not reset the password"
      );
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="This signs you out of every device."
      footer={
        <Link to="/login" className="link link-primary">
          Back to sign in
        </Link>
      }
    >
      {!validToken ? (
        <div role="alert" className="alert alert-error text-sm">
          This reset link is incomplete. Open the link from the email again, or{" "}
          <Link to="/forgot-password" className="link">
            request a new one
          </Link>
          .
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field
            id="reset-password"
            label="New password"
            icon={Lock}
            type={type}
            autoComplete="new-password"
            maxLength={LIMITS.PASSWORD_MAX}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            right={toggle}
            error={error}
            required
          >
            <PasswordStrength password={password} userInputs={inputs} />
          </Field>
          <Field
            id="reset-confirm"
            label="Confirm new password"
            icon={Lock}
            type={type}
            autoComplete="new-password"
            maxLength={LIMITS.PASSWORD_MAX}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={busy || !password || !confirm}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              "Set new password"
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
