import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { copyText } from "../../lib/utils";
import Dialog from "../../components/ui/Dialog";

function RecoveryCodes({ codes }) {
  const text = codes.join("\n");
  const download = () => {
    const blob = new Blob([`Ghosted recovery codes\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ghosted-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-base-content/70">
        Keep these somewhere safe. Each code signs you in once if you lose your authenticator. They
        are shown only now.
      </p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm surface p-3">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={async () =>
            (await copyText(text)) ? toast.success("Copied") : toast.error("Copy failed")
          }
        >
          <Copy className="size-4" /> Copy
        </button>
        <button type="button" className="btn btn-sm btn-outline" onClick={download}>
          <Download className="size-4" /> Download
        </button>
      </div>
    </div>
  );
}

function PasswordPrompt({ label, busy, onSubmit, children }) {
  const [password, setPassword] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(password);
      }}
      className="space-y-3"
      noValidate
    >
      {children}
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Confirm with your password"
        className="input w-full"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label="Password"
        autoFocus
      />
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !password}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : label}
        </button>
      </div>
    </form>
  );
}

function EnableDialog({ open, onClose }) {
  const twoFactorSetup = useAuthStore((s) => s.twoFactorSetup);
  const twoFactorEnable = useAuthStore((s) => s.twoFactorEnable);
  const [step, setStep] = useState("password"); // password | scan | codes
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState([]);
  const [busy, setBusy] = useState(false);

  const close = () => {
    onClose();
    setStep("password");
    setSetup(null);
    setCode("");
    setCodes([]);
  };

  return (
    <Dialog open={open} onClose={close} title="Turn on two-factor authentication" size="sm">
      {step === "password" && (
        <PasswordPrompt
          label="Continue"
          busy={busy}
          onSubmit={async (password) => {
            setBusy(true);
            const result = await twoFactorSetup(password);
            setBusy(false);
            if (result) {
              setSetup(result);
              setStep("scan");
            }
          }}
        >
          <p className="text-sm text-base-content/70">
            You will need an authenticator app such as Google Authenticator, Authy or 1Password.
          </p>
        </PasswordPrompt>
      )}

      {step === "scan" && setup && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const result = await twoFactorEnable(code.trim());
            setBusy(false);
            if (result) {
              setCodes(result);
              setStep("codes");
            }
          }}
          className="space-y-3"
          noValidate
        >
          <p className="text-sm text-base-content/70">
            Scan this code with your authenticator app, then enter the 6-digit code it shows.
          </p>
          <div className="flex justify-center">
            <img
              src={setup.qrDataUrl}
              alt="QR code for your authenticator app"
              className="rounded-lg bg-white p-1 size-44"
            />
          </div>
          <details className="text-xs text-base-content/60">
            <summary className="cursor-pointer">Can&apos;t scan? Enter the key manually</summary>
            <code className="block mt-1 break-all select-all font-mono text-sm text-base-content">
              {setup.secret}
            </code>
          </details>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={6}
            className="input w-full"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Authentication code"
            autoFocus
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || code.trim().length !== 6}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Verify and turn on"}
            </button>
          </div>
        </form>
      )}

      {step === "codes" && (
        <div className="space-y-4">
          <div className="alert alert-success text-sm">
            <ShieldCheck className="size-4" /> Two-factor authentication is on.
          </div>
          <RecoveryCodes codes={codes} />
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary btn-sm" onClick={close}>
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function DisableDialog({ open, onClose }) {
  const twoFactorDisable = useAuthStore((s) => s.twoFactorDisable);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    onClose();
    setPassword("");
    setCode("");
  };
  return (
    <Dialog open={open} onClose={close} title="Turn off two-factor authentication?" size="sm">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await twoFactorDisable(password, code.trim());
          setBusy(false);
          if (ok) close();
        }}
        className="space-y-3"
        noValidate
      >
        <p className="text-sm text-base-content/70">
          Your password alone will be enough to sign in again. Confirm with your password and a
          current code (or a recovery code).
        </p>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          className="input w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Password"
        />
        <input
          type="text"
          autoComplete="one-time-code"
          placeholder="Authentication or recovery code"
          className="input w-full"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Authentication or recovery code"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn btn-error btn-sm"
            disabled={busy || !password || !code.trim()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Turn off"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RecoveryDialog({ open, onClose }) {
  const twoFactorRecoveryCodes = useAuthStore((s) => s.twoFactorRecoveryCodes);
  const [codes, setCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    onClose();
    setCodes(null);
  };
  return (
    <Dialog open={open} onClose={close} title="New recovery codes" size="sm">
      {codes ? (
        <div className="space-y-4">
          <RecoveryCodes codes={codes} />
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary btn-sm" onClick={close}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <PasswordPrompt
          label="Generate"
          busy={busy}
          onSubmit={async (password) => {
            setBusy(true);
            const result = await twoFactorRecoveryCodes(password);
            setBusy(false);
            if (result) setCodes(result);
          }}
        >
          <p className="text-sm text-base-content/70">
            This replaces every recovery code you saved before.
          </p>
        </PasswordPrompt>
      )}
    </Dialog>
  );
}

export default function TwoFactorCard() {
  const enabled = useAuthStore((s) => Boolean(s.authUser?.twoFactorEnabled));
  const available = useAuthStore((s) => s.config?.features?.twoFactor !== false);
  const [dialog, setDialog] = useState(null); // enable | disable | recovery

  if (!available && !enabled) return null;

  return (
    <div className="surface p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            <KeyRound className="size-4 opacity-60" /> Two-factor authentication
          </h3>
          <p className="text-sm text-base-content/60">
            {enabled
              ? "On. Signing in needs your password and a code from your authenticator app."
              : "Add a second step at sign-in with an authenticator app."}
          </p>
        </div>
        {enabled ? (
          <span className="badge badge-success badge-sm gap-1 shrink-0">
            <ShieldCheck className="size-3" /> On
          </span>
        ) : (
          <span className="badge badge-ghost badge-sm gap-1 shrink-0">
            <ShieldOff className="size-3" /> Off
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            {available && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setDialog("recovery")}
              >
                New recovery codes
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline btn-error btn-sm"
              onClick={() => setDialog("disable")}
            >
              Turn off
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialog("enable")}
          >
            Turn on
          </button>
        )}
      </div>
      <EnableDialog open={dialog === "enable"} onClose={() => setDialog(null)} />
      <DisableDialog open={dialog === "disable"} onClose={() => setDialog(null)} />
      <RecoveryDialog open={dialog === "recovery"} onClose={() => setDialog(null)} />
    </div>
  );
}
