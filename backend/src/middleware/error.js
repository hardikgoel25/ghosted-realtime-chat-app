import multer from "multer";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";
import { ApiError, formatZodIssues } from "../utils/ApiError.js";

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

function normalise(err) {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError)
    return ApiError.validation("Validation failed", formatZodIssues(err));
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return ApiError.payloadTooLarge("File is too large");
    return ApiError.badRequest(`Upload error: ${err.message}`);
  }
  if (err?.type === "entity.too.large")
    return ApiError.payloadTooLarge("Request body is too large");
  if (err?.type === "entity.parse.failed") return ApiError.badRequest("Malformed JSON body");
  if (err?.type === "charset.unsupported" || err?.type === "encoding.unsupported") {
    return ApiError.unsupportedMedia(err.message);
  }
  if (err?.name === "CastError") return ApiError.badRequest("Invalid id");
  if (err?.name === "ValidationError") return ApiError.validation(err.message);
  if (err?.code === 11000) return ApiError.conflict("Already exists");
  return null;
}

// Express identifies error handlers by arity, so the 4th argument must stay
export function errorHandler(err, req, res, _next) {
  const log = req.log ?? logger;
  let error = normalise(err);
  if (!error) {
    log.error({ err }, "Unhandled error");
    error = ApiError.internal();
  } else if (error.status >= 500) {
    log.error({ err }, error.message);
  }

  if (res.headersSent) return;
  const body = { ok: false, error: { code: error.code, message: error.message } };
  if (error.details) body.error.details = error.details;
  res.status(error.status).json(body);
}
