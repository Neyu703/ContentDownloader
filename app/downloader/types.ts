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
  lastLine: string;
  /** Web: carried over from the preview fetched before submit. Native: resolved by the job itself once fetched. */
  thumbnail?: string | null;
  /** Local file path (native) or download URL (web) once phase is "done". */
  result: string | null;
  ext: "mp3" | "mp4" | null;
  error: string | null;
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
  message: string;
}

export interface Downloader {
  /** Current jobs plus setup state; fires once immediately and on every change. */
  subscribe(listener: (jobs: JobState[], setup: SetupState) => void): () => void;
  enqueue(request: DownloadRequest): Promise<string>;
  cancel(id: string): void;
  clearFinished(): void;
  /**
   * Native only — writes a rolling log of phase transitions and full stack traces to a cache
   * file for bug reports and returns its file:// URI.
   */
  getDebugLogFileUri?(): Promise<string>;
  /** Native only — copies a finished job's file into the device's public Downloads folder. */
  saveToDownloads?(job: JobState): Promise<void>;
  /** Web only (talks to the local server) — fetches title/duration/thumbnail for a preview before starting a download. */
  getVideoInfo?(url: string, signal?: AbortSignal): Promise<VideoInfo>;
  /** Web only — patches title/duration/thumbnail onto a job that was already started before the preview info arrived. */
  updateJobPreview?(id: string, info: PreviewPatch): void;
  /**
   * Lists one page of a playlist's entries (1-indexed start) without downloading anything.
   * Implemented on both platforms.
   */
  getPlaylistInfo(url: string, start: number): Promise<PlaylistInfo>;
}

export const PHASE_LABELS: Record<JobPhase, string> = {
  queued: "In der Warteschlange…",
  fetching_info: "Lade Video-Informationen…",
  downloading: "Lädt herunter…",
  converting: "Wird konvertiert…",
  merging: "Führt Video und Audio zusammen…",
  done: "Fertig!",
  error: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};
