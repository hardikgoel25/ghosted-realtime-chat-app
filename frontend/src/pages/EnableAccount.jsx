import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { Link, useNavigate } from "react-router-dom";
import AuthImagePattern from "../components/AuthImagePattern";
import { Loader2, CheckCircle, AlertTriangle, Lock, Eye, EyeOff } from "lucide-react";

const EnableAccount = () => {
    const navigate = useNavigate();
    const { cachedLoginUsername, enableAccount, isEnablingAccount } = useAuthStore();

    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    if (!cachedLoginUsername) {
        return (
            <div className="flex flex-col items-center justify-center h-screen p-6">
                <p className="mb-4 text-center text-red-600">
                    No account information found. Please <Link to="/login" className="underline text-primary">login</Link> first.
                </p>
            </div>
        );
    }

    const handleEnable = async (e) => {
        e.preventDefault();
        setError("");
        if (!password) {
            setError("Please enter your password to enable your account.");
            return;
        }
        try {
            await enableAccount({ username: cachedLoginUsername, password });
            setSuccess(true);
            setTimeout(() => {
                navigate("/login");
            }, 3000);
        } catch (err) {
            setError(err.message || "Failed to enable your account. Please check your password and try again.");
        }
    };

    return (
        <div className="h-screen grid lg:grid-cols-2">
            {/* Left Side - Enable Account Form */}
            <div className="flex flex-col justify-center items-center p-6 sm:p-12">
                <div className="w-full max-w-md space-y-8 text-center">
                    <h1 className="text-3xl font-bold mb-4">Enable Your Account</h1>
                    <p className="text-base-content/70 mb-6">
                        Your account <strong>{cachedLoginUsername}</strong> has been disabled.
                        Enter your password to reactivate your account.
                    </p>

                    {error && (
                        <div className="mb-4 flex items-center gap-2 text-red-600 font-medium">
                            <AlertTriangle className="w-5 h-5" /> {error}
                        </div>
                    )}

                    {success ? (
                        <div className="mb-4 flex items-center gap-2 text-green-600 font-medium">
                            <CheckCircle className="w-5 h-5" /> Your account has been enabled! Redirecting to login...
                        </div>
                    ) : (
                        <form onSubmit={handleEnable} className="space-y-6 text-left">
                            <label className="block font-medium mb-1" htmlFor="password">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    className="input input-bordered w-full pr-10"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-5 w-5 text-base-content/40" />
                                    ) : (
                                        <Eye className="h-5 w-5 text-base-content/40" />
                                    )}
                                </button>
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary w-full"
                                disabled={isEnablingAccount}
                            >
                                {isEnablingAccount ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Enabling...
                                    </>
                                ) : (
                                    "Enable Account"
                                )}
                            </button>
                        </form>
                    )}

                    <Link to="/login" className="link link-primary mt-6 inline-block">
                        Back to Login
                    </Link>
                </div>
            </div>

            {/* Right Side - Image/Pattern */}
            <AuthImagePattern
                title={"Enable Account"}
                subtitle={"Enter your password to reactivate your account and continue your conversations."}
            />
        </div>
    );
};

export default EnableAccount;
