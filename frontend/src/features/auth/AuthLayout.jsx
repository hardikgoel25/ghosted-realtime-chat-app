import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Ghost, Palette, ShieldCheck, Zap } from "lucide-react";

const FEATURES = [
  [Zap, "Realtime delivery with delivered and seen ticks"],
  [ShieldCheck, "Session security with per-device sign-out"],
  [Palette, "Themes that match how you work"],
];

function BrandPanel() {
  const reduce = useReducedMotion();
  return (
    <div className="hidden lg:flex relative overflow-hidden items-center justify-center p-12 bg-base-200">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, var(--color-primary) 0, transparent 42%), radial-gradient(circle at 80% 75%, var(--color-secondary) 0, transparent 38%)",
        }}
        aria-hidden="true"
      />
      <div className="relative max-w-md space-y-8">
        <motion.div
          animate={reduce ? undefined : { y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          className="size-24 rounded-3xl bg-base-100/70 backdrop-blur border border-base-content/10 flex items-center justify-center shadow-xl"
        >
          <Ghost className="size-12 text-primary" />
        </motion.div>
        <div>
          <h2 className="text-3xl font-bold leading-tight">Conversations that feel instant.</h2>
          <p className="mt-3 text-base-content/70">
            Presence, typing, read receipts and photos, delivered the moment they happen and
            protected by default.
          </p>
        </div>
        <ul className="space-y-3 text-sm">
          {FEATURES.map(([Icon, text]) => (
            <li key={text} className="flex items-center gap-3">
              <span className="size-8 rounded-lg bg-base-100/70 flex items-center justify-center shrink-0">
                <Icon className="size-4 text-primary" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-base-100">
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-6" aria-label="Ghosted">
              <span className="size-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Ghost className="size-5 text-primary" />
              </span>
              <span className="text-xl font-bold tracking-tight">Ghosted</span>
            </Link>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-base-content/60 mt-1">{subtitle}</p>}
          </div>
          {children}
          {footer && <p className="text-center text-sm text-base-content/60 mt-8">{footer}</p>}
        </div>
      </div>
      <BrandPanel />
    </div>
  );
}
