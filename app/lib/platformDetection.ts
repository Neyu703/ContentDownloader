export type PlatformId = "youtube" | "tiktok" | "instagram" | "twitter" | "soundcloud" | "vimeo" | "twitch";

export const PLATFORM_HOSTS: Record<PlatformId, string[]> = {
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"],
  tiktok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  instagram: ["instagram.com", "www.instagram.com"],
  twitter: ["twitter.com", "www.twitter.com", "x.com", "www.x.com"],
  soundcloud: ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"],
  vimeo: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
  twitch: ["twitch.tv", "www.twitch.tv", "clips.twitch.tv", "m.twitch.tv"],
};

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

/**
 * Adds a "https://" prefix to a schemeless link like "youtube.com/watch?v=x" so it can be parsed
 * as a URL. Duplicated from app/server/url.ts's normalizeUrl on purpose: that file lives under
 * app/server's NodeNext build and pulling it into RN/Metro-bundled UI code isn't the point of
 * this module.
 */
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Client-side counterpart to app/server/platforms/registry.ts's detectPlatform(): recognizes
 * which supported platform a URL belongs to, without instantiating a Platform or calling
 * checkAvailability() — "recognized platform", not "guaranteed downloadable". The actual submit
 * still goes through the real server/native validation.
 */
export function detectPlatformId(rawUrl: string): PlatformId | null {
  let hostname: string;
  try {
    const parsedUrl = new URL(normalizeUrl(rawUrl));
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") return null;
    hostname = parsedUrl.hostname;
  } catch {
    return null;
  }

  for (const platformId of Object.keys(PLATFORM_HOSTS) as PlatformId[]) {
    if (PLATFORM_HOSTS[platformId].includes(hostname)) return platformId;
  }
  return null;
}
