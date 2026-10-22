import mongoose from "mongoose";
import { LIMITS, MESSAGE_TYPES } from "@ghosted/shared";

const { Schema } = mongoose;

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: null },
    mime: { type: String, default: null },
    size: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    name: { type: String, default: null },
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Client-generated UUID so a retried send never creates a duplicate
    clientId: { type: String, default: null },
    type: { type: String, enum: MESSAGE_TYPES, default: "text" },
    text: { type: String, default: "", maxlength: LIMITS.MESSAGE_TEXT_MAX },
    attachments: { type: [attachmentSchema], default: [] },
    replyTo: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedFor: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index(
  { senderId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: "string" } } }
);

const Message = mongoose.models.Message ?? mongoose.model("Message", messageSchema);
export default Message;
