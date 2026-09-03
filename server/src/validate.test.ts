import { describe, expect, it } from "vitest";
import { isValidYoutubeUrl } from "./validate.js";

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
});
