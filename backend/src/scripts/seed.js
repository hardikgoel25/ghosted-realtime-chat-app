import { pathToFileURL } from "node:url";
import { env, isProd } from "../config/env.js";
import { logger } from "../config/logger.js";
import { connectDb, disconnectDb } from "../config/db.js";
import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";
import { hashPassword } from "../services/auth.service.js";
import { findOrCreateDirect } from "../services/conversation.service.js";
import { sendMessage } from "../services/message.service.js";
import { initialsAvatar } from "../utils/avatar.js";

export const DEMO_PASSWORD = "ghosted-demo-2026!";

const DEMO_USERS = [
  {
    fullname: "Alice Rivera",
    username: "alice",
    gender: "female",
    bio: "Product designer. Coffee first.",
  },
  {
    fullname: "Bob Okafor",
    username: "bob",
    gender: "male",
    bio: "Backend things. Ask me about sockets.",
  },
  { fullname: "Casey Nguyen", username: "casey", gender: "prefer not to say", bio: "QA & docs." },
];

const DEMO_MESSAGES = [
  ["alice", "bob", "Hey Bob, did the realtime stuff land?"],
  ["bob", "alice", "Yep — typing indicators and presence are in."],
  ["alice", "bob", "Love it. Casey, you around?"],
  ["casey", "alice", "Here! Just reviewing the migration script."],
  ["alice", "casey", "Perfect, ping me if anything looks off."],
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

  const demoIds = Object.values(byUsername).map((u) => u._id);
  const existing = await Conversation.countDocuments({ "participants.userId": { $in: demoIds } });
  if (existing === 0) {
    for (const [from, to, text] of DEMO_MESSAGES) {
      const { conversation } = await findOrCreateDirect(byUsername[from], byUsername[to]._id);
      await sendMessage(byUsername[from], conversation._id, { text });
    }
    logger.info({ count: DEMO_MESSAGES.length }, "Created demo conversations");
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
        { usernames, demoPassword: DEMO_PASSWORD, db: env.MONGODB_URI.split("@").pop() },
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
