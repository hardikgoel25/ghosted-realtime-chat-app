import { useEffect, useState } from "react";

let zxcvbnPromise = null;

/** zxcvbn and its dictionaries are ~400 KB, so they load only once a password is typed. */
function loadZxcvbn() {
  zxcvbnPromise ??= Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
  ]).then(([core, common]) => {
    core.zxcvbnOptions.setOptions({
      dictionary: { ...common.dictionary },
      graphs: common.adjacencyGraphs,
    });
    return core.zxcvbn;
  });
  return zxcvbnPromise;
}

const LABELS = ["Too weak", "Weak", "Okay", "Good", "Strong"];
const COLORS = ["bg-error", "bg-error", "bg-warning", "bg-success", "bg-success"];

export default function PasswordStrength({ password, userInputs }) {
  const [result, setResult] = useState(null);
  const inputsKey = (userInputs ?? []).join("\u0000");

  useEffect(() => {
    if (!password) {
      setResult(null);
      return;
    }
    let cancelled = false;
    loadZxcvbn().then((zxcvbn) => {
      if (cancelled) return;
      setResult(zxcvbn(password, inputsKey.split("\u0000").filter(Boolean)));
    });
    return () => {
      cancelled = true;
    };
  }, [password, inputsKey]);

  if (!password) return null;
  const score = result?.score ?? 0;

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < score ? COLORS[score] : "bg-base-300"}`}
          />
        ))}
      </div>
      <p className="text-xs mt-1 text-base-content/60">
        {result ? LABELS[score] : "Checking…"}
        {result?.feedback?.warning ? ` · ${result.feedback.warning}` : ""}
        {result && score < 2 ? " · Passwords this weak are rejected." : ""}
      </p>
    </div>
  );
}
