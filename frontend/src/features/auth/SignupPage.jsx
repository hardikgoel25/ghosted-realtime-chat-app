import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AtSign, Check, Loader2, Lock, User, X } from "lucide-react";
import { GENDERS, LIMITS, signupSchema, usernameSchema } from "@ghosted/shared";
import { api } from "../../lib/api";
import { useDebounce } from "../../hooks/useDebounce";
import { useAuthStore } from "../../stores/useAuthStore";
import AuthLayout from "./AuthLayout";
import Field from "./Field";
import { usePasswordToggle } from "./usePasswordToggle";
import PasswordStrength from "./PasswordStrength";

const GENDER_LABELS = {
  male: "Male",
  female: "Female",
  other: "Other",
  "prefer not to say": "Prefer not to say",
};

export default function SignupPage() {
  const signup = useAuthStore((s) => s.signup);
  const isSigningUp = useAuthStore((s) => s.isSigningUp);
  const [form, setForm] = useState({ fullname: "", username: "", password: "", gender: "" });
  const [errors, setErrors] = useState({});
  const [availability, setAvailability] = useState(null); // null | checking | free | taken | invalid
  const [passwordType, passwordToggle] = usePasswordToggle();
  const debouncedUsername = useDebounce(form.username, 400);
  const strengthInputs = useMemo(
    () => [form.username, form.fullname],
    [form.username, form.fullname]
  );

  useEffect(() => {
    if (!debouncedUsername.trim()) return setAvailability(null);
    const parsed = usernameSchema.safeParse(debouncedUsername);
    if (!parsed.success) return setAvailability("invalid");
    let cancelled = false;
    setAvailability("checking");
    api
      .get("/users/check-username", { params: { u: parsed.data }, silent: true })
      .then(({ available }) => !cancelled && setAvailability(available ? "free" : "taken"))
      .catch(() => !cancelled && setAvailability(null));
    return () => {
      cancelled = true;
    };
  }, [debouncedUsername]);

  const field = (name) => ({
    value: form[name],
    onChange: (e) => {
      setForm({ ...form, [name]: e.target.value });
      if (errors[name]) setErrors({ ...errors, [name]: undefined });
    },
  });

  const submit = async (e) => {
    e.preventDefault();
    const result = signupSchema.safeParse(form);
    if (!result.success) {
      const next = {};
      for (const issue of result.error.issues) next[issue.path[0]] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    const outcome = await signup(result.data);
    if (!outcome.ok && outcome.error?.details) {
      const next = {};
      for (const d of outcome.error.details) next[d.path] ??= d.message;
      setErrors(next);
    }
  };

  const usernameHint =
    errors.username ||
    (availability === "taken"
      ? "That username is already taken"
      : availability === "free"
        ? "Username is available"
        : "3–25 characters: lowercase letters, numbers, dots or underscores");

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes less than a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="link link-primary">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field
          id="signup-fullname"
          label="Full name"
          icon={User}
          type="text"
          autoComplete="name"
          maxLength={LIMITS.FULLNAME_MAX}
          placeholder="John Doe"
          error={errors.fullname}
          {...field("fullname")}
        />
        <Field
          id="signup-username"
          label="Username"
          icon={AtSign}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={LIMITS.USERNAME_MAX}
          placeholder="john_doe"
          error={errors.username || (availability === "taken" ? " " : undefined)}
          hint={usernameHint}
          right={
            availability === "checking" ? (
              <Loader2 className="size-4 animate-spin opacity-50" />
            ) : availability === "free" ? (
              <Check className="size-4 text-success" aria-label="Available" />
            ) : availability === "taken" ? (
              <X className="size-4 text-error" aria-label="Taken" />
            ) : null
          }
          {...field("username")}
        />
        <div className="w-full">
          <label className="block text-sm font-medium mb-1.5" htmlFor="signup-gender">
            Gender
          </label>
          <select
            id="signup-gender"
            className={`select w-full ${errors.gender ? "select-error" : ""}`}
            {...field("gender")}
          >
            <option value="" disabled>
              Select gender
            </option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g]}
              </option>
            ))}
          </select>
          {errors.gender && <p className="text-xs mt-1 text-error">{errors.gender}</p>}
        </div>
        <Field
          id="signup-password"
          label="Password"
          icon={Lock}
          type={passwordType}
          autoComplete="new-password"
          maxLength={LIMITS.PASSWORD_MAX}
          placeholder="At least 8 characters"
          error={errors.password}
          hint="A few unrelated words make the strongest passwords."
          right={passwordToggle}
          {...field("password")}
        >
          <PasswordStrength password={form.password} userInputs={strengthInputs} />
        </Field>

        <button
          type="submit"
          className="btn btn-primary w-full mt-2"
          disabled={isSigningUp || availability === "taken"}
        >
          {isSigningUp ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
