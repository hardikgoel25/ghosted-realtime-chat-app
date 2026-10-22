import { ApiError, formatZodIssues } from "../utils/ApiError.js";

/**
 * Validates `req.params`, `req.query` and `req.body` against Zod schemas and exposes the parsed
 * (trimmed, normalised, defaulted) values on `req.validated`. Express 5 makes `req.query` a
 * read-only getter, so parsed values are never written back onto the request.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const validated = {};
    for (const key of ["params", "query", "body"]) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) {
        return next(ApiError.validation("Validation failed", formatZodIssues(result.error)));
      }
      validated[key] = result.data;
    }
    req.validated = validated;
    next();
  };
}
