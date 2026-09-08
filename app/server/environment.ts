import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { delay, errorMessage, spawnForOutput } from "./utils.js";
import { runYtDlp } from "./ytdlpProcess.js";

export const DOWNLOADS_DIR = path.join(process.cwd(), "downloads");

export const AUDIO_QUALITIES = ["128", "192", "320"] as const;
export const VIDEO_QUALITIES = ["360", "480", "720", "1080", "best"] as const;
export type AudioQuality = (typeof AUDIO_QUALITIES)[number];
export type VideoQuality = (typeof VIDEO_QUALITIES)[number];

/** How many playlist entries a platform's fetchPlaylistInfo() lists per call — mirrored by PAGE_SIZE in DownloadQueue.kt. */
export const PLAYLIST_PAGE_SIZE = 50;

// A transient failure (network blip, a momentarily unreachable PyPI) shouldn't leave the
// container stuck on a stale build until its next restart, so this retries with a linearly
// growing delay (5s, 10s, 15s, ... up to ~140s total) before finally giving up and just warning —
// the next scheduled run (see startPeriodicYtDlpUpdates() below) picks it back up from there.
export const UPDATE_RETRY_ATTEMPTS = 8;
const UPDATE_RETRY_DELAY_MS = 5000;

export async function updateYtDlp(): Promise<void> {
  for (let attempt = 1; attempt <= UPDATE_RETRY_ATTEMPTS; attempt++) {
    try {
      const output = await upgradeYtDlpViaPip();
      console.log(output.trim());
      return;
    } catch (err) {
      if (attempt === UPDATE_RETRY_ATTEMPTS) {
        console.warn("yt-dlp Selbst-Update fehlgeschlagen:", errorMessage(err));
        return;
      }
      await delay(UPDATE_RETRY_DELAY_MS * attempt);
    }
  }
}

// A one-time update at boot isn't enough to guarantee yt-dlp stays functional: this server can
// run for days without a restart while YouTube keeps shifting its PO-token/SABR enforcement, so
// the pinned nightly build drifts stale. Re-running the same update on a fixed interval keeps a
// long-lived container current without needing a restart. unref()'d so the timer itself never
// keeps the process alive.
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function startPeriodicYtDlpUpdates(): void {
  setInterval(() => {
    updateYtDlp().then(checkYtDlpVersion);
  }, UPDATE_INTERVAL_MS).unref();
}

// yt-dlp's own `--update-to` self-updater refuses to run against a pip-managed install (its
// is_non_updateable() check just tells you to use pip instead), so keeping pace with YouTube's
// frequently-changing PO-token/SABR enforcement — only handled in pre-release builds, not yet in
// stable — has to go through pip instead. Same install command and --break-system-packages
// fallback as the initial install (Dockerfile / session-start.sh), just with --upgrade added.
async function upgradeYtDlpViaPip(): Promise<string> {
  try {
    return await spawnForOutput("pip3", ["install", "--user", "--upgrade", "--pre", "yt-dlp"]);
  } catch {
    return await spawnForOutput("pip3", ["install", "--user", "--upgrade", "--pre", "--break-system-packages", "yt-dlp"]);
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

async function checkYtDlpVersion(): Promise<void> {
  try {
    const version = await runYtDlp(["--version"]);
    cachedYtDlpVersion = version.trim();
    console.log(`yt-dlp Version: ${cachedYtDlpVersion}`);
  } catch (err) {
    console.warn("WARNUNG: yt-dlp nicht erreichbar:", errorMessage(err));
  }
}

async function checkFfmpegAvailable(): Promise<void> {
  cachedFfmpegAvailable = await checkFfmpeg();
  if (!cachedFfmpegAvailable) {
    console.warn("WARNUNG: ffmpeg wurde nicht gefunden (PATH?). MP3/MP4-Konvertierung wird fehlschlagen.");
  }
}

function checkPotProviderScript(): void {
  if (!fs.existsSync(POT_PROVIDER_SCRIPT)) {
    console.warn(
      `WARNUNG: PO-Token-Skript fehlt unter ${POT_PROVIDER_SCRIPT}. YouTube-Downloads können mit HTTP 403 fehlschlagen.`
    );
  }
}

// Surfaces broken pieces of the download chain (yt-dlp, ffmpeg, PO-token script) at startup
// instead of only as a cryptic error deep inside a job.
export async function checkEnvironment(): Promise<void> {
  await checkYtDlpVersion();
  await checkFfmpegAvailable();
  checkPotProviderScript();
}
