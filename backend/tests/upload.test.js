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
              const publicId = options.public_id
                ? `${options.folder}/${options.public_id}`
                : `${options.folder}/asset-${n}`;
              cb(null, {
                secure_url: `https://res.cloudinary.com/test/${options.resource_type}/upload/${publicId}${options.public_id ? "" : ".webp"}`,
                public_id: publicId,
                bytes,
                resource_type: options.resource_type,
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

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
);

function wavBuffer() {
  const data = 200;
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + data, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(data, 40);
  return b;
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
    const pdf = await a
      .put("/api/v1/users/me/avatar")
      .attach("avatar", PDF, { filename: "x.pdf", contentType: "application/pdf" });
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
    expect(res.body.data.message.attachments[0].kind).toBe("image");
    expect(res.body.data.message.attachments[0].url).toMatch(/ghosted\/test\/messages\//);
    expect(res.body.data.message.attachments[0]).not.toHaveProperty("publicId");

    const two = await a
      .post(url)
      .attach("images", await pngBuffer(), { filename: "a.png", contentType: "image/png" })
      .attach("images", await pngBuffer(), { filename: "b.png", contentType: "image/png" });
    expect(two.status).toBe(201);
    expect(two.body.data.message.attachments).toHaveLength(2);

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

  it("accepts documents and voice notes, verifying bytes rather than names", async () => {
    const a = agent();
    await signup(a);
    const { user: other } = await signup(agent());
    const conv = await openDirect(a, other._id);
    const url = `/api/v1/conversations/${conv._id}/messages`;

    const doc = await a
      .post(url)
      .attach("files", PDF, { filename: "Report (final).pdf", contentType: "application/pdf" })
      .attach("files", Buffer.from("name,qty\nbolt,3\n"), {
        filename: "stock.csv",
        contentType: "text/csv",
      });
    expect(doc.status).toBe(201);
    expect(doc.body.data.message.type).toBe("file");
    const [pdf, csv] = doc.body.data.message.attachments;
    expect(pdf).toMatchObject({
      kind: "file",
      mime: "application/pdf",
      name: "Report (final).pdf",
    });
    expect(pdf.url).toMatch(/\/raw\/upload\/ghosted\/test\/files\/[0-9a-f-]{36}\.pdf$/);
    expect(csv).toMatchObject({ kind: "file", mime: "text/csv", name: "stock.csv" });
    expect(csv.url).toMatch(/\.csv$/);

    const voice = await a
      .post(url)
      .field("audioDurationMs", "4200")
      .attach("audio", wavBuffer(), { filename: "voice.wav", contentType: "audio/wav" });
    expect(voice.status).toBe(201);
    expect(voice.body.data.message.type).toBe("audio");
    expect(voice.body.data.message.attachments[0]).toMatchObject({
      kind: "audio",
      mime: "audio/wav",
      durationMs: 4200,
    });
    expect(voice.body.data.message.attachments[0].url).toMatch(/\/video\/upload\//);

    const html = await a
      .post(url)
      .attach("files", Buffer.from("<html><script>x()</script></html>"), {
        filename: "page.pdf",
        contentType: "application/pdf",
      });
    expect(html.status).toBe(415);
    const binaryAsText = await a
      .post(url)
      .attach("files", Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0x02]), {
        filename: "tool.txt",
        contentType: "text/plain",
      });
    expect(binaryAsText.status).toBe(415);
    const exe = await a.post(url).attach("files", Buffer.from("MZ"), {
      filename: "tool.exe",
      contentType: "application/x-msdownload",
    });
    expect(exe.status).toBe(415);
    const notAudio = await a.post(url).attach("audio", Buffer.from("just text"), {
      filename: "v.webm",
      contentType: "audio/webm",
    });
    expect(notAudio.status).toBe(415);

    // Deleting for everyone removes the stored assets with the right resource types
    deleteResources.mockClear();
    const del = await a.delete(`${url}/${doc.body.data.message._id}?scope=everyone`);
    expect(del.status).toBe(200);
    expect(deleteResources).toHaveBeenCalledWith(
      expect.arrayContaining([pdf.url.split("/upload/")[1]]),
      { resource_type: "raw" }
    );
  });
});
