import mongoose from "mongoose";
import { ATTACHMENT_KINDS, LIMITS, MESSAGE_TYPES, SYSTEM_MESSAGE_KINDS } from "@ghosted/shared";

const { Schema } = mongoose;

const attachmentSchema = new Schema(
  {
    kind: { type: String, enum: ATTACHMENT_KINDS, default: "image" },
    url: { type: String, required: true },
    publicId: { type: String, default: null },
    // Cloudinary resource type needed to delete the asset again (image | raw | video)
    resourceType: { type: String, default: "image" },
    mime: { type: String, default: null },
    size: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    name: { type: String, default: null },
  },
  { _id: false }
);

// Snapshot of the quoted message, so a quote survives edits/deletes of the original
const replyToSchema = new Schema(
  {
    messageId: { type: Schema.Types.ObjectId, required: true },
    senderId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: MESSAGE_TYPES, default: "text" },
    text: { type: String, default: "" },
    hasAttachments: { type: Boolean, default: false },
  },
  { _id: false }
);

const reactionSchema = new Schema(
  {
    emoji: { type: String, required: true },
    userIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: false }
);

// Group events ("Alice added Bob"); senderId is the actor, targetIds the people concerned
const systemSchema = new Schema(
  {
    kind: { type: String, enum: SYSTEM_MESSAGE_KINDS, required: true },
    targetIds: { type: [Schema.Types.ObjectId], default: [] },
    text: { type: String, default: "" },
  },
  { _id: false }
);

// Server-fetched summary of the first link in the text (see linkPreview.service)
const linkPreviewSchema = new Schema(
  {
    url: { type: String, required: true },
    title: { type: String, default: null },
    description: { type: String, default: null },
    siteName: { type: String, default: null },
    image: { type: String, default: null },
    fetchedAt: { type: Date, default: Date.now },
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
    replyTo: { type: replyToSchema, default: null },
    reactions: { type: [reactionSchema], default: [] },
    system: { type: systemSchema, default: null },
    linkPreview: { type: linkPreviewSchema, default: null },
    editedAt: { type: Date, default: null },
    // "Delete for everyone": content is wiped, the placeholder stays
    deletedAt: { type: Date, default: null },
    // "Delete for me": hidden from these users only
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
