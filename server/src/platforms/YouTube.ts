import { BasePlatform } from "./BasePlatform.js";
import { PlaylistCapableBasePlatform } from "./PlaylistCapableBasePlatform.js";
import type { UserFacingError } from "./Platform.js";

// yt-dlp surfaces YouTube's own "Sign in to confirm you're not a bot" gate verbatim, including a
// raw stack of wiki links — not actionable for a user, since it requires real logged-in cookies to
// bypass, not anything this app can retry or work around on its own. Only used for responses sent
// to the app; the technical message still goes into the job log file for debugging.
const SIGN_IN_GATE_PATTERN = /sign in to confirm you.{1,2}re not a bot/i;

export class YouTube extends PlaylistCapableBasePlatform {
  readonly id = "youtube";

  static readonly HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"];

  private static readonly isSignInGateError = BasePlatform.permanentFailureMatcher(SIGN_IN_GATE_PATTERN);

  /** The known-permanent sign-in gate is never worth retrying; every other failure is treated as transient. */
  override isRetryableError(err: unknown): boolean {
    return !YouTube.isSignInGateError(err);
  }

  override describeError(err: unknown, fallbackRaw?: string): UserFacingError {
    return YouTube.isSignInGateError(err, fallbackRaw)
      ? { key: "errors.signInRequired" }
      : super.describeError(err, fallbackRaw);
  }

  override defaultThumbnail(entryId: string): string | null {
    return `https://i.ytimg.com/vi/${entryId}/hqdefault.jpg`;
  }
}
