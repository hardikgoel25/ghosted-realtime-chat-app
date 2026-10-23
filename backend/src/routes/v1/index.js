import { Router } from "express";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import conversationRoutes from "./conversation.routes.js";
import healthRoutes from "./health.routes.js";
import configRoutes from "./config.routes.js";
import pushRoutes from "./push.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/config", configRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/conversations", conversationRoutes);
router.use("/push", pushRoutes);

export default router;
