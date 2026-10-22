import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { agent, signup } from "./helpers.js";

describe("uploads without Cloudinary credentials", () => {
  it("fails closed with 503 MEDIA_UNAVAILABLE instead of accepting the file", async () => {
    const a = agent();
    await signup(a);
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } })
      .png()
      .toBuffer();
    const res = await a
      .put("/api/v1/users/me/avatar")
      .attach("avatar", png, { filename: "me.png", contentType: "image/png" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("MEDIA_UNAVAILABLE");
  });
});
