import { Instagram } from "../../../server/platforms/Instagram.js";

function instagram(url = "https://www.instagram.com/p/abc123/") {
  return new Instagram(url);
}

describe("isRetryableError", () => {
  it("is false for a slideshow/carousel post with no video", () => {
    expect(instagram().isRetryableError(new Error("ERROR: There is no video in this post"))).toBe(false);
  });

  it("is true for any other error", () => {
    expect(instagram().isRetryableError(new Error("HTTP Error 403: Forbidden"))).toBe(true);
  });
});

describe("describeError", () => {
  it("rewrites a no-video error to the slideshow-not-supported key", () => {
    expect(instagram().describeError(new Error("There is no video in this post"))).toEqual({
      key: "errors.instagramSlideshowNotSupported",
    });
  });

  it("matches the no-video pattern case-insensitively", () => {
    expect(instagram().describeError(new Error("NO VIDEO FORMATS FOUND"))).toEqual({
      key: "errors.instagramSlideshowNotSupported",
    });
  });

  it("passes through a non-matching message as the raw key's param", () => {
    expect(instagram().describeError(new Error("network timeout"))).toEqual({
      key: "errors.raw",
      params: { raw: "network timeout" },
    });
  });

  it("uses the fallback as the raw param when err isn't an Error instance", () => {
    expect(instagram().describeError("boom", "fallback")).toEqual({
      key: "errors.raw",
      params: { raw: "fallback" },
    });
  });
});
