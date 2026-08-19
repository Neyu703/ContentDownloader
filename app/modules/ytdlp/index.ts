import { NativeModule, requireNativeModule } from "expo-modules-core";

export type SetupPhase = "idle" | "preparing" | "updating" | "ready" | "failed";

export type JobPhase =
  | "queued"
  | "fetching_info"
  | "downloading"
  | "converting"
  | "merging"
  | "done"
  | "error"
  | "cancelled";

export interface NativeSetupState {
  phase: SetupPhase;
  message: string;
  ytdlpVersion: string | null;
}

export interface NativeJob {
  id: string;
  url: string;
  format: "audio" | "video";
  quality: string;
  phase: JobPhase;
  title: string | null;
  progress: number | null;
  etaSeconds: number | null;
  lastLine: string;
  filePath: string | null;
  ext: "mp3" | "mp4" | null;
  error: string | null;
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
  enqueue(url: string, format: "audio" | "video", quality: string): Promise<string>;
  cancel(id: string): Promise<void>;
  clearFinished(): Promise<void>;
  /** Writes the current log to a cache file and returns its absolute (non-URI) path. */
  getDebugLogFile(): Promise<string>;
  requestNotificationPermission(): Promise<boolean>;
  /** Copies a cache file into the public Downloads collection; returns the resulting content URI. */
  saveToDownloads(filePath: string, filename: string, mimeType: string): Promise<string>;
}

export default requireNativeModule<NativeYtdlp>("Ytdlp");
