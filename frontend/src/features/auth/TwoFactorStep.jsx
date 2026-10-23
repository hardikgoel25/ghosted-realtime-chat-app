import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import Field from "./Field";

/** Second step of a two-factor sign-in: a 6-digit app code or a recovery code. */
export default function TwoFactorStep() {
  const verifyTwoFactor = useAuthStore((s) => s.verifyTwoFactor);
  const cancelTwoFactor = useAuthStore((s) => s.cancelTwoFactor);
  const busy = useAuthStore((s) => s.isLoggingIn);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (code.trim()) verifyTwoFactor(code.trim());
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <p className="text-sm text-base-content/70">
        {recovery
          ? "Enter one of the recovery codes you saved when you turned on two-factor authentication. Each code works once."
          : "Open your authenticator app and enter the 6-digit code for Ghosted."}
      </p>
      <Field
        id="twofactor-code"
        label={recovery ? "Recovery code" : "Authentication code"}
        icon={KeyRound}
        type="text"
        inputMode={recovery ? "text" : "numeric"}
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={recovery ? "xxxxx-xxxxx" : "123456"}
        maxLength={recovery ? 11 : 6}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        required
      />
      <button type="submit" className="btn btn-primary w-full" disabled={busy || !code.trim()}>
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Checking…
          </>
        ) : (
          "Continue"
        )}
      </button>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="link link-primary"
          onClick={() => {
            setRecovery((v) => !v);
            setCode("");
          }}
        >
          {recovery ? "Use the authenticator app instead" : "Use a recovery code"}
        </button>
        <button type="button" className="link" onClick={cancelTwoFactor}>
          Start over
        </button>
      </div>
    </form>
  );
}
