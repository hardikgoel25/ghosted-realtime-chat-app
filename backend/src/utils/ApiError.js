import { ERROR_CODES } from "@ghosted/shared";

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = "Bad request", details, code = ERROR_CODES.BAD_REQUEST) {
    return new ApiError(400, code, message, details);
  }

  static validation(message = "Validation failed", details) {
    return new ApiError(400, ERROR_CODES.VALIDATION, message, details);
  }

  static unauthorized(message = "Not authenticated", code = ERROR_CODES.UNAUTHORIZED) {
    return new ApiError(401, code, message);
  }

  static forbidden(message = "Forbidden", code = ERROR_CODES.FORBIDDEN) {
    return new ApiError(403, code, message);
  }

  static notFound(message = "Not found") {
    return new ApiError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message = "Conflict") {
    return new ApiError(409, ERROR_CODES.CONFLICT, message);
  }

  static payloadTooLarge(message = "Payload too large") {
    return new ApiError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, message);
  }

  static unsupportedMedia(message = "Unsupported media type") {
    return new ApiError(415, ERROR_CODES.UNSUPPORTED_MEDIA, message);
  }

  static tooMany(message = "Too many requests", code = ERROR_CODES.RATE_LIMITED) {
    return new ApiError(429, code, message);
  }

  static internal(message = "Internal server error") {
    return new ApiError(500, ERROR_CODES.INTERNAL, message);
  }
}

export function formatZodIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}
