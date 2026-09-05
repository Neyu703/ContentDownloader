import { describe, expect, it } from "vitest";
import { detectPlatform } from "./registry.js";
import { Instagram } from "./Instagram.js";
import { SoundCloud } from "./SoundCloud.js";
import { TikTok } from "./TikTok.js";
import { Twitch } from "./Twitch.js";
import { Twitter } from "./Twitter.js";
import { Vimeo } from "./Vimeo.js";
import { YouTube } from "./YouTube.js";

describe("detectPlatform", () => {
  it("recognizes a standard youtube.com watch URL", () => {
    expect(detectPlatform("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeInstanceOf(YouTube);
  });

  it("recognizes a youtu.be short link", () => {
    expect(detectPlatform("https://youtu.be/dQw4w9WgXcQ")).toBeInstanceOf(YouTube);
  });

  it("accepts plain http (not just https)", () => {
    expect(detectPlatform("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBeInstanceOf(YouTube);
  });

  it("recognizes a TikTok URL", () => {
    expect(detectPlatform("https://www.tiktok.com/@someuser/video/123")).toBeInstanceOf(TikTok);
  });

  it("recognizes an Instagram URL", () => {
    expect(detectPlatform("https://www.instagram.com/reel/abc")).toBeInstanceOf(Instagram);
  });

  it("recognizes a Twitter/X URL", () => {
    expect(detectPlatform("https://x.com/someuser/status/123")).toBeInstanceOf(Twitter);
  });

  it("recognizes a SoundCloud URL", () => {
    expect(detectPlatform("https://soundcloud.com/someartist/sometrack")).toBeInstanceOf(SoundCloud);
  });

  it("recognizes a Vimeo URL", () => {
    expect(detectPlatform("https://vimeo.com/12345")).toBeInstanceOf(Vimeo);
  });

  it("recognizes a Twitch clip URL", () => {
    expect(detectPlatform("https://clips.twitch.tv/SomeClipSlug")).toBeInstanceOf(Twitch);
  });

  it("rejects a disallowed host", () => {
    expect(detectPlatform("https://example.com/watch?v=x")).toBeNull();
  });

  it("rejects a malformed URL", () => {
    expect(detectPlatform("not a url")).toBeNull();
  });

  it("rejects a non-http(s) scheme", () => {
    expect(detectPlatform("ftp://youtube.com/watch?v=x")).toBeNull();
  });

  it("accepts a schemeless link once normalized internally", () => {
    expect(detectPlatform("youtube.com/watch?v=x")).toBeInstanceOf(YouTube);
  });
});
