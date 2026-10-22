import { isProd } from "../config/env.js";

export const ACCESS_COOKIE = "access";
export const REFRESH_COOKIE = "refresh";
export const REFRESH_COOKIE_PATH = "/api/v1/auth/refresh";
const LEGACY_COOKIE = "jwt";

const base = Object.freeze({
  httpOnly: true,
  sameSite: "lax",
  secure: isProd,
});

export function setAuthCookies(res, { accessToken, refreshToken, maxAgeMs }) {
  // Both cookies live as long as the refresh session; an expired access token is still sent
  // so the server can answer TOKEN_EXPIRED and the client knows to refresh.
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: "/", maxAge: maxAgeMs });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeMs,
  });
}

export function clearAuthCookies(res) {
  // Clearing must repeat the attributes the cookie was set with, or browsers may keep it
  res.clearCookie(ACCESS_COOKIE, { ...base, path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
  res.clearCookie(LEGACY_COOKIE, { httpOnly: true, sameSite: "strict", secure: isProd, path: "/" });
}
