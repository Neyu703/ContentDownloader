import { downloader } from "./index";
import { appendHistoryEntries } from "../lib/downloadHistory";
import type { JobState } from "./types";

/**
 * Subscribes to the downloader and records every job that reaches phase "done" into the
 * persisted download history, exactly once per job id. Only successful downloads are recorded —
 * an errored/cancelled job has no result file worth offering a re-download for. Jobs newly done
 * within the same notification are recorded together in one write (see appendHistoryEntries).
 * Returns the unsubscribe function.
 */
export function startHistoryRecording(): () => void {
  const recordedIds = new Set<string>();

  return downloader.subscribe((jobs: JobState[]) => {
    const newlyDone = jobs.filter((job) => job.phase === "done" && !recordedIds.has(job.id));
    if (newlyDone.length === 0) return;
    for (const job of newlyDone) recordedIds.add(job.id);
    appendHistoryEntries(
      newlyDone.map((job) => ({
        id: job.id,
        url: job.url,
        format: job.format,
        quality: job.quality,
        title: job.title,
        thumbnail: job.thumbnail ?? null,
        result: job.result,
        ext: job.ext,
        createdAt: job.createdAt,
        completedAt: job.updatedAt,
      }))
    );
  });
}
