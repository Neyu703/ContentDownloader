import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { errorMessage, isHttpOrHttps } from "../utils.js";
import { cookiesArgs } from "../cookies.js";
import { DownloadLogger } from "../downloadLog.js";
import { DOWNLOADS_DIR, getYtDlpVersion, isFfmpegAvailable } from "../environment.js";
import { runYtDlp } from "../ytdlpProcess.js";
import { parseProgressLine, type ProgressUpdate } from "../progress.js";
import { pickTitle } from "./titleQuality.js";
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
    if (!isHttpOrHttps(parsed)) {
      throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
    }
  }

  /** The exact yt-dlp argv used for a metadata-only lookup, shared by fetchInfo() and its download-log entry. */
  private infoArgs(): string[] {
    return ["--dump-json", "--no-playlist", "--no-warnings", "--no-plugin-dirs", ...cookiesArgs(), this.url];
  }

  async fetchInfo(): Promise<VideoInfo> {
    // Metadata only (no format URLs needed here), so skip the PO-token provider plugin — it checks
    // Node/Deno availability on every yt-dlp invocation, which alone costs ~7-10s.
    const stdout = await runYtDlp(this.infoArgs());
    const data = JSON.parse(stdout);
    return {
      title: pickTitle({
        title: data.title,
        description: data.description,
        uploader: data.uploader,
        uploadDate: data.upload_date,
        id: data.id,
      }),
      duration: data.duration ?? 0,
      thumbnail: data.thumbnail ?? null,
      uploader: data.uploader ?? null,
      uploadDate: data.upload_date ?? null,
      videoId: data.id ?? null,
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

  /**
   * Builds a permanent-failure check from a regex: subclasses use this to flag a known-unretryable
   * yt-dlp error (e.g. an Instagram slideshow, YouTube's sign-in gate) without each re-implementing
   * the same match-against-errorMessage boilerplate.
   */
  protected static permanentFailureMatcher(pattern: RegExp): (err: unknown, fallbackRaw?: string) => boolean {
    return (err, fallbackRaw) => pattern.test(errorMessage(err, fallbackRaw));
  }

  /** Formats an elapsed duration since `startedAt` (ms epoch) as e.g. "1.8s". */
  private static elapsedSince(startedAt: number): string {
    return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  }

  /** Best-effort file size in MB for the RESULT log line; "unknown" if the file can't be stat'd. */
  private static fileSizeMB(filePath: string): string {
    try {
      return fs.existsSync(filePath) ? (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2) : "unknown";
    } catch {
      return "unknown";
    }
  }

  async download(
    format: MediaFormat,
    quality: string,
    onProgress: (update: ProgressUpdate) => void
  ): Promise<ConvertResult> {
    const id = randomUUID();
    const logger = new DownloadLogger(id);
    const startedAt = Date.now();

    logger.section(`DOWNLOAD job=${id} platform=${this.id}`);
    logger.line(`url=${this.url} format=${format} quality=${quality}`);
    logger.line(`yt-dlp=${getYtDlpVersion() ?? "unknown"} ffmpeg=${isFfmpegAvailable() ? "available" : "unavailable"}`);

    try {
      onProgress({ stage: "fetching_info", messageKey: "job.fetchingInfo", progress: null });
      logger.section("FETCH INFO");
      logger.command(this.infoArgs());
      const infoStartedAt = Date.now();
      const info = await this.fetchInfo();
      logger.line(`resolved in ${BasePlatform.elapsedSince(infoStartedAt)}`);
      logger.line(
        `title="${info.title}" uploader=${info.uploader ?? "null"} uploadDate=${info.uploadDate ?? "null"} id=${info.videoId ?? "null"} duration=${info.duration}`
      );

      const outputTemplate = path.join(DOWNLOADS_DIR, `${id}.%(ext)s`);
      const ext: ConvertResult["ext"] = format === "audio" ? "mp3" : "mp4";
      const downloadArgs = [
        ...this.buildFormatArgs(format, quality),
        "--no-playlist",
        "--no-warnings",
        ...cookiesArgs(),
        "-o",
        outputTemplate,
        this.url,
      ];

      await this.downloadWithRetry(downloadArgs, format, info.title, onProgress, logger);

      const filePath = path.join(DOWNLOADS_DIR, `${id}.${ext}`);
      const sizeMB = BasePlatform.fileSizeMB(filePath);
      logger.section("RESULT");
      logger.line(`SUCCESS after ${BasePlatform.elapsedSince(startedAt)} total, file=${filePath} size=${sizeMB}MB`);
      return { id, filePath, title: info.title, ext };
    } catch (err) {
      logger.section("RESULT");
      logger.line(`FAILED after ${BasePlatform.elapsedSince(startedAt)} total: ${errorMessage(err)}`);
      throw err;
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
    logger: DownloadLogger
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      logger.section(`DOWNLOAD ATTEMPT ${attempt}/${MAX_ATTEMPTS}`);
      logger.command(downloadArgs);
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

      const attemptStartedAt = Date.now();
      try {
        await runYtDlp(downloadArgs, (line) => {
          logger.line(line);
          const update = parseProgressLine(line, format);
          if (update) onProgress(update);
        });
        return;
      } catch (err) {
        logger.line(`attempt ${attempt}/${MAX_ATTEMPTS} failed after ${BasePlatform.elapsedSince(attemptStartedAt)}: ${errorMessage(err)}`);
        if (attempt >= MAX_ATTEMPTS || !this.isRetryableError(err)) throw err;
        await delay(RETRY_DELAY_MS);
      }
    }
  }
}
