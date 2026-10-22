import mongoose from "mongoose";

const { Schema } = mongoose;

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // SHA-256 of the current refresh token; the raw token only ever lives in the client cookie
    refreshTokenHash: { type: String, required: true, unique: true },
    // Hashes of recently rotated tokens, used to detect replay of a stale refresh token
    previousTokenHashes: { type: [String], default: [], index: true },
    rotatedAt: { type: Date, default: null },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  { timestamps: true }
);

// MongoDB removes expired sessions on its own
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.models.Session ?? mongoose.model("Session", sessionSchema);
export default Session;
