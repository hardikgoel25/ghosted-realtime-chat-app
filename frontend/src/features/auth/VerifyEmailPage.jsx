import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MailCheck, MailX } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import AuthLayout from "./AuthLayout";
import Spinner from "../../components/ui/Spinner";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const authUser = useAuthStore((s) => s.authUser);
  const [state, setState] = useState({ status: "pending" });

  useEffect(() => {
    let cancelled = false;
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      setState({ status: "error", message: "This verification link is incomplete." });
      return;
    }
    verifyEmail(token).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ok", email: result.email }
          : { status: "error", message: result.message }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [token, verifyEmail]);

  return (
    <AuthLayout title="Email verification">
      <div className="surface p-6 flex flex-col items-center text-center gap-3">
        {state.status === "pending" && <Spinner size="lg" label="Verifying" />}
        {state.status === "ok" && (
          <>
            <MailCheck className="size-8 text-success" />
            <p className="font-medium">{state.email} is verified</p>
            <p className="text-sm text-base-content/70">
              You can now use it to reset your password.
            </p>
          </>
        )}
        {state.status === "error" && (
          <>
            <MailX className="size-8 text-error" />
            <p className="font-medium">Verification failed</p>
            <p className="text-sm text-base-content/70">{state.message}</p>
          </>
        )}
        <Link
          to={authUser ? "/settings/profile" : "/login"}
          className="btn btn-primary btn-sm mt-2"
        >
          {authUser ? "Back to settings" : "Sign in"}
        </Link>
      </div>
    </AuthLayout>
  );
}
