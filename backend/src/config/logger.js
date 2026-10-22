import pino from "pino";
import { env, isProd, isTest } from "./env.js";

const level = env.LOG_LEVEL ?? (isTest ? "silent" : isProd ? "info" : "debug");

export const logger = pino({
  level,
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'res.headers["set-cookie"]',
      "password",
      "*.password",
      "newPassword",
      "*.newPassword",
      "currentPassword",
      "*.currentPassword",
      "refreshToken",
      "*.refreshToken",
      "accessToken",
      "*.accessToken",
    ],
    censor: "[redacted]",
  },
  transport:
    !isProd && !isTest
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        }
      : undefined,
});
