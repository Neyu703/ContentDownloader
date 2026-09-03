export function errorMessage(err: unknown, fallback?: string): string {
  return err instanceof Error ? err.message : (fallback ?? String(err));
}

// yt-dlp surfaces YouTube's own "Sign in to confirm you're not a bot" gate verbatim, including a
// raw stack of wiki links — not actionable for a user, since it requires real logged-in cookies to
// bypass, not anything this app can retry or work around on its own. Only used for responses sent
// to the app; the technical message still goes into the job log file for debugging.
const YOUTUBE_SIGNIN_REQUIRED_PATTERN = /sign in to confirm you.{1,2}re not a bot/i;

export function userFacingErrorMessage(err: unknown, fallback?: string): string {
  const raw = errorMessage(err, fallback);
  if (YOUTUBE_SIGNIN_REQUIRED_PATTERN.test(raw)) {
    return "Dieses Video verlangt eine YouTube-Anmeldung und kann nicht heruntergeladen werden.";
  }
  return raw;
}

/** Same permanent-failure check as userFacingErrorMessage() — used to decide whether a failed download attempt is worth retrying. */
export function isRetryableError(err: unknown): boolean {
  return !YOUTUBE_SIGNIN_REQUIRED_PATTERN.test(errorMessage(err));
}
