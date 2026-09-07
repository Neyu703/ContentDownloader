import type { JobPhase, PlaylistEntry, PlaylistInfo, SetupPhase } from "../shared-types";

export type { JobPhase, PlaylistEntry, PlaylistInfo, SetupPhase };

export type MediaFormat = "audio" | "video";

export interface VideoInfo {
  title: string;
  duration: number;
  thumbnail: string | null;
  uploader: string | null;
}

/** Partial video metadata used to patch a job that was already started before the full preview arrived. */
export type PreviewPatch = { title?: string | null; duration?: number | null; thumbnail?: string | null };

export interface JobState {
  id: string;
  url: string;
  format: MediaFormat;
  quality: string;
  phase: JobPhase;
  title: string | null;
  /** Web only — carried over from the preview fetched before submit; native jobs never set this. */
  duration?: number | null;
  progress: number | null;
  downloadedMB?: number;
  totalMB?: number;
  speedMBs?: number;
  etaSeconds: number | null;
  /** Native only — the raw last yt-dlp output line, genuinely untranslated diagnostic text. */
  lastLine: string;
  /** Translatable status message (e.g. a retry notice), rendered via `translate(lastLineKey, lastLineParams)`. */
  lastLineKey?: string;
  lastLineParams?: Record<string, string | number>;
  /** Web: carried over from the preview fetched before submit. Native: resolved by the job itself once fetched. */
  thumbnail?: string | null;
  /** Local file path (native) or download URL (web) once phase is "done". */
  result: string | null;
  ext: "mp3" | "mp4" | null;
  errorKey?: string;
  errorParams?: Record<string, string | number>;
  createdAt: number;
  updatedAt: number;
  /** Set when this job was started as part of a playlist download; jobs share one groupId/groupTitle. */
  groupId?: string | null;
  groupTitle?: string | null;
}

export interface DownloadRequest {
  url: string;
  format: MediaFormat;
  quality: string;
  /** Web only — title/duration/thumbnail already fetched for the preview, carried into the job so JobCard can show them immediately instead of just the raw URL. */
  title?: string | null;
  durationSeconds?: number | null;
  thumbnail?: string | null;
  /** Set when this request is one entry of a playlist download; jobs share one groupId/groupTitle. */
  groupId?: string | null;
  groupTitle?: string | null;
}

export interface SetupState {
  phase: SetupPhase;
  /** Translation key (native) or empty string (web, which has no setup phase). Render via `translate(message, messageParams)`. */
  message: string;
  messageParams?: Record<string, string | number>;
}

export interface Downloader {
  /** Current jobs plus setup state; fires once immediately and on every change. */
  subscribe(listener: (jobs: JobState[], setup: SetupState) => void): () => void;
  enqueue(request: DownloadRequest): Promise<string>;
  cancel(id: string): void;
  /** Dismisses a single finished (done/error/cancelled) job, e.g. right before retrying it. No-op for an active job. */
  removeJob(id: string): void;
  clearFinished(): void;
  /**
   * Native only — writes a rolling log of phase transitions and full stack traces to a cache
   * file for bug reports and returns its file:// URI.
   */
  getDebugLogFileUri?(): Promise<string>;
  /**
   * Native only — copies a finished job's file into the device's public Downloads folder (or the
   * folder picked via pickDownloadsFolder(), if any). `filenameOverride`, when given, replaces the
   * auto-picked title as the saved file's base name (still passed through sanitizeFilename()).
   */
  saveToDownloads?(job: JobState, filenameOverride?: string): Promise<void>;
  /** Native only — opens Android's folder picker; returns the picked folder's display name, or null if the user cancelled. */
  pickDownloadsFolder?(): Promise<string | null>;
  /** Native only — the currently picked folder's display name, or null when using the default public Downloads folder. */
  getDownloadsFolderName?(): Promise<string | null>;
  /** Native only — resets saveToDownloads() back to the default public Downloads folder. */
  resetDownloadsFolder?(): Promise<void>;
  /** Web only (talks to the local server) — fetches title/duration/thumbnail for a preview before starting a download. */
  getVideoInfo?(url: string, signal?: AbortSignal): Promise<VideoInfo>;
  /** Web only — patches title/duration/thumbnail onto a job that was already started before the preview info arrived. */
  updateJobPreview?(id: string, info: PreviewPatch): void;
  /**
   * Lists one page of a playlist's entries (1-indexed start) without downloading anything.
   * Implemented on both platforms.
   */
  getPlaylistInfo(url: string, start: number): Promise<PlaylistInfo>;
  /** Stores a Netscape-format cookies.txt, read by every subsequent yt-dlp invocation. Implemented on both platforms. */
  importCookies(cookiesText: string): Promise<void>;
  /** Whether cookies are currently stored, and when they were last imported (native never reports a date). Implemented on both platforms. */
  getCookiesStatus(): Promise<{ present: boolean; updatedAt: string | null }>;
  /** Removes the stored cookies file, if any. Implemented on both platforms. */
  clearCookies(): Promise<void>;
}
