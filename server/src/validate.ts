const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

/** Adds a "https://" prefix to a schemeless link like "youtube.com/watch?v=x" so it can be parsed as a URL. */
export function normalizeYoutubeUrl(input: string): string {
  const trimmed = input.trim();
  return HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isValidYoutubeUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return YOUTUBE_HOSTS.has(url.hostname);
}
