import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { errorMessage } from "./utils.js";
import { runYtDlp } from "./ytdlpProcess.js";

export const DOWNLOADS_DIR = path.join(process.cwd(), "downloads");

export const AUDIO_QUALITIES = ["128", "192", "320"] as const;
export const VIDEO_QUALITIES = ["360", "480", "720", "1080", "best"] as const;
export type AudioQuality = (typeof AUDIO_QUALITIES)[number];
export type VideoQuality = (typeof VIDEO_QUALITIES)[number];

/** How many playlist entries a platform's fetchPlaylistInfo() lists per call — mirrored by PAGE_SIZE in DownloadQueue.kt. */
export const PLAYLIST_PAGE_SIZE = 50;

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

// Cached at startup by checkEnvironment() so every download log can stamp its own yt-dlp/ffmpeg
// versions without re-invoking either binary per job.
let cachedYtDlpVersion: string | null = null;
let cachedFfmpegAvailable: boolean | null = null;

/** The yt-dlp version detected at startup, or null if it couldn't be determined yet/at all. */
export function getYtDlpVersion(): string | null {
  return cachedYtDlpVersion;
}

/** Whether ffmpeg was found on PATH at startup, or null if that check hasn't run yet. */
export function isFfmpegAvailable(): boolean | null {
  return cachedFfmpegAvailable;
}

// Surfaces broken pieces of the download chain (yt-dlp, ffmpeg, PO-token script) at startup
// instead of only as a cryptic error deep inside a job.
export async function checkEnvironment(): Promise<void> {
  try {
    const version = await runYtDlp(["--version"]);
    cachedYtDlpVersion = version.trim();
    console.log(`yt-dlp Version: ${cachedYtDlpVersion}`);
  } catch (err) {
    console.warn("WARNUNG: yt-dlp nicht erreichbar:", errorMessage(err));
  }

  cachedFfmpegAvailable = await checkFfmpeg();
  if (!cachedFfmpegAvailable) {
    console.warn("WARNUNG: ffmpeg wurde nicht gefunden (PATH?). MP3/MP4-Konvertierung wird fehlschlagen.");
  }

  if (!fs.existsSync(POT_PROVIDER_SCRIPT)) {
    console.warn(
      `WARNUNG: PO-Token-Skript fehlt unter ${POT_PROVIDER_SCRIPT}. YouTube-Downloads können mit HTTP 403 fehlschlagen.`
    );
  }
}
