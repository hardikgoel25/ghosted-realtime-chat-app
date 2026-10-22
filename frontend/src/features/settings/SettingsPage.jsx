import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Bell, Palette, ShieldCheck, User, Wrench } from "lucide-react";
import ProfileSection from "./ProfileSection";
import AppearanceSection from "./AppearanceSection";
import NotificationsSection from "./NotificationsSection";
import PrivacySection from "./PrivacySection";
import AccountSection from "./AccountSection";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User, component: ProfileSection },
  { id: "appearance", label: "Appearance", icon: Palette, component: AppearanceSection },
  { id: "notifications", label: "Notifications", icon: Bell, component: NotificationsSection },
  { id: "privacy", label: "Privacy", icon: ShieldCheck, component: PrivacySection },
  { id: "account", label: "Account", icon: Wrench, component: AccountSection },
];

export default function SettingsPage() {
  const { section } = useParams();
  const current = SECTIONS.find((s) => s.id === section);
  if (!current) return <Navigate to="/settings/profile" replace />;
  const Section = current.component;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="h-14 shrink-0 flex items-center gap-2 px-2 sm:px-3 border-b border-base-300">
        <Link to="/" className="btn btn-ghost btn-sm btn-circle" aria-label="Back to chats">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-semibold">Settings</h1>
      </header>

      <nav
        className="md:hidden shrink-0 border-b border-base-300 overflow-x-auto scrollbar-none"
        aria-label="Settings sections"
      >
        <ul className="flex px-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <Link
                to={`/settings/${s.id}`}
                className={`block px-3 py-2.5 text-sm whitespace-nowrap border-b-2 ${
                  s.id === current.id
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-base-content/70"
                }`}
                aria-current={s.id === current.id ? "page" : undefined}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1 min-h-0 flex">
        <nav
          className="hidden md:block w-56 shrink-0 border-r border-base-300 p-3"
          aria-label="Settings sections"
        >
          <ul className="menu w-full p-0 gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/settings/${s.id}`}
                  className={s.id === current.id ? "menu-active" : ""}
                  aria-current={s.id === current.id ? "page" : undefined}
                >
                  <s.icon className="size-4" /> {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 sm:p-6">
            <h2 className="text-xl font-semibold mb-4">{current.label}</h2>
            <Section />
          </div>
        </div>
      </div>
    </div>
  );
}
