import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import Root from "./Root";
import AppShell from "./AppShell";
import RouteError from "./RouteError";
import { PublicOnly, RequireAuth } from "./guards";

const LoginPage = lazy(() => import("../features/auth/LoginPage"));
const SignupPage = lazy(() => import("../features/auth/SignupPage"));
const EnableAccountPage = lazy(() => import("../features/auth/EnableAccountPage"));
const ForgotPasswordPage = lazy(() => import("../features/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("../features/auth/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("../features/auth/VerifyEmailPage"));
const EmptyChat = lazy(() => import("../features/chat/EmptyChat"));
const ChatPage = lazy(() => import("../features/chat/ChatPage"));
const UserProfilePage = lazy(() => import("../features/profile/UserProfilePage"));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage"));

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/signup", element: <SignupPage /> },
          { path: "/enable-account", element: <EnableAccountPage /> },
          { path: "/forgot-password", element: <ForgotPasswordPage /> },
          { path: "/reset-password", element: <ResetPasswordPage /> },
        ],
      },
      // Works whether or not the user is signed in
      { path: "/verify-email", element: <VerifyEmailPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: "/",
            element: <AppShell />,
            children: [
              { index: true, element: <EmptyChat /> },
              { path: "c/:conversationId", element: <ChatPage /> },
              { path: "u/:username", element: <UserProfilePage /> },
              { path: "settings", element: <Navigate to="/settings/profile" replace /> },
              { path: "settings/:section", element: <SettingsPage /> },
              { path: "profile", element: <Navigate to="/settings/profile" replace /> },
            ],
          },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
