import { initialsAvatar } from "../utils/avatar.js";

export const id = "001-users";
export const description =
  "Rename password→passwordHash, isDisabled→status, profilePic→avatar, add new user defaults";

const THIRD_PARTY_AVATAR = /avatar\.iran\.liara\.run/i;

/**
 * Idempotent: only documents still carrying a legacy field (or missing a new one) are touched,
 * so re-running it is a no-op.
 */
export async function up(db, { dryRun = false, logger } = {}) {
  const users = db.collection("users");
  const legacy = await users
    .find({
      $or: [
        { password: { $exists: true } },
        { isDisabled: { $exists: true } },
        { profilePic: { $exists: true } },
        { status: { $exists: false } },
        { avatar: { $exists: false } },
        { privacy: { $exists: false } },
        { notificationPrefs: { $exists: false } },
      ],
    })
    .toArray();

  let updated = 0;
  for (const u of legacy) {
    const $set = {};
    const $unset = {};

    if (u.password !== undefined) {
      if (u.passwordHash === undefined) $set.passwordHash = u.password;
      $unset.password = "";
    }

    if (u.isDisabled !== undefined) {
      $set.status = u.isDisabled ? "disabled" : "active";
      $unset.isDisabled = "";
    } else if (!u.status) {
      $set.status = "active";
    }

    if (u.profilePic !== undefined) {
      const keep = u.profilePic && !THIRD_PARTY_AVATAR.test(u.profilePic);
      $set.avatar = keep
        ? { url: u.profilePic, publicId: null }
        : { url: initialsAvatar(u.fullname ?? "", u.username ?? ""), publicId: null };
      $unset.profilePic = "";
    } else if (!u.avatar?.url) {
      $set.avatar = { url: initialsAvatar(u.fullname ?? "", u.username ?? ""), publicId: null };
    }

    if (!u.privacy) $set.privacy = { showLastSeen: true, readReceipts: true };
    if (!u.notificationPrefs)
      $set.notificationPrefs = { sound: true, desktop: false, preview: true };
    if (u.bio === undefined) $set.bio = "";
    if (u.failedLoginCount === undefined) $set.failedLoginCount = 0;
    if (u.lockedUntil === undefined) $set.lockedUntil = null;
    if (u.lastSeenAt === undefined) $set.lastSeenAt = null;
    if (u.passwordChangedAt === undefined) $set.passwordChangedAt = null;
    if (u.emailVerified === undefined) $set.emailVerified = false;

    const update = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    if (!Object.keys(update).length) continue;

    logger?.debug({ userId: String(u._id), update }, "Migrating user");
    if (!dryRun) await users.updateOne({ _id: u._id }, update);
    updated += 1;
  }

  // Messages: make sure new fields exist so queries and serializers see consistent shapes
  const messages = db.collection("messages");
  const messageResult = dryRun
    ? { modifiedCount: await messages.countDocuments({ clientId: { $exists: false } }) }
    : await messages.updateMany(
        { clientId: { $exists: false } },
        { $set: { clientId: null, imagePublicId: null } }
      );

  return {
    usersScanned: legacy.length,
    usersUpdated: updated,
    messagesUpdated: messageResult.modifiedCount,
  };
}
