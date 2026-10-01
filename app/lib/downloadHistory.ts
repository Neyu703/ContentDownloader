import { createPersistedSetting } from "./persistedSetting";
import type { MediaFormat } from "../downloader/types";

/** A finished download, trimmed down from JobState to what's worth keeping after the job itself is gone. */
export interface HistoryEntry {
  id: string;
  url: string;
  format: MediaFormat;
  quality: string;
  title: string | null;
  thumbnail: string | null;
  result: string | null;
  ext: "mp3" | "mp4" | null;
  createdAt: number;
  completedAt: number;
}

const HISTORY_CAP = 200;

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.url === "string" &&
    (entry.format === "audio" || entry.format === "video") &&
    typeof entry.quality === "string" &&
    (typeof entry.title === "string" || entry.title === null) &&
    (typeof entry.thumbnail === "string" || entry.thumbnail === null) &&
    (typeof entry.result === "string" || entry.result === null) &&
    (entry.ext === "mp3" || entry.ext === "mp4" || entry.ext === null) &&
    typeof entry.createdAt === "number" &&
    typeof entry.completedAt === "number"
  );
}

const historySetting = createPersistedSetting<HistoryEntry[]>("contentdownloader.downloadHistory", {
  fallback: [],
  // Filters out individual corrupt/old-shape entries instead of discarding the whole list on one
  // bad entry — unlike formatPreference's single-object fallback, one bad row shouldn't wipe 199 good ones.
  parse: (raw) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
    } catch {
      return [];
    }
  },
  serialize: (value) => JSON.stringify(value),
});

/** Reads the saved download history, oldest first. */
export const loadHistory = historySetting.load;

/**
 * Adds one or more history entries in a single read-modify-write, kept sorted oldest-first by
 * completedAt (a stable sort, so freshly finished jobs simply land at the end — and entries
 * restored by HistoryScreen's undo slot back into their original place), capped at HISTORY_CAP
 * entries (oldest dropped first). Entries whose id was already recorded are skipped. Batching
 * (rather than one load+save per job) matters here: several jobs can finish in the same
 * downloader notification, and awaiting each call separately would let concurrent reads see the
 * same stale snapshot and overwrite each other's entry.
 */
export async function appendHistoryEntries(entries: HistoryEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const current = await historySetting.load();
  const recordedIds = new Set(current.map((entry) => entry.id));
  const newEntries = entries.filter((entry) => !recordedIds.has(entry.id));
  if (newEntries.length === 0) return;
  const merged = [...current, ...newEntries].sort((first, second) => first.completedAt - second.completedAt);
  await historySetting.save(merged.slice(-HISTORY_CAP));
}

/**
 * Removes the entries with the given ids in one read-modify-write — by id rather than saving an
 * empty list for "clear all", so an entry recorded concurrently (a download finishing meanwhile)
 * survives.
 */
export async function removeHistoryEntries(ids: string[]): Promise<void> {
  const idsToRemove = new Set(ids);
  const current = await historySetting.load();
  await historySetting.save(current.filter((entry) => !idsToRemove.has(entry.id)));
}
