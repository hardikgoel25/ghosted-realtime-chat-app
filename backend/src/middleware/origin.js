import { ERROR_CODES } from "@ghosted/shared";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests. Browsers always attach
 * `Origin` (or at least `Referer`) and `Sec-Fetch-Site` to such requests, so a request that
 * carries one of them from somewhere other than our own front end is refused. Requests with
 * neither header come from non-browser clients that do not carry ambient cookies.
 */
export function originCheck(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return next(ApiError.forbidden("Cross-site request blocked", ERROR_CODES.CSRF));
  }

  const origin = req.get("origin") ?? originOf(req.get("referer") ?? "");
  if (!origin) return next();
  if (origin === "null") {
    return next(ApiError.forbidden("Request origin not allowed", ERROR_CODES.CSRF));
  }

  const host = req.get("host");
  const sameHost = (() => {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  })();

  if (sameHost || env.CLIENT_ORIGINS.includes(origin)) return next();
  return next(ApiError.forbidden("Request origin not allowed", ERROR_CODES.CSRF));
}
