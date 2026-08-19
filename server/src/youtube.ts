import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { errorMessage } from "./utils.js";

export const DOWNLOADS_DIR = path.join(process.cwd(), "downloads");
export const LOGS_DIR = path.join(process.cwd(), "logs");
const MAX_LOG_FILES = 10;

function pruneLogs(): void {
  const files = fs
    .readdirSync(LOGS_DIR)
    .map((name) => ({ name, mtime: fs.statSync(path.join(LOGS_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const file of files.slice(MAX_LOG_FILES)) {
    fs.unlinkSync(path.join(LOGS_DIR, file.name));
  }
}

function writeLog(id: string, lines: string[]): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOGS_DIR, `${id}.log`), lines.join("\n") + "\n", "utf-8");
  pruneLogs();
}

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

export interface ProgressUpdate {
  stage: "fetching_info" | "downloading" | "converting";
  message: string;
  progress: number | null;
  downloadedMB?: number;
  totalMB?: number;
  speedMBs?: number;
  eta?: string;
}

function parseSizeToMB(text: string): number | null {
  const match = text.match(/([\d.]+)\s*(K|M|G)?i?B/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = (match[2] ?? "").toUpperCase();
  const multiplier = unit === "G" ? 1024 : unit === "K" ? 1 / 1024 : 1;
  return value * multiplier;
}

function runYtDlp(args: string[], onLine?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", onLine ? [...args, "--newline", "--no-color"] : args, { windowsHide: true });

    let stdout = "";
    let stderr = "";
    let buffer = "";
    let errBuffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (!onLine) return;
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (!onLine) return;
      errBuffer += text;
      const lines = errBuffer.split("\n");
      errBuffer = lines.pop() ?? "";
      for (const line of lines) onLine(`[stderr] ${line}`);
    });

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
    console.warn("yt-dlp Selbst-Update fehlgeschlagen:", err instanceof Error ? err.message : err);
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
    console.warn("WARNUNG: yt-dlp nicht erreichbar:", err instanceof Error ? err.message : err);
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

    onProgress({ stage: "downloading", message: `„${info.title}“ wird heruntergeladen…`, progress: 0 });

    await runYtDlp(downloadArgs, (line) => {
      log(line);
      const downloadMatch = line.match(
        /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\w+)(?:\s+at\s+([\d.]+\w+\/s|Unknown speed))?(?:\s+ETA\s+(\S+))?/
      );
      if (downloadMatch) {
        const pct = parseFloat(downloadMatch[1]);
        const totalMB = parseSizeToMB(downloadMatch[2]);
        const speedMBs =
          downloadMatch[3] && downloadMatch[3] !== "Unknown speed" ? parseSizeToMB(downloadMatch[3]) : null;
        const eta = downloadMatch[4] && downloadMatch[4] !== "Unknown" ? downloadMatch[4] : null;
        const downloadedMB = totalMB != null ? (totalMB * pct) / 100 : null;
        onProgress({
          stage: "downloading",
          message: `Wird heruntergeladen… (${pct.toFixed(1)}%)`,
          progress: pct,
          downloadedMB: downloadedMB ?? undefined,
          totalMB: totalMB ?? undefined,
          speedMBs: speedMBs ?? undefined,
          eta: eta ?? undefined,
        });
        return;
      }
      if (line.includes("[ExtractAudio]") || line.includes("[ffmpeg]")) {
        onProgress({
          stage: "converting",
          message: format === "audio" ? "Konvertiere zu MP3…" : "Verarbeite Video…",
          progress: null,
        });
      }
      if (line.includes("[Merger]")) {
        onProgress({ stage: "converting", message: "Führe Video und Audio zusammen…", progress: null });
      }
    });

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
