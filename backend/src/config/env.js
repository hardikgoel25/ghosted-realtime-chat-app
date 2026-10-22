import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Always load backend/.env, regardless of the cwd the process was started from
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z
    .string()
    .regex(/^\d+(ms|s|m|h|d)$/, "ACCESS_TOKEN_TTL must look like 15m, 1h, 900s")
    .default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  REFRESH_REUSE_LEEWAY_MS: z.coerce.number().int().min(0).default(10_000),
  CLIENT_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean)
    ),
  TRUST_PROXY: z.coerce.number().int().min(0).optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // The logger depends on env, so plain stderr is the only option here.
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  trustProxy: parsed.data.TRUST_PROXY ?? (parsed.data.NODE_ENV === "production" ? 1 : 0),
});

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
export const isDev = env.NODE_ENV === "development";
