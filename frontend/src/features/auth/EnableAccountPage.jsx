import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock, User } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import AuthLayout from "./AuthLayout";
import Field from "./Field";
import { usePasswordToggle } from "./usePasswordToggle";

export default function EnableAccountPage() {
  const disabledUsername = useAuthStore((s) => s.disabledUsername);
  const enableAccount = useAuthStore((s) => s.enableAccount);
  const isEnablingAccount = useAuthStore((s) => s.isEnablingAccount);
  const [username, setUsername] = useState(disabledUsername ?? "");
  const [password, setPassword] = useState("");
  const [passwordType, passwordToggle] = usePasswordToggle();

  const submit = (e) => {
    e.preventDefault();
    enableAccount({ username: username.trim(), password });
  };

  return (
    <AuthLayout
      title="Re-enable your account"
      subtitle="Enter your credentials to reactivate a disabled account. You'll be signed in right away."
      footer={
        <Link to="/login" className="link link-primary">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field
          id="enable-username"
          label="Username"
          icon={User}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <Field
          id="enable-password"
          label="Password"
          icon={Lock}
          type={passwordType}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          right={passwordToggle}
          required
        />
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={isEnablingAccount || !username.trim() || !password}
        >
          {isEnablingAccount ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Enabling…
            </>
          ) : (
            "Enable account and sign in"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
