import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { env, isProd } from "./config/env.js";
import { logger } from "./config/logger.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import { originCheck } from "./middleware/origin.js";
import { errorHandler, notFound } from "./middleware/error.js";
import v1Routes from "./routes/v1/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

const CLOUDINARY_HOST = "https://res.cloudinary.com";

export function createApp() {
  const app = express();

  app.set("trust proxy", env.trustProxy);
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers["x-request-id"] ?? crypto.randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: {
        ignore: (req) => !req.url.startsWith("/api") || req.url.startsWith("/api/v1/health"),
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    })
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", CLOUDINARY_HOST],
          mediaSrc: ["'self'", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: isProd ? { maxAge: 15_552_000, includeSubDomains: true } : false,
    })
  );

  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.CLIENT_ORIGINS.includes(origin)),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Requested-With"],
      maxAge: 600,
    })
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(originCheck);

  app.use("/api", globalLimiter);
  app.use("/api/v1", v1Routes);

  if (isProd) {
    app.use(express.static(FRONTEND_DIST, { index: false, maxAge: "1y", immutable: true }));
    app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(FRONTEND_DIST, "index.html"));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
