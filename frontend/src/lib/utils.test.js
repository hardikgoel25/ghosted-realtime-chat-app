import { describe, expect, it } from "vitest";
import { formatDuration, initialsOf, messagePreview } from "./utils";

describe("messagePreview", () => {
  it("prefers text, truncates it, and marks attachments by kind", () => {
    expect(messagePreview({ text: "hello" })).toBe("hello");
    expect(messagePreview({ text: "x".repeat(80) })).toBe(`${"x".repeat(70)}…`);
    expect(messagePreview({ text: "", attachments: [{ url: "a" }] })).toBe("📷 Photo");
    expect(messagePreview({ text: "", attachments: [{ kind: "file", url: "a" }] })).toBe("📎 File");
    expect(messagePreview({ text: "", attachments: [{ kind: "audio", url: "a" }] })).toBe(
      "🎤 Voice message"
    );
    expect(messagePreview({ text: "look", hasAttachments: true })).toBe("📷 look");
    expect(messagePreview({ text: "", hasAttachments: true, type: "file" })).toBe("📎 File");
    expect(messagePreview({ text: "gone", deletedAt: "2026-01-01" })).toBe("Message deleted");
    expect(messagePreview({ text: "  spaced   out \n lines " })).toBe("spaced out lines");
  });
});

describe("initialsOf", () => {
  it("builds up to two initials", () => {
    expect(initialsOf("Alice Rivera")).toBe("AR");
    expect(initialsOf("madonna")).toBe("M");
    expect(initialsOf("")).toBe("?");
  });
});

describe("formatDuration", () => {
  it("renders m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(4200)).toBe("0:04");
    expect(formatDuration(125_000)).toBe("2:05");
  });
});
