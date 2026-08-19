export type MediaFormat = "audio" | "video";

/**
 * Every phase a download can be in, on both platforms. Web never produces "queued" (the server
 * starts jobs immediately) or "merging" (it only reports "converting"), but the union is shared so
 * the UI has one set of labels to maintain.
 */
export type JobPhase =
  | "queued"
  | "fetching_info"
  | "downloading"
  | "converting"
  | "merging"
  | "done"
  | "error"
  | "cancelled";

export interface JobState {
  id: string;
  url: string;
  format: MediaFormat;
  quality: string;
  phase: JobPhase;
  title: string | null;
  progress: number | null;
  downloadedMB?: number;
  totalMB?: number;
  speedMBs?: number;
  etaSeconds: number | null;
  lastLine: string;
  /** Local file path (native) or download URL (web) once phase is "done". */
  result: string | null;
  ext: "mp3" | "mp4" | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DownloadRequest {
  url: string;
  format: MediaFormat;
  quality: string;
}

/** One-time setup before the first download can start. Native only unpacks/updates yt-dlp once. */
export type SetupPhase = "idle" | "preparing" | "updating" | "ready" | "failed";

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
