import type { ProgressUpdate } from "../progress.js";

export type MediaFormat = "audio" | "video";

export interface VideoInfo {
  title: string;
  duration: number;
  thumbnail: string | null;
  uploader: string | null;
}

export interface ConvertResult {
  id: string;
  filePath: string;
  title: string;
  ext: "mp3" | "mp4";
}

export interface PlaylistEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
}

export interface PlaylistInfo {
  title: string;
  entries: PlaylistEntry[];
  /** Total number of videos in the playlist, so the UI knows whether more pages remain. */
  totalCount: number | null;
}

export interface UserFacingError {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * One supported content source (YouTube, TikTok, ...). Every method here mirrors a function that
 * used to live in youtube.ts/validate.ts/utils.ts as a free function taking a URL — moved onto an
 * instance so each platform can override only what actually differs (see BasePlatform).
 */
export interface Platform {
  readonly id: string;
  /** Throws if this URL isn't actually usable by this platform. */
  checkAvailability(): void;
  fetchInfo(): Promise<VideoInfo>;
  buildFormatArgs(format: MediaFormat, quality: string): string[];
  download(format: MediaFormat, quality: string, onProgress: (update: ProgressUpdate) => void): Promise<ConvertResult>;
  /** Whether a failed download attempt is worth retrying, or is a known-permanent failure. */
  isRetryableError(err: unknown): boolean;
  describeError(err: unknown, fallbackRaw?: string): UserFacingError;
}

/** A platform that can also list a playlist's entries — not every platform has this concept. */
export interface PlaylistCapablePlatform extends Platform {
  fetchPlaylistInfo(start?: number, count?: number): Promise<PlaylistInfo>;
  /** Thumbnail to use for a playlist entry that yt-dlp didn't return one for, or null if there is none. */
  defaultThumbnail(entryId: string): string | null;
}

export function isPlaylistCapable(platform: Platform): platform is PlaylistCapablePlatform {
  return "fetchPlaylistInfo" in platform;
}
