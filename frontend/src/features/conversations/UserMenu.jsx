import { Link, useNavigate } from "react-router-dom";
import { LogOut, Palette, Settings, User } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import Avatar from "../../components/ui/Avatar";

const closeMenu = () => document.activeElement?.blur?.();

export default function UserMenu({ user }) {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <div className="dropdown dropdown-end">
      <button
        type="button"
        tabIndex={0}
        className="btn btn-ghost btn-sm btn-circle"
        aria-label="Account menu"
      >
        <Avatar user={user} size="sm" />
      </button>
      <ul
        tabIndex={0}
        className="dropdown-content menu bg-base-100 rounded-box shadow-xl border border-base-300 w-60 p-2 mt-2 z-50"
      >
        <li className="menu-title px-3 py-2">
          <span className="block truncate text-base-content font-semibold">{user.fullname}</span>
          <span className="block text-xs font-normal opacity-60">@{user.username}</span>
        </li>
        <li>
          <Link to="/settings/profile" onClick={closeMenu}>
            <User className="size-4" /> Profile
          </Link>
        </li>
        <li>
          <Link to="/settings/appearance" onClick={closeMenu}>
            <Palette className="size-4" /> Appearance
          </Link>
        </li>
        <li>
          <Link to="/settings/account" onClick={closeMenu}>
            <Settings className="size-4" /> Settings
          </Link>
        </li>
        <li>
          <button
            type="button"
            onClick={async () => {
              closeMenu();
              await logout();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="size-4" /> Log out
          </button>
        </li>
      </ul>
    </div>
  );
}
