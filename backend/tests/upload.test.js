import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { LIMITS } from "@ghosted/shared";
import { agent, openDirect, sendText, signup } from "./helpers.js";

const { destroy, deleteResources } = vi.hoisted(() => ({
  destroy: vi.fn(async () => ({ result: "ok" })),
  deleteResources: vi.fn(async () => ({})),
}));

vi.mock("../src/config/cloudinary.js", async () => {
  const { Writable } = await import("node:stream");
  let counter = 0;
  return {
    cloudinaryConfigured: true,
    cloudinary: {
      uploader: {
        upload_stream: (options, cb) => {
          const chunks = [];
          const n = ++counter;
          return new Writable({
            write(chunk, _enc, next) {
              chunks.push(chunk);
              next();
            },
            final(done) {
              const bytes = Buffer.concat(chunks).length;
              cb(null, {
                secure_url: `https://res.cloudinary.com/test/image/upload/${options.folder}/asset-${n}.webp`,
                public_id: `${options.folder}/asset-${n}`,
                bytes,
                format: "webp",
              });
              done();
            },
          });
        },
        destroy,
      },
      api: { delete_resources: deleteResources },
    },
  };
});

async function pngBuffer(width = 64, height = 48) {
  return sharp({ create: { width, height, channels: 3, background: "#7c3aed" } })
    .png()
    .toBuffer();
}

describe("uploads", () => {
  it("accepts a real image as avatar, re-encodes it and stores the Cloudinary reference", async () => {
    const a = agent();
    await signup(a);
    const res = await a
      .put("/api/v1/users/me/avatar")
      .attach("avatar", await pngBuffer(), { filename: "me.png", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar.url).toMatch(
      /^https:\/\/res\.cloudinary\.com\/test\/image\/upload\/ghosted\/test\/avatars\//
    );
    expect(res.body.data.user.avatar.publicId).toMatch(/^ghosted\/test\/avatars\/asset-\d+$/);

    const removed = await a.delete("/api/v1/users/me/avatar");
    expect(removed.status).toBe(200);
    expect(removed.body.data.user.avatar.url).toMatch(/^data:image\/svg\+xml/);
    expect(destroy).toHaveBeenCalledWith(res.body.data.user.avatar.publicId, expect.anything());
  });

  it("rejects files whose bytes are not an image even if they claim an image MIME type", async () => {
    const a = agent();
    await signup(a);
    const res = await a
      .put("/api/v1/users/me/avatar")
      .attach("avatar", Buffer.from("<script>alert(1)</script>"), {
        filename: "x.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects non-image MIME types, missing files and oversized uploads", async () => {
    const a = agent();
    await signup(a);
    const pdf = await a.put("/api/v1/users/me/avatar").attach("avatar", Buffer.from("%PDF-1.4"), {
      filename: "x.pdf",
      contentType: "application/pdf",
    });
    expect(pdf.status).toBe(415);

    const none = await a.put("/api/v1/users/me/avatar").field("note", "no file");
    expect(none.status).toBe(400);

    const huge = await a
      .put("/api/v1/users/me/avatar")
      .attach("avatar", Buffer.alloc(LIMITS.AVATAR_MAX_BYTES + 1), {
        filename: "big.png",
        contentType: "image/png",
      });
    expect(huge.status).toBe(413);
  });

  it("sends image messages through multipart (up to the limit) and ignores client-supplied URLs", async () => {
    const a = agent();
    await signup(a);
    const { user: other } = await signup(agent());
    const conv = await openDirect(a, other._id);
    const url = `/api/v1/conversations/${conv._id}/messages`;

    const res = await a
      .post(url)
      .field("text", "look at this")
      .attach("images", await pngBuffer(), { filename: "pic.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.data.message.type).toBe("image");
    expect(res.body.data.message.text).toBe("look at this");
    expect(res.body.data.message.attachments).toHaveLength(1);
    expect(res.body.data.message.attachments[0].url).toMatch(/ghosted\/test\/messages\//);
    expect(res.body.data.message.attachments[0]).not.toHaveProperty("publicId");

    const two = await a
      .post(url)
      .attach("images", await pngBuffer(), { filename: "a.png", contentType: "image/png" })
      .attach("images", await pngBuffer(), { filename: "b.png", contentType: "image/png" });
    expect(two.status).toBe(201);
    expect(two.body.data.message.attachments).toHaveLength(2);
    expect(two.body.data.message.text).toBe("");

    let tooMany = a.post(url);
    for (let i = 0; i <= LIMITS.MESSAGE_IMAGES_MAX; i++) {
      tooMany = tooMany.attach("images", await pngBuffer(), {
        filename: `${i}.png`,
        contentType: "image/png",
      });
    }
    expect((await tooMany).status).toBe(400);

    const remoteUrl = await sendText(a, conv._id, "fetch this", {
      image: "https://example.com/secret.png",
    });
    expect(remoteUrl.status).toBe(400);

    const list = await a.get("/api/v1/conversations");
    expect(list.body.data.items[0].lastMessage.hasAttachments).toBe(true);
  });
});
