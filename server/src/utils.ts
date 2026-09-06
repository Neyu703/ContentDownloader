export function errorMessage(err: unknown, fallback?: string): string {
  return err instanceof Error ? err.message : (fallback ?? String(err));
}

/** Whether `url` uses a scheme yt-dlp/the app actually supports (as opposed to e.g. ftp:, file:). */
export function isHttpOrHttps(url: URL): boolean {
  return url.protocol === "https:" || url.protocol === "http:";
}
