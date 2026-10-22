import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MailCheck, User } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import AuthLayout from "./AuthLayout";
import Field from "./Field";

export default function ForgotPasswordPage() {
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const config = useAuthStore((s) => s.config);
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await forgotPassword(identifier.trim());
    setBusy(false);
    if (ok) setSent(true);
  };

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your username or email and we'll send a reset link to your verified address."
      footer={
        <Link to="/login" className="link link-primary">
          Back to sign in
        </Link>
      }
    >
      {config && !config.emailEnabled ? (
        <div role="alert" className="alert alert-warning text-sm">
          Password reset by email is not enabled on this server. Contact the person running it.
        </div>
      ) : sent ? (
        <div className="surface p-6 flex flex-col items-center text-center gap-3">
          <MailCheck className="size-8 text-success" />
          <p className="font-medium">Check your inbox</p>
          <p className="text-sm text-base-content/70">
            If that account has a verified email address, a reset link is on its way. It works for
            one hour.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field
            id="forgot-identifier"
            label="Username or email"
            icon={User}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={busy || !identifier.trim()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
