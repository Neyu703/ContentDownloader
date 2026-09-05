import path from "node:path";
import { randomUUID } from "node:crypto";
import { errorMessage } from "../utils.js";
import { writeLog } from "../downloadLog.js";
import { DOWNLOADS_DIR } from "../environment.js";
import { runYtDlp } from "../ytdlpProcess.js";
import { parseProgressLine, type ProgressUpdate } from "../progress.js";
import type { ConvertResult, MediaFormat, Platform, UserFacingError, VideoInfo } from "./Platform.js";

/** Total download attempts per job (including the first try) before a transient failure gives up. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generic yt-dlp behavior shared by every platform: metadata lookup, format-arg selection, and a
 * retrying download. Concrete platforms only override what actually differs (see YouTube).
 */
export abstract class BasePlatform implements Platform {
  abstract readonly id: string;

  constructor(protected readonly url: string) {}

  checkAvailability(): void {
    const parsed = new URL(this.url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
    }
  }

  async fetchInfo(): Promise<VideoInfo> {
    // Metadata only (no format URLs needed here), so skip the PO-token provider plugin — it checks
    // Node/Deno availability on every yt-dlp invocation, which alone costs ~7-10s.
    const stdout = await runYtDlp(["--dump-json", "--no-playlist", "--no-warnings", "--no-plugin-dirs", this.url]);
    const data = JSON.parse(stdout);
    return {
      title: data.title ?? "Unknown title",
      duration: data.duration ?? 0,
      thumbnail: data.thumbnail ?? null,
      uploader: data.uploader ?? null,
    };
  }

  buildFormatArgs(format: MediaFormat, quality: string): string[] {
    if (format === "audio") {
      return [
        "-f",
        "bestaudio/best",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        `${quality}K`,
        "--embed-thumbnail",
        "--embed-metadata",
      ];
    }

    const heightFilter = quality === "best" ? "" : `[height<=${quality}]`;
    return [
      "-f",
      `bestvideo${heightFilter}+bestaudio/best${heightFilter}/best${heightFilter}`,
      "--merge-output-format",
      "mp4",
    ];
  }

  isRetryableError(err: unknown): boolean {
    return true;
  }

  describeError(err: unknown, fallbackRaw?: string): UserFacingError {
    return { key: "errors.raw", params: { raw: errorMessage(err, fallbackRaw) } };
  }

  async download(
    format: MediaFormat,
    quality: string,
    onProgress: (update: ProgressUpdate) => void
  ): Promise<ConvertResult> {
    const id = randomUUID();
    const logLines: string[] = [];
    const log = (message: string) => logLines.push(`[${new Date().toISOString()}] ${message}`);
    log(`start url=${this.url} format=${format} quality=${quality}`);

    try {
      onProgress({ stage: "fetching_info", messageKey: "job.fetchingInfo", progress: null });
      const info = await this.fetchInfo();
      log(`video info: title="${info.title}" duration=${info.duration}`);

      const outputTemplate = path.join(DOWNLOADS_DIR, `${id}.%(ext)s`);
      const ext: ConvertResult["ext"] = format === "audio" ? "mp3" : "mp4";
      const downloadArgs = [
        ...this.buildFormatArgs(format, quality),
        "--no-playlist",
        "--no-warnings",
        "-o",
        outputTemplate,
        this.url,
      ];
      log(`yt-dlp args: ${downloadArgs.join(" ")}`);

      await this.downloadWithRetry(downloadArgs, format, info.title, onProgress, log);

      log("finished successfully");
      return {
        id,
        filePath: path.join(DOWNLOADS_DIR, `${id}.${ext}`),
        title: info.title,
        ext,
      };
    } catch (err) {
      log(`ERROR: ${errorMessage(err)}`);
      throw err;
    } finally {
      writeLog(id, logLines);
    }
  }

  /**
   * Runs the yt-dlp download itself, retrying up to MAX_ATTEMPTS times on a transient failure with
   * a fixed delay in between. A permanent failure (per isRetryableError()) is never retried.
   */
  private async downloadWithRetry(
    downloadArgs: string[],
    format: MediaFormat,
    title: string,
    onProgress: (update: ProgressUpdate) => void,
    log: (message: string) => void
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      onProgress(
        attempt === 1
          ? { stage: "downloading", messageKey: "job.downloadingTitled", messageParams: { title }, progress: 0 }
          : {
              stage: "downloading",
              messageKey: "job.retrying",
              messageParams: { attempt, maxAttempts: MAX_ATTEMPTS },
              progress: null,
            }
      );

      try {
        await runYtDlp(downloadArgs, (line) => {
          log(line);
          const update = parseProgressLine(line, format);
          if (update) onProgress(update);
        });
        return;
      } catch (err) {
        log(`attempt ${attempt}/${MAX_ATTEMPTS} failed: ${errorMessage(err)}`);
        if (attempt >= MAX_ATTEMPTS || !this.isRetryableError(err)) throw err;
        await delay(RETRY_DELAY_MS);
      }
    }
  }
}
