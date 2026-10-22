import { pathToFileURL } from "node:url";
import { env, isProd } from "../config/env.js";
import { logger } from "../config/logger.js";
import { connectDb, disconnectDb } from "../config/db.js";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { hashPassword } from "../services/auth.service.js";
import { initialsAvatar } from "../utils/avatar.js";

export const DEMO_PASSWORD = "ghosted-demo-2026!";

const DEMO_USERS = [
  { fullname: "Alice Rivera", username: "alice", gender: "female" },
  { fullname: "Bob Okafor", username: "bob", gender: "male" },
  { fullname: "Casey Nguyen", username: "casey", gender: "prefer not to say" },
];

const DEMO_MESSAGES = [
  ["alice", "bob", "Hey Bob, did the realtime stuff land?"],
  ["bob", "alice", "Yep — typing indicators and presence are in."],
  ["alice", "bob", "Love it. Casey, you around?"],
  ["casey", "alice", "Here! Just reviewing the migration script."],
];

export async function seed() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const byUsername = {};
  for (const demo of DEMO_USERS) {
    let user = await User.findOne({ username: demo.username });
    if (!user) {
      user = await User.create({
        ...demo,
        passwordHash,
        avatar: { url: initialsAvatar(demo.fullname, demo.username), publicId: null },
      });
      logger.info({ username: demo.username }, "Created demo user");
    }
    byUsername[demo.username] = user;
  }

  const existing = await Message.countDocuments({
    senderId: { $in: Object.values(byUsername).map((u) => u._id) },
  });
  if (existing === 0) {
    for (const [from, to, text] of DEMO_MESSAGES) {
      await Message.create({
        senderId: byUsername[from]._id,
        receiverId: byUsername[to]._id,
        text,
      });
    }
    logger.info({ count: DEMO_MESSAGES.length }, "Created demo messages");
  }
  return Object.keys(byUsername);
}

const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  if (isProd && !process.argv.includes("--force")) {
    logger.error("Refusing to seed a production database without --force");
    process.exit(1);
  }
  connectDb()
    .then(seed)
    .then(async (usernames) => {
      logger.info(
        { usernames, password: DEMO_PASSWORD, db: env.MONGODB_URI.split("@").pop() },
        "Seed complete"
      );
      await disconnectDb();
    })
    .catch(async (err) => {
      logger.error({ err }, "Seed failed");
      await disconnectDb().catch(() => {});
      process.exitCode = 1;
    });
}
