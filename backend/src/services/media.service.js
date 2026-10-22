import { Readable } from "node:stream";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { ALLOWED_IMAGE_MIME, ERROR_CODES, LIMITS } from "@ghosted/shared";
import { cloudinary, cloudinaryConfigured } from "../config/cloudinary.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/ApiError.js";

const WEBP_QUALITY = 82;
const MAX_INPUT_PIXELS = 50_000_000;

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
  if (!cloudinaryConfigured) {
    throw new ApiError(
      503,
      ERROR_CODES.MEDIA_UNAVAILABLE,
      "Image uploads are not configured on this server"
    );
  }
  const processed = await processImage(buffer, processOptions);
  const result = await uploadBuffer(processed.buffer, {
    folder: `ghosted/${env.NODE_ENV}/${folder}`,
    resource_type: "image",
    allowed_formats: ["webp"],
    unique_filename: true,
    use_filename: false,
    overwrite: false,
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: processed.width,
    height: processed.height,
    bytes: processed.buffer.length,
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

export async function destroyImages(publicIds) {
  const ids = publicIds.filter(Boolean);
  if (ids.length === 0 || !cloudinaryConfigured) return;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      await cloudinary.api.delete_resources(chunk, { resource_type: "image" });
    } catch (err) {
      logger.warn({ err, count: chunk.length }, "Failed to bulk delete Cloudinary assets");
    }
  }
}
