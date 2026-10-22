import mongoose from "mongoose";
import { CONVERSATION_TYPES, MESSAGE_TYPES } from "@ghosted/shared";

const { Schema } = mongoose;

const participantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["member", "admin"], default: "member" },
    joinedAt: { type: Date, default: Date.now },
    // Read/delivery cursors: every message created at or before these is seen/delivered
    lastReadAt: { type: Date, default: null },
    lastDeliveredAt: { type: Date, default: null },
    mutedUntil: { type: Date, default: null },
    archived: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
    // "Delete for me": messages before this moment are hidden from this participant
    clearedAt: { type: Date, default: null },
  },
  { _id: false }
);

const lastMessageSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    senderId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: MESSAGE_TYPES, default: "text" },
    text: { type: String, default: "" },
    hasAttachments: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
);

const conversationSchema = new Schema(
  {
    type: { type: String, enum: CONVERSATION_TYPES, default: "direct", index: true },
    participants: { type: [participantSchema], required: true },
    // Sorted "idA:idB" pair so a direct conversation exists at most once
    directKey: { type: String, default: undefined, index: { unique: true, sparse: true } },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    group: {
      name: { type: String, default: null },
      avatar: {
        url: { type: String, default: null },
        publicId: { type: String, default: null },
      },
    },
    lastMessage: { type: lastMessageSchema, default: null },
    lastMessageAt: { type: Date, default: Date.now },
    // userId -> unread count
    unread: { type: Map, of: Number, default: () => new Map() },
  },
  { timestamps: true }
);

conversationSchema.index({ "participants.userId": 1, lastMessageAt: -1, _id: -1 });

export function directKeyFor(userA, userB) {
  return [String(userA), String(userB)].sort().join(":");
}

const Conversation =
  mongoose.models.Conversation ?? mongoose.model("Conversation", conversationSchema);
export default Conversation;
