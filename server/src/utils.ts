export function errorMessage(err: unknown, fallback?: string): string {
  return err instanceof Error ? err.message : (fallback ?? String(err));
}

// yt-dlp surfaces YouTube's own "Sign in to confirm you're not a bot" gate verbatim, including a
// raw stack of wiki links — not actionable for a user, since it requires real logged-in cookies to
// bypass, not anything this app can retry or work around on its own. Only used for responses sent
// to the app; the technical message still goes into the job log file for debugging.
const YOUTUBE_SIGNIN_REQUIRED_PATTERN = /sign in to confirm you.{1,2}re not a bot/i;

function isSignInGateError(message: string): boolean {
  return YOUTUBE_SIGNIN_REQUIRED_PATTERN.test(message);
}

export interface UserFacingError {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * Preserves userFacingErrorMessage()'s old behavior exactly: `err.message` (or `fallbackRaw`, only
 * used when `err` isn't an Error instance) passes through as the `errors.raw` param unless it's the
 * sign-in gate — the caller's fallback strings were always a rare last resort, never the normal
 * display text, so this must not suppress specific error detail on every ordinary failure.
 */
export function userFacingError(err: unknown, fallbackRaw?: string): UserFacingError {
  const raw = errorMessage(err, fallbackRaw);
  return isSignInGateError(raw) ? { key: "errors.signInRequired" } : { key: "errors.raw", params: { raw } };
}

/** Same permanent-failure check as userFacingError() — used to decide whether a failed download attempt is worth retrying. */
export function isRetryableError(err: unknown): boolean {
  return !isSignInGateError(errorMessage(err));
}
