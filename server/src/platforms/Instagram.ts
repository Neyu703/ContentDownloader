import { errorMessage } from "../utils.js";
import { BasePlatform } from "./BasePlatform.js";
import type { UserFacingError } from "./Platform.js";

// yt-dlp's Instagram extractor raises this (wording may vary slightly across versions) when a post
// is an image-only slideshow/carousel with no video stream to extract.
const NO_VIDEO_IN_POST_PATTERN = /no video/i;

export class Instagram extends BasePlatform {
  readonly id = "instagram";

  static readonly HOSTS = ["instagram.com", "www.instagram.com"];

  private isSlideshowError(err: unknown, fallbackRaw?: string): boolean {
    return NO_VIDEO_IN_POST_PATTERN.test(errorMessage(err, fallbackRaw));
  }

  /** A slideshow post will never gain a video format on retry — every other failure is treated as transient. */
  override isRetryableError(err: unknown): boolean {
    return !this.isSlideshowError(err);
  }

  override describeError(err: unknown, fallbackRaw?: string): UserFacingError {
    return this.isSlideshowError(err, fallbackRaw)
      ? { key: "errors.instagramSlideshowNotSupported" }
      : super.describeError(err, fallbackRaw);
  }
}
