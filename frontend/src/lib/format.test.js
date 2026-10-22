import { describe, expect, it } from "vitest";
import { dayLabel, lastSeenLabel, listTime, minutesBetween, sameDay } from "./format";

const now = new Date("2026-10-22T15:30:00");

describe("format helpers", () => {
  it("labels days relative to today", () => {
    expect(dayLabel(new Date("2026-10-22T09:00:00"), now)).toBe("Today");
    expect(dayLabel(new Date("2026-10-21T23:59:00"), now)).toBe("Yesterday");
    expect(dayLabel(new Date("2026-10-13T12:00:00"), now)).toBe("Tuesday, 13 October");
    expect(dayLabel(new Date("2025-03-01T12:00:00"), now)).toBe("1 March 2025");
  });

  it("compacts list timestamps", () => {
    expect(listTime(new Date("2026-10-22T09:05:00"), now)).toBe("09:05");
    expect(listTime(new Date("2026-10-21T09:05:00"), now)).toBe("Yesterday");
    expect(listTime(new Date("2026-10-19T09:05:00"), now)).toBe("Mon");
    expect(listTime(new Date("2026-09-01T09:05:00"), now)).toBe("1 Sep");
    expect(listTime(new Date("2025-09-01T09:05:00"), now)).toBe("01/09/25");
  });

  it("describes last seen", () => {
    expect(lastSeenLabel(null, now)).toBe("Offline");
    expect(lastSeenLabel(new Date("2026-10-22T15:29:50"), now)).toBe("Last seen just now");
    expect(lastSeenLabel(new Date("2026-10-22T15:10:00"), now)).toBe("Last seen 20 min ago");
    expect(lastSeenLabel(new Date("2026-10-22T08:00:00"), now)).toBe("Last seen today at 08:00");
    expect(lastSeenLabel(new Date("2026-10-21T22:15:00"), now)).toBe(
      "Last seen yesterday at 22:15"
    );
    expect(lastSeenLabel(new Date("2026-10-01T22:15:00"), now)).toBe("Last seen 1 Oct");
  });

  it("compares days and minutes", () => {
    expect(sameDay("2026-10-22T01:00:00", "2026-10-22T23:00:00")).toBe(true);
    expect(sameDay("2026-10-22T23:59:00", "2026-10-23T00:01:00")).toBe(false);
    expect(minutesBetween("2026-10-22T10:00:00", "2026-10-22T10:04:30")).toBe(4);
  });
});
