import { describe, expect, it } from "vitest";
import { annotateMessages, messageStatus } from "./messageStatus";

const me = "me";
const other = "other";
const at = (s) => `2026-10-22T10:${s}:00.000Z`;
const conversation = (overrides = {}) => ({
  participants: [
    { userId: me, lastReadAt: null, lastDeliveredAt: null },
    { userId: other, lastReadAt: null, lastDeliveredAt: null, ...overrides },
  ],
});

describe("messageStatus", () => {
  const mine = { senderId: me, createdAt: at("05") };

  it("tracks pending and failed local state first", () => {
    expect(messageStatus({ ...mine, pending: true }, conversation(), me)).toBe("pending");
    expect(messageStatus({ ...mine, failed: true }, conversation(), me)).toBe("failed");
  });

  it("derives sent, delivered and seen from the other side's cursors", () => {
    expect(messageStatus(mine, conversation(), me)).toBe("sent");
    expect(messageStatus(mine, conversation({ lastDeliveredAt: at("04") }), me)).toBe("sent");
    expect(messageStatus(mine, conversation({ lastDeliveredAt: at("05") }), me)).toBe("delivered");
    expect(
      messageStatus(mine, conversation({ lastDeliveredAt: at("06"), lastReadAt: at("06") }), me)
    ).toBe("seen");
  });

  it("returns null for other people's messages", () => {
    expect(messageStatus({ senderId: other, createdAt: at("05") }, conversation(), me)).toBeNull();
  });
});

describe("annotateMessages", () => {
  // Local-time timestamps (no "Z") so the day boundary holds in every timezone
  const msgs = [
    { _id: "1", senderId: other, createdAt: new Date("2026-10-21T23:58:00").toISOString() },
    { _id: "2", senderId: other, createdAt: new Date("2026-10-22T09:00:00").toISOString() },
    { _id: "3", senderId: other, createdAt: new Date("2026-10-22T09:02:00").toISOString() },
    { _id: "4", senderId: me, createdAt: new Date("2026-10-22T09:03:00").toISOString() },
    { _id: "5", senderId: me, createdAt: new Date("2026-10-22T09:20:00").toISOString() },
  ];

  it("inserts day separators and groups bursts from the same sender", () => {
    const rows = annotateMessages(msgs, { meId: me });
    expect(rows.map((r) => r.showDay)).toEqual([true, true, false, false, false]);
    expect(rows.map((r) => r.groupStart)).toEqual([true, true, false, true, true]);
    expect(rows.map((r) => r.groupEnd)).toEqual([true, false, true, true, true]);
  });

  it("places the new-messages divider once, on the first unread message from others", () => {
    const marker = new Date("2026-10-22T08:00:00").toISOString();
    const rows = annotateMessages(msgs, { meId: me, firstUnreadAfter: marker });
    expect(rows.map((r) => r.firstUnread)).toEqual([false, true, false, false, false]);
    expect(annotateMessages(msgs, { meId: me }).some((r) => r.firstUnread)).toBe(false);
  });
});
