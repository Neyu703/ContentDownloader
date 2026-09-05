/* istanbul ignore file -- babel-plugin-istanbul produces an empty statementMap for this file
   (confirmed via coverage-final.json: 0 statements found) even though the module executes
   correctly and index.test.ts's contract test passes — a tooling quirk on this near-all-types
   file (its only runtime line is the default export below), not an actual untested line. */
import { NativeModule, requireNativeModule } from "expo-modules-core";
import type { JobPhase, PlaylistEntry, PlaylistInfo, SetupPhase } from "../../shared-types";

export type { JobPhase, SetupPhase };
/** Native mirrors of the shared playlist types — same shape, kept under the "Native"-prefixed naming convention used throughout this file. */
export type NativePlaylistEntry = PlaylistEntry;
export type NativePlaylistInfo = PlaylistInfo;

export interface NativeSetupState {
  phase: SetupPhase;
  /** A translation key (see app/i18n), not display text. */
  message: string;
  messageParams: Record<string, unknown> | null;
  ytdlpVersion: string | null;
}

export interface NativeJob {
  id: string;
  url: string;
  format: "audio" | "video";
  quality: string;
  groupId: string | null;
  groupTitle: string | null;
  phase: JobPhase;
  title: string | null;
  thumbnail: string | null;
  progress: number | null;
  etaSeconds: number | null;
  /** Raw last yt-dlp output line — untranslated diagnostic text. */
  lastLine: string;
  /** Translation key for a higher-level status (e.g. a retry notice), overriding `lastLine` while set. */
  lastLineKey: string | null;
  lastLineParams: Record<string, unknown> | null;
  filePath: string | null;
  ext: "mp3" | "mp4" | null;
  /** A translation key (e.g. "errors.signInRequired"), not display text, once set. */
  error: string | null;
  errorParams: Record<string, unknown> | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  updatedAt: number;
}

export interface NativeState {
  setup: NativeSetupState;
  jobs: NativeJob[];
}

type YtdlpEvents = {
  onStateChange: (state: NativeState) => void;
};

declare class NativeYtdlp extends NativeModule<YtdlpEvents> {
  initialize(): Promise<void>;
  getState(): Promise<NativeState>;
  enqueue(
    url: string,
    format: "audio" | "video",
    quality: string,
    groupId: string | null,
    groupTitle: string | null
  ): Promise<string>;
  getPlaylistInfo(url: string, start: number): Promise<NativePlaylistInfo>;
  cancel(id: string): Promise<void>;
  /** Dismisses a single finished (done/error/cancelled) job. No-op for an active job. */
  removeIfFinished(id: string): Promise<void>;
  clearFinished(): Promise<void>;
  /** Writes the current log to a cache file and returns its absolute (non-URI) path. */
  getDebugLogFile(): Promise<string>;
  requestNotificationPermission(): Promise<boolean>;
  /** Copies a cache file into the public Downloads collection (or the picked folder, if any); returns the resulting content URI. */
  saveToDownloads(filePath: string, filename: string, mimeType: string): Promise<string>;
  /** Opens the Storage Access Framework folder picker; returns the picked folder's display name, or null if cancelled. */
  pickDownloadsFolder(): Promise<string | null>;
  /** The currently picked folder's display name, or null when using the default public Downloads folder. */
  getDownloadsFolderName(): Promise<string | null>;
  /** Resets saveToDownloads() back to the default public Downloads folder. */
  resetDownloadsFolder(): Promise<void>;
}

export default requireNativeModule<NativeYtdlp>("Ytdlp");
