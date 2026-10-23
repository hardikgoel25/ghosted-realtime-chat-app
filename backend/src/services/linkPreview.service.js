import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { LIMITS } from "@ghosted/shared";
import { cloudinary, cloudinaryConfigured } from "../config/cloudinary.js";
import { env } from "../config/env.js";
import { features } from "../config/features.js";
import { logger } from "../config/logger.js";
import LinkPreview from "../models/linkPreview.model.js";
import Message from "../models/message.model.js";

/**
 * Server-side link previews with SSRF protection:
 *  - only http(s) on the default ports, never IP literals or names that resolve to private,
 *    loopback, link-local, multicast or reserved ranges;
 *  - the validated address is pinned for the TCP connection (no DNS rebinding between the
 *    check and the fetch), and every redirect is validated again;
 *  - 5 s total timeout, 1 MB cap, HTML only, a small concurrency budget;
 *  - results (including failures) are cached per URL so a link is fetched once.
 * Preview images are never served from the third-party host: when Cloudinary is configured they
 * go through its signed "fetch" delivery, which also keeps the CSP image allowlist unchanged.
 */

const URL_RE = /https?:\/\/[^\s<>"'`]+/i;
const TRAILING = /[.,:;!?)\]]+$/;
const MAX_REDIRECTS = 3;
const MAX_IN_FLIGHT = 6;
const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; GhostedLinkPreview/1.0; +https://github.com/hardikgoel25/ghosted-realtime-chat-app)";

let inFlight = 0;

export function extractFirstUrl(text) {
  const match = String(text ?? "").match(URL_RE);
  if (!match) return null;
  const raw = match[0].replace(TRAILING, "");
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function ipv4ToInt(ip) {
  return ip.split(".").reduce((acc, part) => acc * 256 + Number(part), 0) >>> 0;
}

const V4_BLOCKED = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3], // multicast + reserved + broadcast
].map(([base, bits]) => [ipv4ToInt(base), bits]);

function isPublicV4(ip) {
  const n = ipv4ToInt(ip);
  return !V4_BLOCKED.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits));
}

function expandV6(ip) {
  // Returns the 8 hextets as numbers, or null when the address embeds an IPv4 we should check
  let addr = ip.toLowerCase();
  const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const prefix = addr.slice(0, -v4[1].length);
    if (prefix === "::ffff:" || prefix === "::" || prefix === "64:ff9b::") {
      return { embeddedV4: v4[1] };
    }
    const [a, b, c, d] = v4[1].split(".").map(Number);
    addr = `${prefix}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail = ""] = addr.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = Array(8 - left.length - right.length).fill("0");
  const parts = [...left, ...fill, ...right].map((h) => parseInt(h || "0", 16));
  return { hextets: parts };
}

function isPublicV6(ip) {
  const { embeddedV4, hextets } = expandV6(ip);
  if (embeddedV4) return isPublicV4(embeddedV4);
  const [h0, h1] = hextets;
  if (hextets.every((h) => h === 0)) return false; // ::
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1) return false; // ::1
  if ((h0 & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((h0 & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
  if ((h0 & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (h0 === 0x2001 && h1 === 0x0db8) return false; // documentation
  if (h0 === 0x0064 && h1 === 0xff9b) return false; // NAT64 (non-literal forms)
  return (h0 & 0xe000) === 0x2000; // only global unicast 2000::/3
}

/** True for globally routable unicast addresses only (pure; used by the tests). */
export function isPublicIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPublicV4(ip);
  if (family === 6) return isPublicV6(ip);
  return false;
}

export function isPublicAddress(ip) {
  if (env.LINK_PREVIEW_ALLOW_PRIVATE) return true;
  return isPublicIp(ip);
}

/** Resolves a hostname and returns one public address, or throws. */
export async function resolvePublicAddress(hostname) {
  const literal = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(literal)) {
    if (!isPublicAddress(literal)) throw new Error("private address");
    return { address: literal, family: net.isIP(literal) };
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) throw new Error("no address");
  for (const r of records) if (!isPublicAddress(r.address)) throw new Error("private address");
  const v4 = records.find((r) => r.family === 4);
  return v4 ?? records[0];
}

function assertAllowedUrl(url) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported scheme");
  if (url.username || url.password) throw new Error("credentials in url");
  // Only the default ports in production; the dev/test flag also lifts this for fixtures
  if (url.port && url.port !== "80" && url.port !== "443" && !env.LINK_PREVIEW_ALLOW_PRIVATE) {
    throw new Error("non-default port");
  }
}

/** One GET with the connection pinned to `address`; resolves with status, headers and body. */
function fetchOnce(url, address, { deadline }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const timeLeft = deadline - Date.now();
    if (timeLeft <= 0) return reject(new Error("timeout"));
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        servername: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "Accept-Language": "en",
        },
        // Pin the connection to the address that passed the check (no DNS rebinding). Node
        // asks for all addresses when it may auto-select the family, hence both shapes.
        lookup: (_host, opts, cb) =>
          opts?.all
            ? cb(null, [{ address: address.address, family: address.family }])
            : cb(null, address.address, address.family),
        timeout: timeLeft,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        if (status !== 200 || !/^(text\/html|application\/xhtml\+xml)/i.test(type)) {
          res.resume();
          return resolve({ status, html: null });
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > LIMITS.LINK_PREVIEW_MAX_BYTES) {
            req.destroy();
            resolve({ status, html: Buffer.concat(chunks).toString("utf8") });
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, html: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function clean(value, max) {
  if (!value) return null;
  const text = decodeEntities(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Pulls title/description/image from the <head>; regex is enough for meta tags. */
export function parseHtml(html, baseUrl) {
  const head = html.slice(0, 300_000);
  const meta = {};
  for (const tag of head.match(/<meta\s[^>]*>/gi) ?? []) {
    const key =
      tag.match(/\b(?:property|name)\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase() ?? null;
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const value = content?.[1] ?? content?.[2] ?? content?.[3];
    if (key && value !== undefined && meta[key] === undefined) meta[key] = value;
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = clean(
    meta["og:title"] ?? meta["twitter:title"] ?? titleTag,
    LIMITS.LINK_PREVIEW_TITLE_MAX
  );
  const description = clean(
    meta["og:description"] ?? meta["twitter:description"] ?? meta.description,
    LIMITS.LINK_PREVIEW_DESCRIPTION_MAX
  );
  const siteName = clean(meta["og:site_name"], 60);
  let image = null;
  const rawImage = meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"];
  if (rawImage) {
    try {
      const resolved = new URL(decodeEntities(rawImage).trim(), baseUrl);
      if (["http:", "https:"].includes(resolved.protocol)) image = resolved.href;
    } catch {
      // ignore unparsable image urls
    }
  }
  return { title, description, siteName, image };
}

/** Routes a third-party image through Cloudinary so the browser only ever loads our CDN. */
export function deliverableImage(imageUrl) {
  if (!imageUrl || !cloudinaryConfigured) return null;
  try {
    return cloudinary.url(imageUrl, {
      type: "fetch",
      secure: true,
      sign_url: true,
      transformation: [
        { width: 800, height: 420, crop: "fill", gravity: "auto" },
        { fetch_format: "auto", quality: "auto" },
      ],
    });
  } catch {
    return null;
  }
}

export async function fetchPreview(startUrl) {
  const deadline = Date.now() + LIMITS.LINK_PREVIEW_TIMEOUT_MS;
  let url = new URL(startUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertAllowedUrl(url);
    const address = await resolvePublicAddress(url.hostname);
    const result = await fetchOnce(url, address, { deadline });
    if (result.location !== undefined) {
      url = new URL(result.location, url);
      continue;
    }
    if (!result.html) return null;
    const parsed = parseHtml(result.html, url.href);
    if (!parsed.title && !parsed.description) return null;
    return { ...parsed, image: deliverableImage(parsed.image) };
  }
  return null;
}

/** Cached preview for a URL, or null. Never throws. */
export async function getPreview(url) {
  const cached = await LinkPreview.findOne({ url }).lean();
  if (cached && cached.expiresAt > new Date()) {
    return cached.ok
      ? {
          title: cached.title,
          description: cached.description,
          siteName: cached.siteName,
          image: cached.image,
        }
      : null;
  }
  if (inFlight >= MAX_IN_FLIGHT) return null;
  inFlight += 1;
  let preview = null;
  try {
    preview = await fetchPreview(url);
  } catch (err) {
    logger.debug({ err: err.message, url }, "Link preview failed");
  } finally {
    inFlight -= 1;
  }
  await LinkPreview.updateOne(
    { url },
    {
      $set: {
        ok: Boolean(preview),
        title: preview?.title ?? null,
        description: preview?.description ?? null,
        siteName: preview?.siteName ?? null,
        image: preview?.image ?? null,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + (preview ? OK_TTL_MS : FAIL_TTL_MS)),
      },
    },
    { upsert: true }
  ).catch(() => {});
  return preview;
}

/**
 * Attaches a preview to a message after the send has already been acknowledged. `onUpdated`
 * receives the fresh message document so the caller can tell the clients.
 */
export function schedulePreview(message, onUpdated) {
  if (!features.linkPreviews) return;
  const url = extractFirstUrl(message.text);
  if (!url) return;
  setImmediate(async () => {
    try {
      const preview = await getPreview(url);
      if (!preview) return;
      // Only attach when the text has not been edited or deleted in the meantime
      const updated = await Message.findOneAndUpdate(
        { _id: message._id, deletedAt: null, text: message.text },
        { $set: { linkPreview: { url, ...preview, fetchedAt: new Date() } } },
        { new: true }
      );
      if (updated) onUpdated(updated);
    } catch (err) {
      logger.warn({ err }, "Link preview update failed");
    }
  });
}
