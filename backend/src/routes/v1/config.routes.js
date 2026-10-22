import { Router } from "express";
import { LIMITS } from "@ghosted/shared";
import { cloudinaryConfigured } from "../../config/cloudinary.js";
import { emailConfigured } from "../../services/mail.service.js";
import { ok } from "../../utils/response.js";

const router = Router();

/** Public, non-secret capability flags so the client can hide features that are not set up. */
router.get("/", (_req, res) => {
  ok(res, {
    emailEnabled: emailConfigured,
    mediaEnabled: cloudinaryConfigured,
    limits: {
      imageMaxBytes: LIMITS.IMAGE_MAX_BYTES,
      fileMaxBytes: LIMITS.FILE_MAX_BYTES,
      audioMaxBytes: LIMITS.AUDIO_MAX_BYTES,
      messageImagesMax: LIMITS.MESSAGE_IMAGES_MAX,
      messageFilesMax: LIMITS.MESSAGE_FILES_MAX,
      editWindowMs: LIMITS.MESSAGE_EDIT_WINDOW_MS,
    },
  });
});

export default router;
