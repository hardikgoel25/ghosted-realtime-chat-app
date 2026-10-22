import mongoose from "mongoose";

const { Schema } = mongoose;

/** Single-use, expiring tokens for email verification and password reset (stored hashed). */
const emailTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: ["verify", "reset"], required: true },
    email: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailToken = mongoose.models.EmailToken ?? mongoose.model("EmailToken", emailTokenSchema);
export default EmailToken;
