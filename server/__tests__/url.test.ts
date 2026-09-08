import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../src/url.js";

describe("normalizeUrl", () => {
  it("prepends https:// to a schemeless link", () => {
    expect(normalizeUrl("youtube.com/watch?v=jNQXAC9IVRw")).toBe("https://youtube.com/watch?v=jNQXAC9IVRw");
  });

  it("leaves an already-schemed link unchanged", () => {
    expect(normalizeUrl("http://youtube.com/watch?v=x")).toBe("http://youtube.com/watch?v=x");
  });

  it("trims surrounding whitespace before checking for a scheme", () => {
    expect(normalizeUrl("  youtu.be/x  ")).toBe("https://youtu.be/x");
  });

  it("prepends https:// to a schemeless www. link", () => {
    expect(normalizeUrl("www.youtube.com/watch?v=x")).toBe("https://www.youtube.com/watch?v=x");
  });
});
