import { describe, expect, it } from "vitest";
import { isValidYoutubeUrl, normalizeYoutubeUrl } from "./validate.js";

describe("isValidYoutubeUrl", () => {
  it("accepts a standard youtube.com watch URL", () => {
    expect(isValidYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts a youtu.be short link", () => {
    expect(isValidYoutubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts plain http (not just https)", () => {
    expect(isValidYoutubeUrl("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("rejects a disallowed host", () => {
    expect(isValidYoutubeUrl("https://vimeo.com/12345")).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(isValidYoutubeUrl("not a url")).toBe(false);
  });

  it("rejects a non-http(s) scheme", () => {
    expect(isValidYoutubeUrl("ftp://youtube.com/watch?v=x")).toBe(false);
  });

  it("accepts a schemeless link once normalized", () => {
    expect(isValidYoutubeUrl(normalizeYoutubeUrl("youtube.com/watch?v=x"))).toBe(true);
  });
});

describe("normalizeYoutubeUrl", () => {
  it("prepends https:// to a schemeless link", () => {
    expect(normalizeYoutubeUrl("youtube.com/watch?v=jNQXAC9IVRw")).toBe(
      "https://youtube.com/watch?v=jNQXAC9IVRw"
    );
  });

  it("leaves an already-schemed link unchanged", () => {
    expect(normalizeYoutubeUrl("http://youtube.com/watch?v=x")).toBe("http://youtube.com/watch?v=x");
  });

  it("trims surrounding whitespace before checking for a scheme", () => {
    expect(normalizeYoutubeUrl("  youtu.be/x  ")).toBe("https://youtu.be/x");
  });

  it("prepends https:// to a schemeless www. link", () => {
    expect(normalizeYoutubeUrl("www.youtube.com/watch?v=x")).toBe("https://www.youtube.com/watch?v=x");
  });
});
