import { Link, useNavigate } from "react-router-dom";
import { LogOut, Settings, User, Ghost } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";

const Navigation = () => {
  const { logout, authUser } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="bg-base-100 border-b border-base-300 fixed w-full top-0 z-40 backdrop-blur-lg bg-base-100/80">
      <div className="container mx-auto px-4 h-16">
        <div className="flex items-center justify-between h-full">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-all">
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Ghost className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-bold">Ghosted</h1>
          </Link>

          <nav className="flex items-center gap-2" aria-label="Main">
            <Link to="/settings" className="btn btn-sm gap-2 transition-colors">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
            {authUser && (
              <>
                <Link to="/profile" className="btn btn-sm gap-2">
                  <User className="size-5" />
                  <span className="hidden sm:inline">Profile</span>
                </Link>
                <button className="btn btn-sm btn-ghost gap-2" onClick={handleLogout}>
                  <LogOut className="size-5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Navigation;
