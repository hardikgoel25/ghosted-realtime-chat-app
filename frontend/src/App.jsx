import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader } from "lucide-react";
import { Toaster } from "react-hot-toast";

import Navigation from "./components/Navigation";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import EnableAccount from "./pages/EnableAccount";

import { useAuthStore } from "./store/useAuthStore";
import { useChatStore } from "./store/useChatStore";
import { useThemeStore } from "./store/useThemeStore";

const App = () => {
  const { authUser, checkAuth, isCheckingAuth } = useAuthStore();
  const { theme } = useThemeStore();
  const unreadTotal = useChatStore((s) => Object.values(s.unread).reduce((sum, n) => sum + n, 0));

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    document.title = unreadTotal > 0 ? `(${unreadTotal}) Ghosted` : "Ghosted";
  }, [unreadTotal]);

  if (isCheckingAuth && !authUser) {
    return (
      <div className="flex items-center justify-center h-screen" data-theme={theme}>
        <Loader className="size-10 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div data-theme={theme}>
      <Navigation />
      <Routes>
        <Route path="/" element={authUser ? <Home /> : <Navigate to="/login" replace />} />
        <Route path="/signup" element={!authUser ? <Signup /> : <Navigate to="/" replace />} />
        <Route path="/login" element={!authUser ? <Login /> : <Navigate to="/" replace />} />
        <Route
          path="/enable-account"
          element={!authUser ? <EnableAccount /> : <Navigate to="/" replace />}
        />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/profile"
          element={authUser ? <Profile /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
    </div>
  );
};

export default App;
