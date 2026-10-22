import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import AuthImagePattern from "../components/AuthImagePattern";

const EnableAccount = () => {
  const navigate = useNavigate();
  const { disabledUsername, enableAccount, isEnablingAccount } = useAuthStore();
  const [username, setUsername] = useState(disabledUsername ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleEnable = async (e) => {
    e.preventDefault();
    const ok = await enableAccount({ username: username.trim(), password });
    if (ok) navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 pt-16">
      <div className="flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2">Enable Your Account</h1>
            <p className="text-base-content/70">
              Enter your credentials to reactivate a disabled account. You will be signed in
              straight away.
            </p>
          </div>

          <form onSubmit={handleEnable} className="space-y-5">
            <div className="form-control">
              <label className="label" htmlFor="enable-username">
                <span className="label-text font-medium">Username</span>
              </label>
              <input
                id="enable-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                className="input input-bordered w-full"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="form-control">
              <label className="label" htmlFor="enable-password">
                <span className="label-text font-medium">Password</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-base-content/40" />
                </div>
                <input
                  id="enable-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="input input-bordered w-full pl-10 pr-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <button type="submit" className="btn btn-primary w-full" disabled={isEnablingAccount}>
              {isEnablingAccount ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Enabling...
                </>
              ) : (
                "Enable account and sign in"
              )}
            </button>
          </form>

          <p className="text-center">
            <Link to="/login" className="link link-primary">
              Back to Login
            </Link>
          </p>
        </div>
      </div>

      <AuthImagePattern
        title="Enable Account"
        subtitle="Reactivate your account and pick up your conversations where you left them."
      />
    </div>
  );
};

export default EnableAccount;
