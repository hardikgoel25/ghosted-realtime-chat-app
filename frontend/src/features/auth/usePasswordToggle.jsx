import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Eye toggle for password fields; returns [inputType, toggleButton] */
export function usePasswordToggle() {
  const [visible, setVisible] = useState(false);
  const button = (
    <button
      type="button"
      className="btn btn-ghost btn-xs btn-circle"
      onClick={() => setVisible((v) => !v)}
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
    >
      {visible ? <EyeOff className="size-4 opacity-60" /> : <Eye className="size-4 opacity-60" />}
    </button>
  );
  return [visible ? "text" : "password", button];
}
