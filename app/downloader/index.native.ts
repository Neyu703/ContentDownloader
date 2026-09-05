import { AppState } from "react-native";
import Ytdlp, { type NativeJob, type NativeState } from "../modules/ytdlp";
import type { Downloader, DownloadRequest, JobState, SetupState } from "./types";
import { mimeTypeForExt, sanitizeFilename, toFileUri } from "../lib/format";

function toJobState(job: NativeJob): JobState {
  return {
    id: job.id,
    url: job.url,
    format: job.format,
    quality: job.quality,
    phase: job.phase,
    title: job.title,
    thumbnail: job.thumbnail,
    progress: job.progress,
    etaSeconds: job.etaSeconds,
    lastLine: job.lastLine,
    lastLineKey: job.lastLineKey ?? undefined,
    lastLineParams: (job.lastLineParams as Record<string, string | number> | null) ?? undefined,
    result: job.filePath,
    ext: job.ext,
    errorKey: job.error ?? undefined,
    errorParams: (job.errorParams as Record<string, string | number> | null) ?? undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    groupId: job.groupId,
    groupTitle: job.groupTitle,
  };
}

function toSetupState(state: NativeState["setup"]): SetupState {
  return {
    phase: state.phase,
    message: state.message,
    messageParams: (state.messageParams as Record<string, string | number> | null) ?? undefined,
  };
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
    function pushCurrentState() {
      Ytdlp.getState().then((state) => {
        if (!cancelled) listener(state.jobs.map(toJobState), toSetupState(state.setup));
      });
    }
    pushCurrentState();

    const subscription = Ytdlp.addListener("onStateChange", (state) => {
      listener(state.jobs.map(toJobState), toSetupState(state.setup));
    });

    // Foreground-service updates land natively even while JS is suspended; re-sync on resume so
    // nothing that happened in the background is missed.
    const appStateSubscription = AppState.addEventListener("change", (next) => {
      if (next === "active") pushCurrentState();
    });

    return () => {
      cancelled = true;
      subscription.remove();
      appStateSubscription.remove();
    };
  },

  async enqueue(request: DownloadRequest) {
    await ensureInitialized();
    return Ytdlp.enqueue(
      request.url,
      request.format,
      request.quality,
      request.groupId ?? null,
      request.groupTitle ?? null
    );
  },

  async getPlaylistInfo(url: string, start: number) {
    await ensureInitialized();
    return Ytdlp.getPlaylistInfo(url, start);
  },

  cancel(id: string) {
    // Fire-and-forget — the resulting state change (or its absence, on failure) reaches the UI via
    // the onStateChange event above regardless.
    Ytdlp.cancel(id).catch(() => {});
  },

  removeJob(id: string) {
    // Same fire-and-forget reasoning as cancel() above.
    Ytdlp.removeIfFinished(id).catch(() => {});
  },

  clearFinished() {
    // Same fire-and-forget reasoning as cancel() above.
    Ytdlp.clearFinished().catch(() => {});
  },

  async getDebugLogFileUri() {
    const path = await Ytdlp.getDebugLogFile();
    return toFileUri(path);
  },

  async saveToDownloads(job: JobState, filenameOverride?: string) {
    if (!job.result) return;
    // The native side already renamed the file to a sanitized "<video title>.<ext>" — reuse that
    // instead of re-deriving a filename here, unless the user typed their own name first. split()
    // on a non-empty string (guaranteed by the guard above) always yields at least one element, so
    // pop() can never be undefined.
    const autoFilename = job.result.split(/[\\/]/).pop()!;
    const filename = filenameOverride
      ? `${sanitizeFilename(filenameOverride)}.${autoFilename.split(".").pop()}`
      : autoFilename;
    await Ytdlp.saveToDownloads(job.result, filename, mimeTypeForExt(job.ext));
  },

  async pickDownloadsFolder() {
    return Ytdlp.pickDownloadsFolder();
  },

  async getDownloadsFolderName() {
    return Ytdlp.getDownloadsFolderName();
  },

  async resetDownloadsFolder() {
    await Ytdlp.resetDownloadsFolder();
  },
};
