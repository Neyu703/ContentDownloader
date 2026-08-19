import { AppState } from "react-native";
import Ytdlp, { type NativeJob, type NativeState } from "../modules/ytdlp";
import type { Downloader, DownloadRequest, JobState, SetupState } from "./types";

function toJobState(job: NativeJob): JobState {
  return {
    id: job.id,
    url: job.url,
    format: job.format,
    quality: job.quality,
    phase: job.phase,
    title: job.title,
    progress: job.progress,
    etaSeconds: job.etaSeconds,
    lastLine: job.lastLine,
    result: job.filePath,
    ext: job.ext,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function toSetupState(state: NativeState["setup"]): SetupState {
  return { phase: state.phase, message: state.message };
}

let initPromise: Promise<void> | null = null;
let notificationRequested = false;

/** Runs once per process: unpack Python/ffmpeg and pull the newest yt-dlp. Safe to call repeatedly. */
function ensureInitialized(): Promise<void> {
  if (!initPromise) initPromise = Ytdlp.initialize();
  if (!notificationRequested) {
    notificationRequested = true;
    Ytdlp.requestNotificationPermission().catch(() => {});
  }
  return initPromise;
}

export const downloader: Downloader = {
  subscribe(listener) {
    // Failure here already reaches the UI via the onStateChange event below
    // (native flips setup.phase to "failed" before rethrowing) — swallow it so an init
    // failure never surfaces as React Native's global unhandled-rejection crash overlay.
    ensureInitialized().catch(() => {});

    let cancelled = false;
    Ytdlp.getState().then((state) => {
      if (!cancelled) listener(state.jobs.map(toJobState), toSetupState(state.setup));
    });

    const subscription = Ytdlp.addListener("onStateChange", (state) => {
      listener(state.jobs.map(toJobState), toSetupState(state.setup));
    });

    // Foreground-service updates land natively even while JS is suspended; re-sync on resume so
    // nothing that happened in the background is missed.
    const appStateSubscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        Ytdlp.getState().then((state) => {
          if (!cancelled) listener(state.jobs.map(toJobState), toSetupState(state.setup));
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
      appStateSubscription.remove();
    };
  },

  async enqueue(request: DownloadRequest) {
    await ensureInitialized();
    return Ytdlp.enqueue(request.url, request.format, request.quality);
  },

  cancel(id: string) {
    Ytdlp.cancel(id).catch(() => {});
  },

  clearFinished() {
    Ytdlp.clearFinished().catch(() => {});
  },

  async getDebugLogFileUri() {
    const path = await Ytdlp.getDebugLogFile();
    return path.startsWith("file://") ? path : `file://${path}`;
  },

  async saveToDownloads(job: JobState) {
    if (!job.result) return;
    // The native side already renamed the file to a sanitized "<video title>.<ext>" — reuse that
    // instead of re-deriving a filename here.
    const filename = job.result.split(/[\\/]/).pop() ?? `download.${job.ext ?? "mp3"}`;
    const mimeType = job.ext === "mp4" ? "video/mp4" : "audio/mpeg";
    await Ytdlp.saveToDownloads(job.result, filename, mimeType);
  },
};
