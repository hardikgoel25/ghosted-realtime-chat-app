import { describe, expect, it } from "vitest";
import { tokenizeLinks } from "./linkify";

describe("tokenizeLinks", () => {
  it("returns plain text untouched", () => {
    expect(tokenizeLinks("hello there")).toEqual([{ type: "text", value: "hello there" }]);
  });

  it("detects http(s) and www links and keeps trailing punctuation out of them", () => {
    expect(tokenizeLinks("see https://example.com/a?b=1, or www.ghosted.app.")).toEqual([
      { type: "text", value: "see " },
      { type: "link", value: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
      { type: "text", value: ", or " },
      { type: "link", value: "www.ghosted.app", href: "https://www.ghosted.app" },
      { type: "text", value: "." },
    ]);
  });

  it("never turns other schemes into links", () => {
    expect(tokenizeLinks("javascript:alert(1) and ftp://x.y")).toEqual([
      { type: "text", value: "javascript:alert(1) and ftp://x.y" },
    ]);
  });

  it("handles a link at the very start and end", () => {
    const tokens = tokenizeLinks("https://a.b/c");
    expect(tokens).toEqual([{ type: "link", value: "https://a.b/c", href: "https://a.b/c" }]);
  });
});
