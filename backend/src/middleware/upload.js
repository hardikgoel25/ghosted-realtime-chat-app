import multer from "multer";
import { ALLOWED_IMAGE_MIME } from "@ghosted/shared";
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
