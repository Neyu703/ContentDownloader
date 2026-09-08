const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

/** Adds a "https://" prefix to a schemeless link like "youtube.com/watch?v=x" so it can be parsed as a URL. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}
