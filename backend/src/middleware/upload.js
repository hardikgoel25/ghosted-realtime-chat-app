import multer from "multer";
import { ALLOWED_AUDIO_MIME, ALLOWED_FILE_MIME, ALLOWED_IMAGE_MIME, LIMITS } from "@ghosted/shared";
import { ApiError } from "../utils/ApiError.js";

function imageMulter(maxBytes, maxFiles) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: maxFiles, fields: 5, parts: maxFiles + 6 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_IMAGE_MIME.includes(file.mimetype)) return cb(null, true);
      cb(ApiError.unsupportedMedia("Only JPEG, PNG, WebP or GIF images are allowed"));
    },
  });
}

/**
 * Accepts a single image field in a multipart request, buffered in memory. The declared MIME
 * type is only a first filter; the bytes are verified again in media.service before any upload.
 * Non-multipart requests pass straight through untouched.
 */
export function imageUpload(field, maxBytes) {
  return imageMulter(maxBytes, 1).single(field);
}

/** Same, for up to `maxFiles` images under one field name (`req.files`). */
export function imagesUpload(field, maxBytes, maxFiles) {
  return imageMulter(maxBytes, maxFiles).array(field, maxFiles);
}

const FIELD_FILTERS = {
  images: (mime) => ALLOWED_IMAGE_MIME.includes(mime),
  // Browsers sometimes send octet-stream for less common types; the bytes decide in the service
  files: (mime) => ALLOWED_FILE_MIME.includes(mime) || mime === "application/octet-stream",
  audio: (mime) => ALLOWED_AUDIO_MIME.includes(mime) || mime.startsWith("audio/"),
};

/**
 * Message attachments: `images[]`, `files[]` and a single `audio` part. Per-kind size limits are
 * enforced in the service; multer only caps the largest allowed part.
 */
export function messageUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: LIMITS.FILE_MAX_BYTES,
      files: LIMITS.MESSAGE_IMAGES_MAX + LIMITS.MESSAGE_FILES_MAX + 1,
      fields: 8,
      parts: LIMITS.MESSAGE_IMAGES_MAX + LIMITS.MESSAGE_FILES_MAX + 10,
    },
    fileFilter: (_req, file, cb) => {
      const allowed = FIELD_FILTERS[file.fieldname];
      if (!allowed) return cb(ApiError.badRequest(`Unexpected file field "${file.fieldname}"`));
      if (allowed(file.mimetype)) return cb(null, true);
      cb(
        ApiError.unsupportedMedia(`"${file.originalname}" is not an allowed ${file.fieldname} type`)
      );
    },
  }).fields([
    { name: "images", maxCount: LIMITS.MESSAGE_IMAGES_MAX },
    { name: "files", maxCount: LIMITS.MESSAGE_FILES_MAX },
    { name: "audio", maxCount: 1 },
  ]);
}
