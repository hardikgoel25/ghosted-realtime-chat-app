import { useState } from "react";
import ThemeSettings from "../components/ThemeSettings";
import AccountSettings from "../components/AccountSettings";
import { useAuthStore } from "../store/useAuthStore";

const SECTIONS = [
  { id: "theme", label: "Theme" },
  { id: "account", label: "Account" },
];

export default function SettingsPage() {
  const { authUser } = useAuthStore();
  const [activeSection, setActiveSection] = useState("theme");

  const renderSection = () => {
    switch (activeSection) {
      case "theme":
        return <ThemeSettings />;
      case "account":
        return authUser ? (
          <AccountSettings />
        ) : (
          <div className="p-6 border border-warning rounded-lg bg-warning/20 text-warning font-semibold text-center">
            You must be logged in to access Account Settings.
          </div>
        );
      default:
        return (
          <div className="p-6 border border-error rounded-lg bg-error/20 text-error font-semibold text-center">
            Section not found.
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen container mx-auto px-4 pt-20 pb-10 max-w-5xl">
      {/* Top navigation for mobile */}
      <nav className="md:hidden mb-6">
        <div className="flex space-x-2 overflow-x-auto">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              className={`flex-1 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition
                ${activeSection === id
                  ? "bg-primary text-primary-content"
                  : "bg-base-200 text-base-content hover:bg-base-300"
                }`}
              onClick={() => setActiveSection(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Sidebar and Content */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar for desktop */}
        <nav className="hidden md:block w-48 flex-shrink-0 border-r border-base-300 pr-4">
          <ul className="space-y-2">
            {SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <button
                  className={`w-full text-left px-3 py-2 rounded-md transition
                    ${activeSection === id
                      ? "bg-primary text-primary-content"
                      : "hover:bg-base-200"
                    }`}
                  onClick={() => setActiveSection(id)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <main className="flex-1">{renderSection()}</main>
      </div>
    </div>
  );
}
