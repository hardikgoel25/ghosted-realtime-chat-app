import mongoose from "mongoose";

const { Schema } = mongoose;

/** One browser's Web Push subscription; tied to the session so signing out removes it. */
const pushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null, index: true },
    endpoint: { type: String, required: true, unique: true },
    expirationTime: { type: Number, default: null },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const PushSubscription =
  mongoose.models.PushSubscription ?? mongoose.model("PushSubscription", pushSubscriptionSchema);
export default PushSubscription;
