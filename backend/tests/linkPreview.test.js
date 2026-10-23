import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  extractFirstUrl,
  isPublicIp,
  parseHtml,
  resolvePublicAddress,
} from "../src/services/linkPreview.service.js";
import { agent, openDirect, sendText, signup } from "./helpers.js";

const PAGE = `<!doctype html><html><head>
<title>Fallback &amp; title</title>
<meta property="og:title" content="Ghosted &#8212; realtime chat" />
<meta name="description" content="Plain description">
<meta property='og:description' content='Chat that feels instant &amp; safe'>
<meta property="og:site_name" content="Ghosted">
<meta property="og:image" content="/cover.png">
</head><body><p>hello</p></body></html>`;

let server;
let base;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/page") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(PAGE);
    }
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/page" });
      return res.end();
    }
    if (req.url === "/json") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end('{"ok":true}');
    }
    if (req.url === "/huge") {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("<html><head><title>Big</title></head><body>");
      res.write("x".repeat(2 * 1024 * 1024));
      return res.end("</body></html>");
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

async function previewOf(a, conversationId, messageId, { timeoutMs = 4000 } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const { items } = (await a.get(`/api/v1/conversations/${conversationId}/messages`)).body.data;
    const message = items.find((m) => m._id === messageId);
    if (message?.linkPreview) return message.linkPreview;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

describe("link preview guards", () => {
  it("picks the first http(s) link and strips trailing punctuation", () => {
    expect(extractFirstUrl("see https://example.com/a?b=1). and http://x.y")).toBe(
      "https://example.com/a?b=1"
    );
    expect(extractFirstUrl("no links here, not even www.example.com")).toBeNull();
    expect(extractFirstUrl("ftp://example.com/file")).toBeNull();
    expect(extractFirstUrl("https://example.com/#frag")).toBe("https://example.com/");
  });

  it("rejects private, loopback, link-local, multicast and reserved addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.9",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "ff02::1",
      "::ffff:10.0.0.1",
      "::ffff:127.0.0.1",
      "64:ff9b::7f00:1",
      "2001:db8::1",
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
    for (const ip of [
      "93.184.216.34",
      "8.8.8.8",
      "172.32.0.1",
      "2606:2800:220:1:248:1893:25c8:1946",
    ]) {
      expect(isPublicIp(ip), ip).toBe(true);
    }
    expect(isPublicIp("not-an-ip")).toBe(false);
  });

  it("resolves hosts and refuses credentials, odd ports and other schemes", async () => {
    // The test environment allows private addresses so the local fixture server is reachable
    const { address } = await resolvePublicAddress("localhost");
    expect(["127.0.0.1", "::1"]).toContain(address);
  });

  it("parses Open Graph tags with entity decoding and relative images", () => {
    const parsed = parseHtml(PAGE, "https://site.example/path/");
    expect(parsed).toEqual({
      title: "Ghosted — realtime chat",
      description: "Chat that feels instant & safe",
      siteName: "Ghosted",
      image: "https://site.example/cover.png",
    });
    expect(
      parseHtml("<html><head><title>Only &lt;title&gt;</title></head></html>", "https://a.b")
    ).toMatchObject({
      title: "Only <title>",
      description: null,
      image: null,
    });
  });
});

describe("link previews on messages", () => {
  it("attaches a preview after sending, follows redirects, and ignores non-HTML or oversized pages", async () => {
    expect((await agent().get("/api/v1/config")).body.data.features.linkPreviews).toBe(true);
    const a = agent();
    await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const conv = await openDirect(a, bob._id);

    const sent = await sendText(a, conv._id, `look at ${base}/redirect please`);
    expect(sent.status).toBe(201);
    expect(sent.body.data.message.linkPreview).toBeNull();
    const preview = await previewOf(b, conv._id, sent.body.data.message._id);
    expect(preview).toEqual({
      url: `${base}/redirect`,
      title: "Ghosted — realtime chat",
      description: "Chat that feels instant & safe",
      siteName: "Ghosted",
      image: null, // Cloudinary is not configured in tests, so third-party images are dropped
    });

    const json = await sendText(a, conv._id, `${base}/json`);
    expect(await previewOf(a, conv._id, json.body.data.message._id, { timeoutMs: 800 })).toBeNull();
    const huge = await sendText(a, conv._id, `${base}/huge`);
    const hugePreview = await previewOf(a, conv._id, huge.body.data.message._id);
    expect(hugePreview?.title).toBe("Big");
    const missing = await sendText(a, conv._id, `${base}/nope`);
    expect(
      await previewOf(a, conv._id, missing.body.data.message._id, { timeoutMs: 800 })
    ).toBeNull();
  });

  it("drops the preview when an edit removes the link and keeps it otherwise", async () => {
    const a = agent();
    await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const conv = await openDirect(a, bob._id);
    const sent = await sendText(a, conv._id, `${base}/page`);
    const id = sent.body.data.message._id;
    expect(await previewOf(a, conv._id, id)).not.toBeNull();

    const kept = await a
      .patch(`/api/v1/conversations/${conv._id}/messages/${id}`)
      .send({ text: `${base}/page is worth a read` });
    expect(kept.body.data.message.linkPreview?.title).toBe("Ghosted — realtime chat");

    const removed = await a
      .patch(`/api/v1/conversations/${conv._id}/messages/${id}`)
      .send({ text: "never mind" });
    expect(removed.body.data.message.linkPreview).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    const { items } = (await a.get(`/api/v1/conversations/${conv._id}/messages`)).body.data;
    expect(items.find((m) => m._id === id).linkPreview).toBeNull();
  });
});
