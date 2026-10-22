import crypto from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import {
  ALLOWED_AUDIO_MIME,
  ALLOWED_FILE_MIME,
  ALLOWED_IMAGE_MIME,
  ERROR_CODES,
  LIMITS,
} from "@ghosted/shared";
import { cloudinary, cloudinaryConfigured } from "../config/cloudinary.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/ApiError.js";

const WEBP_QUALITY = 82;
const MAX_INPUT_PIXELS = 50_000_000;
// Plain-text formats carry no magic bytes; they are accepted only after a content sniff
const TEXT_MIME = new Set(["text/plain", "text/csv", "text/markdown", "application/json"]);
const TEXT_EXT = {
  "text/plain": "txt",
  "text/csv": "csv",
  "text/markdown": "md",
  "application/json": "json",
};

function ensureConfigured() {
  if (!cloudinaryConfigured) {
    throw new ApiError(
      503,
      ERROR_CODES.MEDIA_UNAVAILABLE,
      "File uploads are not configured on this server"
    );
  }
}

function folderFor(kind) {
  return `ghosted/${env.NODE_ENV}/${kind}`;
}

export function safeFilename(name, fallback = "file") {
  const base = path
    .basename(String(name ?? ""))
    .replace(/[^\w.\-()\s]/g, "_")
    .trim();
  return (base || fallback).slice(0, 120);
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, 8192);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates the real file type from its bytes (the client-supplied MIME type is never trusted),
 * then re-encodes through sharp: this strips EXIF/GPS metadata, caps dimensions and guarantees
 * that whatever reaches Cloudinary is a plain raster image.
 */
export async function processImage(
  buffer,
  { maxDimension = LIMITS.IMAGE_MAX_DIMENSION, square = false } = {}
) {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !ALLOWED_IMAGE_MIME.includes(type.mime)) {
    throw ApiError.unsupportedMedia("File is not a supported image (JPEG, PNG, WebP or GIF)");
  }
  try {
    const pipeline = sharp(buffer, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: square ? "cover" : "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, mime: "image/webp" };
  } catch (err) {
    logger.warn({ err }, "Image processing failed");
    throw ApiError.unsupportedMedia("Image could not be processed");
  }
}

export function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) =>
      err ? reject(err) : resolve(result)
    );
    Readable.from(buffer).pipe(stream);
  });
}

export async function uploadImage(buffer, { folder, ...processOptions }) {
  ensureConfigured();
  const processed = await processImage(buffer, processOptions);
  const result = await uploadBuffer(processed.buffer, {
    folder: folderFor(folder),
    resource_type: "image",
    allowed_formats: ["webp"],
    unique_filename: true,
    use_filename: false,
    overwrite: false,
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: "image",
    width: processed.width,
    height: processed.height,
    bytes: processed.buffer.length,
  };
}

/** Verifies a document attachment by its bytes; returns the trusted MIME type and extension. */
export async function detectFile(buffer, { declaredMime, name }) {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected) {
    if (!ALLOWED_FILE_MIME.includes(detected.mime)) {
      throw ApiError.unsupportedMedia("This file type is not allowed");
    }
    return { mime: detected.mime, ext: detected.ext };
  }
  if (TEXT_MIME.has(declaredMime) && looksLikeText(buffer)) {
    const fromName = path
      .extname(String(name ?? ""))
      .slice(1)
      .toLowerCase();
    return {
      mime: declaredMime,
      ext: /^[a-z0-9]{1,5}$/.test(fromName) ? fromName : TEXT_EXT[declaredMime],
    };
  }
  throw ApiError.unsupportedMedia("This file type is not allowed");
}

export async function uploadFile(buffer, { folder, name, declaredMime }) {
  ensureConfigured();
  if (buffer.length > LIMITS.FILE_MAX_BYTES) throw ApiError.payloadTooLarge("File is too large");
  const { mime, ext } = await detectFile(buffer, { declaredMime, name });
  // Raw uploads keep whatever extension is in the public id, which is what browsers use to
  // decide how to open the download
  const result = await uploadBuffer(buffer, {
    folder: folderFor(folder),
    public_id: `${crypto.randomUUID()}.${ext}`,
    resource_type: "raw",
    unique_filename: false,
    use_filename: false,
    overwrite: false,
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: "raw",
    mime,
    size: buffer.length,
    name: safeFilename(name, `file.${ext}`),
  };
}

export async function uploadAudio(buffer, { folder, declaredMime }) {
  ensureConfigured();
  if (buffer.length > LIMITS.AUDIO_MAX_BYTES) throw ApiError.payloadTooLarge("Audio is too large");
  // Every allowed audio container has a signature, so an undetectable file is never accepted
  const detected = await fileTypeFromBuffer(buffer);
  const mime = detected?.mime;
  if (!mime || !ALLOWED_AUDIO_MIME.includes(mime)) {
    throw ApiError.unsupportedMedia(
      `Unsupported audio format${declaredMime ? ` (${declaredMime})` : ""}`
    );
  }
  // Cloudinary files audio under the "video" resource type
  const result = await uploadBuffer(buffer, {
    folder: folderFor(folder),
    resource_type: "video",
    unique_filename: true,
    use_filename: false,
    overwrite: false,
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: "video",
    mime: mime === "video/webm" ? "audio/webm" : mime,
    size: buffer.length,
  };
}

export async function destroyImage(publicId) {
  if (!publicId || !cloudinaryConfigured) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (err) {
    logger.warn({ err, publicId }, "Failed to delete Cloudinary asset");
  }
}

/** Deletes a mixed list of assets, batching per Cloudinary resource type. */
export async function destroyAssets(assets) {
  if (!cloudinaryConfigured) return;
  const groups = new Map();
  for (const a of assets) {
    if (!a?.publicId) continue;
    const type = a.resourceType ?? "image";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(a.publicId);
  }
  for (const [resourceType, ids] of groups) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      try {
        await cloudinary.api.delete_resources(chunk, { resource_type: resourceType });
      } catch (err) {
        logger.warn({ err, resourceType, count: chunk.length }, "Failed to bulk delete assets");
      }
    }
  }
}

export async function destroyImages(publicIds) {
  return destroyAssets(
    publicIds.filter(Boolean).map((publicId) => ({ publicId, resourceType: "image" }))
  );
}
