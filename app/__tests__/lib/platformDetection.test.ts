import { detectPlatformId, PLATFORM_HOSTS } from "../../lib/platformDetection";
import { Instagram } from "../../server/platforms/Instagram";
import { SoundCloud } from "../../server/platforms/SoundCloud";
import { TikTok } from "../../server/platforms/TikTok";
import { Twitch } from "../../server/platforms/Twitch";
import { Twitter } from "../../server/platforms/Twitter";
import { Vimeo } from "../../server/platforms/Vimeo";
import { YouTube } from "../../server/platforms/YouTube";

describe("detectPlatformId", () => {
  it("recognizes the first platform checked (youtube)", () => {
    expect(detectPlatformId("https://www.youtube.com/watch?v=abc")).toBe("youtube");
  });

  it("recognizes youtu.be as youtube", () => {
    expect(detectPlatformId("https://youtu.be/abc")).toBe("youtube");
  });

  it("recognizes tiktok", () => {
    expect(detectPlatformId("https://vt.tiktok.com/abc")).toBe("tiktok");
  });

  it("recognizes instagram", () => {
    expect(detectPlatformId("https://www.instagram.com/p/abc")).toBe("instagram");
  });

  it("recognizes twitter/x", () => {
    expect(detectPlatformId("https://x.com/user/status/1")).toBe("twitter");
  });

  it("recognizes soundcloud", () => {
    expect(detectPlatformId("https://soundcloud.com/artist/track")).toBe("soundcloud");
  });

  it("recognizes vimeo", () => {
    expect(detectPlatformId("https://player.vimeo.com/video/1")).toBe("vimeo");
  });

  it("recognizes the last platform checked (twitch)", () => {
    expect(detectPlatformId("https://clips.twitch.tv/abc")).toBe("twitch");
  });

  it("returns null for a host that matches no known platform", () => {
    expect(detectPlatformId("https://example.com/video")).toBeNull();
  });

  it("returns null for a non-http(s) scheme", () => {
    expect(detectPlatformId("ftp://youtube.com/file")).toBeNull();
  });

  it("returns null for an unparsable string", () => {
    expect(detectPlatformId("not a url")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(detectPlatformId("")).toBeNull();
  });

  it("adds a https:// prefix to a schemeless link before parsing it", () => {
    expect(detectPlatformId("youtube.com/watch?v=abc")).toBe("youtube");
  });

  it("matches a host regardless of input casing (URL lowercases the hostname)", () => {
    expect(detectPlatformId("HTTPS://WWW.YOUTUBE.COM/watch?v=abc")).toBe("youtube");
  });

  it("every PLATFORM_HOSTS entry is itself recognized as its own platform", () => {
    for (const [platformId, hosts] of Object.entries(PLATFORM_HOSTS)) {
      for (const host of hosts) {
        expect(detectPlatformId(`https://${host}/x`)).toBe(platformId);
      }
    }
  });
});

// Guards against silent drift between this client-side mirror and the server's own source of
// truth (app/server/platforms/registry.ts, which points back here) — see that file's comment.
describe("PLATFORM_HOSTS stays in sync with the server platform classes' own HOSTS", () => {
  it.each([
    ["youtube", YouTube],
    ["tiktok", TikTok],
    ["instagram", Instagram],
    ["twitter", Twitter],
    ["soundcloud", SoundCloud],
    ["vimeo", Vimeo],
    ["twitch", Twitch],
  ] as const)("%s", (platformId, PlatformClass) => {
    expect(PLATFORM_HOSTS[platformId]).toEqual(PlatformClass.HOSTS);
  });
});
