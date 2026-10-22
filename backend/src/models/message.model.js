import mongoose from "mongoose";
import { LIMITS } from "@ghosted/shared";

const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "", maxlength: LIMITS.MESSAGE_TEXT_MAX },
    image: { type: String, default: null },
    imagePublicId: { type: String, default: null },
    // Client-generated UUID so a retried send never creates a duplicate
    clientId: { type: String, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ senderId: 1, receiverId: 1, _id: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, _id: -1 });
messageSchema.index(
  { senderId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: "string" } } }
);

const Message = mongoose.models.Message ?? mongoose.model("Message", messageSchema);
export default Message;
