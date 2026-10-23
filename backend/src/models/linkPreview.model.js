import mongoose from "mongoose";

const { Schema } = mongoose;

/** Cached result of fetching a link, including negative results so bad URLs are not retried. */
const linkPreviewSchema = new Schema(
  {
    url: { type: String, required: true, unique: true },
    ok: { type: Boolean, default: false },
    title: { type: String, default: null },
    description: { type: String, default: null },
    siteName: { type: String, default: null },
    image: { type: String, default: null },
    fetchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

linkPreviewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LinkPreview = mongoose.models.LinkPreview ?? mongoose.model("LinkPreview", linkPreviewSchema);
export default LinkPreview;
