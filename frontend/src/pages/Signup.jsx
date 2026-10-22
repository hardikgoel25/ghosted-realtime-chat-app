import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, User, Ghost, Check, X } from "lucide-react";
import { GENDERS, LIMITS, signupSchema, usernameSchema } from "@ghosted/shared";
import { useAuthStore } from "../store/useAuthStore";
import { api } from "../lib/api";
import { useDebounce } from "../hooks/useDebounce";
import AuthImagePattern from "../components/AuthImagePattern";

const GENDER_LABELS = {
  male: "Male",
  female: "Female",
  other: "Other",
  "prefer not to say": "Prefer not to say",
};

const SignUpPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    fullname: "",
    username: "",
    password: "",
    gender: "",
  });
  const [errors, setErrors] = useState({});
  const [availability, setAvailability] = useState(null); // null | "checking" | "free" | "taken" | "invalid"
  const { signup, isSigningUp } = useAuthStore();

  const debouncedUsername = useDebounce(formData.username, 400);

  useEffect(() => {
    if (!debouncedUsername.trim()) {
      setAvailability(null);
      return;
    }
    const parsed = usernameSchema.safeParse(debouncedUsername);
    if (!parsed.success) {
      setAvailability("invalid");
      return;
    }
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

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = signupSchema.safeParse(formData);
    if (!result.success) {
      const next = {};
      for (const issue of result.error.issues) next[issue.path[0]] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    signup(result.data);
  };

  const field = (name) => ({
    value: formData[name],
    onChange: (e) => {
      setFormData({ ...formData, [name]: e.target.value });
      if (errors[name]) setErrors({ ...errors, [name]: undefined });
    },
  });

  return (
    <div className="min-h-screen grid lg:grid-cols-2 pt-16">
      <div className="flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center mb-8">
            <div className="flex flex-col items-center gap-2 group">
              <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Ghost className="size-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mt-2">Create Account</h1>
              <p className="text-base-content/60">Get started with your free account</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="form-control">
              <label className="label" htmlFor="signup-fullname">
                <span className="label-text font-medium">Full Name</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="size-5 text-base-content/40" />
                </div>
                <input
                  id="signup-fullname"
                  type="text"
                  autoComplete="name"
                  maxLength={LIMITS.FULLNAME_MAX}
                  className={`input input-bordered w-full pl-10 ${errors.fullname ? "input-error" : ""}`}
                  placeholder="John Doe"
                  {...field("fullname")}
                />
              </div>
              {errors.fullname && <p className="text-error text-xs mt-1">{errors.fullname}</p>}
            </div>

            <div className="form-control">
              <label className="label" htmlFor="signup-username">
                <span className="label-text font-medium">Username</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="size-5 text-base-content/40" />
                </div>
                <input
                  id="signup-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  maxLength={LIMITS.USERNAME_MAX}
                  className={`input input-bordered w-full pl-10 pr-10 ${errors.username || availability === "taken" ? "input-error" : ""}`}
                  placeholder="john_doe"
                  {...field("username")}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  {availability === "checking" && (
                    <Loader2 className="size-4 animate-spin text-base-content/40" />
                  )}
                  {availability === "free" && <Check className="size-4 text-success" />}
                  {availability === "taken" && <X className="size-4 text-error" />}
                </div>
              </div>
              <p
                className={`text-xs mt-1 ${errors.username || availability === "taken" ? "text-error" : "text-base-content/50"}`}
              >
                {errors.username ||
                  (availability === "taken"
                    ? "That username is already taken"
                    : availability === "free"
                      ? "Username is available"
                      : "3–25 characters: lowercase letters, numbers, dots or underscores")}
              </p>
            </div>

            <div className="form-control">
              <label className="label" htmlFor="signup-gender">
                <span className="label-text font-medium">Gender</span>
              </label>
              <select
                id="signup-gender"
                className={`select select-bordered w-full ${errors.gender ? "select-error" : ""}`}
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
              {errors.gender && <p className="text-error text-xs mt-1">{errors.gender}</p>}
            </div>

            <div className="form-control">
              <label className="label" htmlFor="signup-password">
                <span className="label-text font-medium">Password</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="size-5 text-base-content/40" />
                </div>
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  maxLength={LIMITS.PASSWORD_MAX}
                  className={`input input-bordered w-full pl-10 pr-10 ${errors.password ? "input-error" : ""}`}
                  placeholder="At least 8 characters"
                  {...field("password")}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-5 text-base-content/40" />
                  ) : (
                    <Eye className="size-5 text-base-content/40" />
                  )}
                </button>
              </div>
              <p
                className={`text-xs mt-1 ${errors.password ? "text-error" : "text-base-content/50"}`}
              >
                {errors.password ||
                  "Use a passphrase or a mix of words, numbers and symbols. Common passwords are rejected."}
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={isSigningUp || availability === "taken"}
            >
              {isSigningUp ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="text-center">
            <p className="text-base-content/60">
              Already have an account?{" "}
              <Link to="/login" className="link link-primary">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      <AuthImagePattern
        title="Join our community"
        subtitle="Connect with friends, share moments, and stay in touch with your loved ones."
      />
    </div>
  );
};

export default SignUpPage;
