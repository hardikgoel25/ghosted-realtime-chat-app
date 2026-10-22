import { Check, MonitorSmartphone } from "lucide-react";
import { SYSTEM_THEME, THEMES } from "@ghosted/shared";
import { useThemeStore } from "../../stores/useThemeStore";

function ThemeCard({ id, label, selected, onSelect, children }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative text-left rounded-xl border-2 p-2 transition-colors ${
        selected ? "border-primary" : "border-base-300 hover:border-base-content/30"
      }`}
      aria-pressed={selected}
    >
      {children}
      <div className="mt-2 flex items-center justify-between px-1">
        <span className="text-sm font-medium">{label}</span>
        {selected && <Check className="size-4 text-primary" aria-label="Selected" />}
      </div>
      <span className="sr-only">{id}</span>
    </button>
  );
}

function Swatches({ theme }) {
  return (
    <div
      data-theme={theme}
      className="rounded-lg bg-base-100 border border-base-300 p-2 h-16 flex flex-col justify-between"
    >
      <div className="flex gap-1">
        <span className="h-2 flex-1 rounded bg-primary" />
        <span className="h-2 flex-1 rounded bg-secondary" />
        <span className="h-2 flex-1 rounded bg-accent" />
      </div>
      <div className="flex items-end gap-1">
        <span className="h-5 w-2/3 rounded-lg bg-base-200" />
        <span className="h-5 w-1/3 rounded-lg bg-primary" />
      </div>
    </div>
  );
}

export default function AppearanceSection() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="space-y-6">
      <p className="text-sm text-base-content/70">
        Pick a theme for the whole app. &ldquo;System&rdquo; follows your device&apos;s light or
        dark setting.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <ThemeCard
          id="system"
          label="System"
          selected={theme === SYSTEM_THEME}
          onSelect={() => setTheme(SYSTEM_THEME)}
        >
          <div className="rounded-lg border border-base-300 h-16 grid grid-cols-2 overflow-hidden">
            <div
              data-theme="ghosted-light"
              className="bg-base-100 flex items-center justify-center"
            >
              <MonitorSmartphone className="size-5 opacity-60" />
            </div>
            <div data-theme="ghosted-dark" className="bg-base-100 flex items-center justify-center">
              <MonitorSmartphone className="size-5 opacity-60" />
            </div>
          </div>
        </ThemeCard>
        {THEMES.map((t) => (
          <ThemeCard
            key={t.id}
            id={t.id}
            label={t.label}
            selected={theme === t.id}
            onSelect={() => setTheme(t.id)}
          >
            <Swatches theme={t.id} />
          </ThemeCard>
        ))}
      </div>
    </div>
  );
}
