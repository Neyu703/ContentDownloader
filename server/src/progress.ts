import type { MediaFormat } from "./youtube.js";

export interface ProgressUpdate {
  stage: "fetching_info" | "downloading" | "converting";
  message: string;
  progress: number | null;
  downloadedMB?: number;
  totalMB?: number;
  speedMBs?: number;
  eta?: string;
}

// Matches yt-dlp's --newline progress output, e.g. "[download]  42.3% of ~10.00MiB at 1.20MiB/s ETA 00:07".
const DOWNLOAD_PROGRESS_PATTERN =
  /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\w+)(?:\s+at\s+([\d.]+\w+\/s|Unknown speed))?(?:\s+ETA\s+(\S+))?/;

export function parseSizeToMB(text: string): number | null {
  const match = text.match(/([\d.]+)\s*(K|M|G)?i?B/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = (match[2] ?? "").toUpperCase();
  const multiplier = unit === "G" ? 1024 : unit === "K" ? 1 / 1024 : 1;
  return value * multiplier;
}

/** Interprets one line of yt-dlp's --newline output as a progress update, or null if it's not one. */
export function parseProgressLine(line: string, format: MediaFormat): ProgressUpdate | null {
  const downloadMatch = line.match(DOWNLOAD_PROGRESS_PATTERN);
  if (downloadMatch) {
    const pct = parseFloat(downloadMatch[1]);
    const totalMB = parseSizeToMB(downloadMatch[2]);
    const speedMBs = downloadMatch[3] && downloadMatch[3] !== "Unknown speed" ? parseSizeToMB(downloadMatch[3]) : null;
    const eta = downloadMatch[4] && downloadMatch[4] !== "Unknown" ? downloadMatch[4] : null;
    const downloadedMB = totalMB != null ? (totalMB * pct) / 100 : null;
    return {
      stage: "downloading",
      message: `Wird heruntergeladen… (${pct.toFixed(1)}%)`,
      progress: pct,
      downloadedMB: downloadedMB ?? undefined,
      totalMB: totalMB ?? undefined,
      speedMBs: speedMBs ?? undefined,
      eta: eta ?? undefined,
    };
  }
  if (line.includes("[ExtractAudio]") || line.includes("[ffmpeg]")) {
    return {
      stage: "converting",
      message: format === "audio" ? "Konvertiere zu MP3…" : "Verarbeite Video…",
      progress: null,
    };
  }
  if (line.includes("[Merger]")) {
    return { stage: "converting", message: "Führe Video und Audio zusammen…", progress: null };
  }
  return null;
}
