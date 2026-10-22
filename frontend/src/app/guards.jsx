import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";

export function RequireAuth() {
  const authUser = useAuthStore((s) => s.authUser);
  const location = useLocation();
  if (!authUser) {
    // Remember where the user wanted to go so the login page can send them back
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

export function PublicOnly() {
  const authUser = useAuthStore((s) => s.authUser);
  const location = useLocation();
  if (authUser) {
    const from = location.state?.from;
    const to = from ? `${from.pathname}${from.search ?? ""}` : "/";
    return <Navigate to={to} replace />;
  }
  return <Outlet />;
}
