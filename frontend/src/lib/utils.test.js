import { describe, expect, it } from "vitest";
import { initialsOf, messagePreview } from "./utils";

describe("messagePreview", () => {
  it("prefers text, truncates it, and marks photos", () => {
    expect(messagePreview({ text: "hello" })).toBe("hello");
    expect(messagePreview({ text: "x".repeat(80) })).toBe(`${"x".repeat(70)}…`);
    expect(messagePreview({ text: "", attachments: [{ url: "a" }] })).toBe("📷 Photo");
    expect(messagePreview({ text: "look", hasAttachments: true })).toBe("📷 look");
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
