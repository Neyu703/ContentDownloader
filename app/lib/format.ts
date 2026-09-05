import type { TFunction } from "i18next";
import type { JobPhase, MediaFormat, PlaylistInfo, SetupPhase } from "../downloader/types";

// A playlist link always carries a "list=" query param, whether it's a standalone playlist URL or
// a single video that happens to be playing within one.
export const PLAYLIST_URL_PATTERN = /[?&]list=/;

export const AUDIO_QUALITIES = ["128", "192", "320"] as const;
export const VIDEO_QUALITIES = ["360", "480", "720", "1080", "best"] as const;

/** Splits multi-line pasted input (batch-queue) into individual trimmed, non-empty URL candidates. */
export function parseUrlLines(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function formatMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

// CBR MP3 at a fixed bitrate has a near-exact size, unlike video (VBR streams, size only known once downloaded).
export function estimateAudioSizeMB(durationSeconds: number, bitrateKbps: number): number {
  return (durationSeconds * bitrateKbps * 1000) / 8 / (1024 * 1024);
}

export function formatSecondsShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")} min`;
}

export function formatDuration(seconds: number): string {
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatElapsed(ms: number): string {
  return formatSecondsShort(Math.floor(ms / 1000));
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || "download";
}

export function isFinishedPhase(phase: JobPhase): boolean {
  return phase === "done" || phase === "error" || phase === "cancelled";
}

/** Setup phases worth showing a status line for (idle/ready render nothing). */
export function isSetupMessagePhase(phase: SetupPhase): boolean {
  return phase === "preparing" || phase === "updating" || phase === "failed";
}

export function hasPositiveDuration(duration: number | null | undefined): duration is number {
  return duration != null && duration > 0;
}

export function mimeTypeForExt(ext: "mp3" | "mp4" | null | undefined): string {
  return ext === "mp4" ? "video/mp4" : "audio/mpeg";
}

export function toFileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

/** Label for the playlist picker's confirm button — adapts to format, count, and singular/plural. */
export function playlistConfirmLabel(t: TFunction, format: MediaFormat, count: number): string {
  if (count === 0) return t("playlist.confirmNone");
  return t(format === "audio" ? "playlist.confirmAudio" : "playlist.confirmVideo", { count });
}

/** Opaque client-side grouping key — never sent anywhere, just used to cluster job cards in the UI. */
export function generateGroupId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// A video can legitimately appear more than once in the same YouTube playlist (re-added), so
// entry ids aren't guaranteed unique — comparing selected.size against entries.length would
// wrongly report "not all selected" whenever a duplicate id collapses the Set below the entry count.
export function isAllPlaylistEntriesSelected(picker: { info: PlaylistInfo; selected: Set<string> }): boolean {
  return picker.info.entries.every((entry) => picker.selected.has(entry.id));
}
