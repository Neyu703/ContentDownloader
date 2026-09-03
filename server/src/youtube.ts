import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { errorMessage, isRetryableError } from "./utils.js";
import { writeLog } from "./downloadLog.js";
import { parseProgressLine, type ProgressUpdate } from "./progress.js";

export const DOWNLOADS_DIR = path.join(process.cwd(), "downloads");

export type MediaFormat = "audio" | "video";
export const AUDIO_QUALITIES = ["128", "192", "320"] as const;
export const VIDEO_QUALITIES = ["360", "480", "720", "1080", "best"] as const;
export type AudioQuality = (typeof AUDIO_QUALITIES)[number];
export type VideoQuality = (typeof VIDEO_QUALITIES)[number];

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

export type { ProgressUpdate };

/**
 * Builds a stream `data` handler that always accumulates the full text (for callers that need the
 * complete stdout/stderr, e.g. to JSON.parse it), and additionally splits it into lines and calls
 * `onLine` per line — buffering the trailing partial line across chunks — when `onLine` is given.
 */
function makeChunkHandler(accumulate: (text: string) => void, onLine?: (line: string) => void, linePrefix = "") {
  let lineBuffer = "";
  return (chunk: Buffer) => {
    const text = chunk.toString();
    accumulate(text);
    if (!onLine) return;
    lineBuffer += text;
    const lines = lineBuffer.split("\n");
    // split() on a string always yields at least one element, so pop() can never be undefined here.
    lineBuffer = lines.pop()!;
    for (const line of lines) onLine(linePrefix + line);
  };
}

function runYtDlp(args: string[], onLine?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", onLine ? [...args, "--newline", "--no-color"] : args, { windowsHide: true });

    let stdout = "";
    let stderr = "";
    child.stdout.on(
      "data",
      makeChunkHandler((text) => (stdout += text), onLine)
    );
    child.stderr.on(
      "data",
      makeChunkHandler((text) => (stderr += text), onLine, "[stderr] ")
    );

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

export async function updateYtDlp(): Promise<void> {
  try {
    // Pinned to nightly: YouTube's current PO-token/SABR enforcement is only handled there, not yet in stable.
    const output = await runYtDlp(["--update-to", "nightly"]);
    console.log(output.trim());
  } catch (err) {
    console.warn("yt-dlp Selbst-Update fehlgeschlagen:", errorMessage(err));
  }
}

const POT_PROVIDER_SCRIPT = path.join(os.homedir(), "bgutil-ytdlp-pot-provider", "server", "build", "generate_once.js");

function checkFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

// Surfaces broken pieces of the download chain (yt-dlp, ffmpeg, PO-token script) at startup
// instead of only as a cryptic error deep inside a job.
export async function checkEnvironment(): Promise<void> {
  try {
    const version = await runYtDlp(["--version"]);
    console.log(`yt-dlp Version: ${version.trim()}`);
  } catch (err) {
    console.warn("WARNUNG: yt-dlp nicht erreichbar:", errorMessage(err));
  }

  if (!(await checkFfmpeg())) {
    console.warn("WARNUNG: ffmpeg wurde nicht gefunden (PATH?). MP3/MP4-Konvertierung wird fehlschlagen.");
  }

  if (!fs.existsSync(POT_PROVIDER_SCRIPT)) {
    console.warn(
      `WARNUNG: PO-Token-Skript fehlt unter ${POT_PROVIDER_SCRIPT}. YouTube-Downloads können mit HTTP 403 fehlschlagen.`
    );
  }
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  // Metadata only (no format URLs needed here), so skip the PO-token provider plugin — it checks
  // Node/Deno availability on every yt-dlp invocation, which alone costs ~7-10s.
  const stdout = await runYtDlp(["--dump-json", "--no-playlist", "--no-warnings", "--no-plugin-dirs", url]);
  const data = JSON.parse(stdout);
  return {
    title: data.title ?? "Unknown title",
    duration: data.duration ?? 0,
    thumbnail: data.thumbnail ?? null,
    uploader: data.uploader ?? null,
  };
}

/** How many playlist entries getPlaylistInfo() lists per call — mirrored by PAGE_SIZE in DownloadQueue.kt. */
export const PLAYLIST_PAGE_SIZE = 50;

/**
 * Lists one page of a playlist's entries (1-indexed, inclusive range), without downloading
 * anything. Paged so the UI can virtualize/infinite-scroll instead of enumerating an entire
 * (potentially thousand-video) playlist upfront.
 */
export async function getPlaylistInfo(
  url: string,
  start = 1,
  count = PLAYLIST_PAGE_SIZE
): Promise<PlaylistInfo> {
  // --flat-playlist skips per-video metadata fetches (title/thumbnail/duration still come along for
  // YouTube), so listing a page stays fast. Deliberately no --no-playlist here — this is the one
  // call site that must resolve a playlist link into its entries instead of rejecting it.
  const stdout = await runYtDlp([
    "--flat-playlist",
    "--dump-json",
    "--no-warnings",
    "--no-plugin-dirs",
    "--playlist-items",
    `${start}-${start + count - 1}`,
    url,
  ]);
  const entries: PlaylistEntry[] = [];
  let title = "Playlist";
  let totalCount: number | null = null;
  let sawFirstLine = false;

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const data = JSON.parse(line);
    if (!sawFirstLine) {
      sawFirstLine = true;
      title = data.playlist_title ?? data.playlist ?? "Playlist";
      totalCount = typeof data.playlist_count === "number" ? data.playlist_count : null;
    }
    const thumbnails = Array.isArray(data.thumbnails) ? data.thumbnails : [];
    entries.push({
      id: data.id,
      url: data.webpage_url ?? data.url,
      title: data.title ?? data.id,
      thumbnail: thumbnails.at(-1)?.url ?? (data.id ? `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg` : null),
      duration: data.duration ?? null,
    });
  }

  return { title, entries, totalCount };
}

function buildFormatArgs(format: MediaFormat, quality: string): string[] {
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

/** Total download attempts per job (including the first try) before a transient failure gives up. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs the yt-dlp download itself, retrying up to MAX_ATTEMPTS times on a transient failure (e.g.
 * HTTP 403 / PO-token issues, per checkEnvironment()'s warning) with a fixed delay in between. The
 * known-permanent "sign in required" gate is never retried, since it fails the same way every time.
 */
async function downloadWithRetry(
  downloadArgs: string[],
  format: MediaFormat,
  title: string,
  onProgress: (update: ProgressUpdate) => void,
  log: (message: string) => void
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onProgress(
      attempt === 1
        ? { stage: "downloading", message: `„${title}“ wird heruntergeladen…`, progress: 0 }
        : { stage: "downloading", message: `Erneuter Versuch (${attempt}/${MAX_ATTEMPTS})…`, progress: null }
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
      if (attempt >= MAX_ATTEMPTS || !isRetryableError(err)) throw err;
      await delay(RETRY_DELAY_MS);
    }
  }
}

export async function downloadMedia(
  url: string,
  format: MediaFormat,
  quality: string,
  onProgress: (update: ProgressUpdate) => void
): Promise<ConvertResult> {
  const id = randomUUID();
  const logLines: string[] = [];
  const log = (message: string) => logLines.push(`[${new Date().toISOString()}] ${message}`);
  log(`start url=${url} format=${format} quality=${quality}`);

  try {
    onProgress({ stage: "fetching_info", message: "Lade Video-Informationen…", progress: null });
    const info = await getVideoInfo(url);
    log(`video info: title="${info.title}" duration=${info.duration}`);

    const outputTemplate = path.join(DOWNLOADS_DIR, `${id}.%(ext)s`);
    const ext: ConvertResult["ext"] = format === "audio" ? "mp3" : "mp4";
    const downloadArgs = [
      ...buildFormatArgs(format, quality),
      "--no-playlist",
      "--no-warnings",
      "-o",
      outputTemplate,
      url,
    ];
    log(`yt-dlp args: ${downloadArgs.join(" ")}`);

    await downloadWithRetry(downloadArgs, format, info.title, onProgress, log);

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
