import mongoose from "mongoose";
import { GENDERS, LIMITS, USERNAME_REGEX, USER_STATUS } from "@ghosted/shared";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    fullname: {
      type: String,
      required: true,
      trim: true,
      minlength: LIMITS.FULLNAME_MIN,
      maxlength: LIMITS.FULLNAME_MAX,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: LIMITS.USERNAME_MIN,
      maxlength: LIMITS.USERNAME_MAX,
      match: USERNAME_REGEX,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: undefined,
      index: { unique: true, sparse: true },
    },
    emailVerified: { type: Boolean, default: false },
    // Never selected by default: callers that need it must ask for "+passwordHash"
    passwordHash: { type: String, required: true, select: false },
    bio: { type: String, default: "", maxlength: LIMITS.BIO_MAX },
    gender: { type: String, required: true, enum: GENDERS },
    avatar: {
      url: { type: String, default: "" },
      publicId: { type: String, default: null },
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    lastSeenAt: { type: Date, default: null },
    privacy: {
      showLastSeen: { type: Boolean, default: true },
      readReceipts: { type: Boolean, default: true },
    },
    notificationPrefs: {
      sound: { type: Boolean, default: true },
      desktop: { type: Boolean, default: false },
      preview: { type: Boolean, default: true },
    },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ fullname: 1 });

userSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.failedLoginCount;
    delete ret.lockedUntil;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.models.User ?? mongoose.model("User", userSchema);
export default User;
