import { isHttpOrHttps } from "../utils.js";
import { normalizeUrl } from "../url.js";
import { Instagram } from "./Instagram.js";
import type { Platform } from "./Platform.js";
import { SoundCloud } from "./SoundCloud.js";
import { TikTok } from "./TikTok.js";
import { Twitch } from "./Twitch.js";
import { Twitter } from "./Twitter.js";
import { Vimeo } from "./Vimeo.js";
import { YouTube } from "./YouTube.js";

/**
 * Normalizes `rawUrl` and instantiates the matching Platform, or returns null if no supported
 * platform's host list matches (or the URL doesn't parse as http/https at all). Deliberately an
 * explicit if/else chain naming each class instead of looping over a class array — a stack trace
 * or "go to definition" then points straight at the concrete platform being constructed.
 */
export function detectPlatform(rawUrl: string): Platform | null {
  const normalizedUrl = normalizeUrl(rawUrl);
  let hostname: string;
  try {
    const parsedUrl = new URL(normalizedUrl);
    if (!isHttpOrHttps(parsedUrl)) return null;
    hostname = parsedUrl.hostname;
  } catch {
    return null;
  }

  let platform: Platform;
  if (YouTube.HOSTS.includes(hostname)) platform = new YouTube(normalizedUrl);
  else if (TikTok.HOSTS.includes(hostname)) platform = new TikTok(normalizedUrl);
  else if (Instagram.HOSTS.includes(hostname)) platform = new Instagram(normalizedUrl);
  else if (Twitter.HOSTS.includes(hostname)) platform = new Twitter(normalizedUrl);
  else if (SoundCloud.HOSTS.includes(hostname)) platform = new SoundCloud(normalizedUrl);
  else if (Vimeo.HOSTS.includes(hostname)) platform = new Vimeo(normalizedUrl);
  else if (Twitch.HOSTS.includes(hostname)) platform = new Twitch(normalizedUrl);
  else return null;

  try {
    platform.checkAvailability();
  } catch {
    return null;
  }
  return platform;
}
