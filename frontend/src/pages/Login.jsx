import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, User, Ghost } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import AuthImagePattern from "../components/AuthImagePattern";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ username: "", password: "" });
  const { login, isLoggingIn, disabledUsername } = useAuthStore();

  const handleSubmit = (e) => {
    e.preventDefault();
    login({ username: formData.username.trim(), password: formData.password });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 pt-16">
      <div className="flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center mb-8">
            <div className="flex flex-col items-center gap-2 group">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Ghost className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mt-2">Welcome Back</h1>
              <p className="text-base-content/60">Sign in to your account</p>
            </div>
          </div>

          {disabledUsername && (
            <div role="alert" className="alert alert-warning text-sm">
              <span>
                The account <strong>{disabledUsername}</strong> is disabled.{" "}
                <Link to="/enable-account" className="link font-medium">
                  Re-enable it
                </Link>{" "}
                to continue.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="form-control">
              <label className="label" htmlFor="login-username">
                <span className="label-text font-medium">Username</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-base-content/40" />
                </div>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  className="input input-bordered w-full pl-10"
                  placeholder="john_doe"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-control">
              <label className="label" htmlFor="login-password">
                <span className="label-text font-medium">Password</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-base-content/40" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="input input-bordered w-full pl-10 pr-10"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-base-content/40" />
                  ) : (
                    <Eye className="h-5 w-5 text-base-content/40" />
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={isLoggingIn}>
              {isLoggingIn ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className="text-center">
            <p className="text-base-content/60">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="link link-primary">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>

      <AuthImagePattern
        title="Welcome back!"
        subtitle="Sign in to continue your conversations and catch up with your messages."
      />
    </div>
  );
};

export default Login;
