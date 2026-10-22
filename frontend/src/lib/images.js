import { ALLOWED_IMAGE_MIME, LIMITS } from "@ghosted/shared";

export function validateImageFile(file) {
  if (!ALLOWED_IMAGE_MIME.includes(file.type)) {
    return "Please choose a JPEG, PNG, WebP or GIF image";
  }
  if (file.size > LIMITS.IMAGE_MAX_BYTES) {
    return `Images must be under ${Math.round(LIMITS.IMAGE_MAX_BYTES / 1024 / 1024)} MB`;
  }
  return null;
}

/**
 * Downscales large photos in the browser before upload (max 2048px on the longest side,
 * re-encoded as WebP). GIFs are left untouched so animations survive. Falls back to the
 * original file whenever the browser cannot decode it.
 */
export async function prepareImage(file, { maxDimension = LIMITS.IMAGE_MAX_DIMENSION } = {}) {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxDimension / longest);
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob) return file;
    const name = file.name.replace(/\.[a-z0-9]+$/i, "") + ".webp";
    return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
  } catch {
    return file;
  }
}
