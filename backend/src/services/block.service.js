import { ERROR_CODES, USER_STATUS } from "@ghosted/shared";
import Block from "../models/block.model.js";
import User from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { serializeUser } from "../utils/serializers.js";

const idOf = (value) => String(value?._id ?? value);

export async function blockUser(me, userId) {
  if (idOf(userId) === idOf(me._id)) throw ApiError.badRequest("You cannot block yourself");
  const user = await User.findById(userId).select("status").lean();
  if (!user || user.status === USER_STATUS.DELETED) throw ApiError.notFound("User not found");
  await Block.updateOne(
    { blockerId: me._id, blockedId: userId },
    { $setOnInsert: { blockerId: me._id, blockedId: userId } },
    { upsert: true }
  );
}

export async function unblockUser(me, userId) {
  await Block.deleteOne({ blockerId: me._id, blockedId: userId });
}

export async function listBlocked(me) {
  const docs = await Block.find({ blockerId: me._id })
    .sort({ createdAt: -1 })
    .populate("blockedId")
    .lean();
  return docs.filter((d) => d.blockedId).map((d) => serializeUser(d.blockedId));
}

/** Both directions of blocking for one user, as sets of user ids. */
export async function blockSets(userId) {
  const docs = await Block.find({ $or: [{ blockerId: userId }, { blockedId: userId }] })
    .select("blockerId blockedId")
    .lean();
  const me = idOf(userId);
  const byMe = new Set();
  const byThem = new Set();
  for (const d of docs) {
    if (idOf(d.blockerId) === me) byMe.add(idOf(d.blockedId));
    else byThem.add(idOf(d.blockerId));
  }
  return { byMe, byThem };
}

export async function isBlockedEither(a, b) {
  return Boolean(
    await Block.exists({
      $or: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    })
  );
}

export async function assertNotBlocked(me, otherIds) {
  for (const other of otherIds) {
    if (await isBlockedEither(me, other)) {
      throw ApiError.forbidden("You can't message this person", ERROR_CODES.BLOCKED);
    }
  }
}
