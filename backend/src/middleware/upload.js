import multer from "multer";
import { ALLOWED_IMAGE_MIME } from "@ghosted/shared";
import { ApiError } from "../utils/ApiError.js";

/**
 * Accepts a single image field in a multipart request, buffered in memory. The declared MIME
 * type is only a first filter; the bytes are verified again in media.service before any upload.
 * Non-multipart requests pass straight through untouched.
 */
export function imageUpload(field, maxBytes) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5, parts: 8 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_IMAGE_MIME.includes(file.mimetype)) return cb(null, true);
      cb(ApiError.unsupportedMedia("Only JPEG, PNG, WebP or GIF images are allowed"));
    },
  }).single(field);
}
