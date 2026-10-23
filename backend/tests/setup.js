import { afterAll, afterEach, beforeAll, inject } from "vitest";

// Must run before any application module evaluates config/env.js
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-".padEnd(48, "x");
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/ghosted-test-placeholder";
process.env.CLIENT_ORIGINS = "http://localhost:5173";
process.env.LOG_LEVEL = "silent";
process.env.REFRESH_REUSE_LEEWAY_MS = "0";
// Never let a developer's real Cloudinary credentials leak into the test run
process.env.CLOUDINARY_CLOUD_NAME = "";
process.env.CLOUDINARY_API_KEY = "";
process.env.CLOUDINARY_API_SECRET = "";
// Capture-only email transport so the email flows can be exercised without SMTP
process.env.SMTP_URL = "json";
process.env.APP_URL = "http://localhost:5173";
// Throwaway VAPID pair so push code paths run (web-push itself is mocked where it matters)
process.env.VAPID_PUBLIC_KEY =
  "BPyLI3NJN1Gse4NOnwt2cRyczcW_djlaP4_QLEg8ntQTI6eu-LrCyzd5gafIabOfqtv51UBWqgOe_WKmz2P1PbA";
process.env.VAPID_PRIVATE_KEY = "GknVr3NmQnZLxilnxfK-icKNGfkc_nD6rMpPmKjXGnA";
// Link preview fixtures run on 127.0.0.1, which production would refuse
process.env.LINK_PREVIEW_ALLOW_PRIVATE = "1";
delete process.env.RATE_LIMIT_TEST;

beforeAll(async () => {
  const { connectDb } = await import("../src/config/db.js");
  await connectDb(inject("mongoUri"));
});

afterEach(async () => {
  const { default: mongoose } = await import("mongoose");
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  const presence = await import("../src/services/presence.service.js");
  presence.reset();
});

afterAll(async () => {
  const { disconnectDb } = await import("../src/config/db.js");
  await disconnectDb();
});
