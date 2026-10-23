import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock, User } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import AuthLayout from "./AuthLayout";
import Field from "./Field";
import TwoFactorStep from "./TwoFactorStep";
import { usePasswordToggle } from "./usePasswordToggle";

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);
  const disabledUsername = useAuthStore((s) => s.disabledUsername);
  const twoFactorChallenge = useAuthStore((s) => s.twoFactorChallenge);
  const emailEnabled = useAuthStore((s) => s.config?.emailEnabled);
  const [form, setForm] = useState({ username: "", password: "" });
  const [passwordType, passwordToggle] = usePasswordToggle();

  const submit = (e) => {
    e.preventDefault();
    login({ username: form.username.trim(), password: form.password });
  };

  if (twoFactorChallenge?.intent === "login") {
    return (
      <AuthLayout title="Two-factor check" subtitle="One more step to keep your account safe.">
        <TwoFactorStep />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up your conversations."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="link link-primary">
            Create one
          </Link>
        </>
      }
    >
      {disabledUsername && (
        <div role="alert" className="alert alert-warning text-sm mb-5">
          <span>
            The account <strong>{disabledUsername}</strong> is disabled.{" "}
            <Link to="/enable-account" className="link font-medium">
              Re-enable it
            </Link>{" "}
            to continue.
          </span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field
          id="login-username"
          label="Username"
          icon={User}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="john_doe"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          required
        />
        <Field
          id="login-password"
          label="Password"
          icon={Lock}
          type={passwordType}
          autoComplete="current-password"
          placeholder="Your password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          right={passwordToggle}
          required
        >
          {emailEnabled && (
            <div className="text-right mt-1.5">
              <Link to="/forgot-password" className="link link-primary text-xs">
                Forgot password?
              </Link>
            </div>
          )}
        </Field>
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={isLoggingIn || !form.username.trim() || !form.password}
        >
          {isLoggingIn ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
