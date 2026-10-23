import { describe, expect, it } from "vitest";
import {
  activeMembers,
  isGroupAdmin,
  matchesQuery,
  previewFor,
  readersOf,
  systemMessageText,
} from "./conversationHelpers";

const me = "me";
const user = (id, fullname, extra = {}) => ({
  userId: id,
  role: "member",
  leftAt: null,
  lastReadAt: null,
  user: { _id: id, fullname, username: fullname.toLowerCase().replace(" ", "_") },
  ...extra,
});
const group = {
  _id: "g1",
  type: "group",
  group: { name: "Weekend plans" },
  participants: [
    user(me, "Me Myself", { role: "admin" }),
    user("bob", "Bob Okafor", { lastReadAt: "2026-10-23T10:05:00Z" }),
    user("casey", "Casey Nguyen"),
    user("dana", "Dana Left", { leftAt: "2026-10-22T00:00:00Z" }),
  ],
  lastMessage: null,
};

describe("systemMessageText", () => {
  const sys = (senderId, kind, targetIds = [], text = "") => ({
    senderId,
    type: "system",
    system: { kind, targetIds, text },
  });

  it("names the actor and the people concerned", () => {
    expect(systemMessageText(sys("bob", "member_added", ["casey", me]), group, me)).toBe(
      "Bob added Casey and You"
    );
    expect(systemMessageText(sys(me, "group_renamed", [], "Trip"), group, me)).toBe(
      "You renamed the group to “Trip”"
    );
    expect(systemMessageText(sys("casey", "member_left", ["casey"]), group, me)).toBe("Casey left");
    expect(systemMessageText(sys("bob", "admin_granted", ["casey"]), group, me)).toBe(
      "Bob made Casey an admin"
    );
  });

  it("falls back for people who are no longer around", () => {
    expect(systemMessageText(sys("ghost", "member_added", ["dana"]), group, me)).toBe(
      "A former member added Dana"
    );
  });
});

describe("previews and membership", () => {
  it("prefixes group previews with the sender and renders system previews", () => {
    const withText = {
      ...group,
      lastMessage: { senderId: "bob", type: "text", text: "lunch?", attachments: [] },
    };
    expect(previewFor(withText, me)).toBe("Bob: lunch?");
    const withSystem = {
      ...group,
      lastMessage: { senderId: "bob", type: "system", system: { kind: "member_left" } },
    };
    expect(previewFor(withSystem, me)).toBe("Bob left");
  });

  it("ignores former members and knows who is admin", () => {
    expect(activeMembers(group).map((p) => p.userId)).toEqual([me, "bob", "casey"]);
    expect(isGroupAdmin(group, me)).toBe(true);
    expect(isGroupAdmin(group, "bob")).toBe(false);
    expect(matchesQuery(group, me, "casey")).toBe(true);
    expect(matchesQuery(group, me, "dana")).toBe(false);
  });

  it("lists readers of my message from their read cursors", () => {
    const mine = { senderId: me, createdAt: "2026-10-23T10:00:00Z" };
    expect(readersOf(mine, group, me).map((p) => p.userId)).toEqual(["bob"]);
    const later = { senderId: me, createdAt: "2026-10-23T10:10:00Z" };
    expect(readersOf(later, group, me)).toEqual([]);
  });
});
