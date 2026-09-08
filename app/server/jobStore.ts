import type { ProgressUpdate } from "./progress.js";

export type JobState = Omit<ProgressUpdate, "stage"> & {
  stage: ProgressUpdate["stage"] | "starting" | "done" | "error";
  resultId?: string;
  title?: string;
  ext?: string;
  errorKey?: string;
  errorParams?: Record<string, string | number>;
};

const JOB_TTL_MS = 10 * 60 * 1000;

const jobs = new Map<string, JobState>();

export function createJob(jobId: string): void {
  jobs.set(jobId, { stage: "starting", messageKey: "job.starting", progress: null });
}

/** Updates a still-running job's progress. Does not schedule eviction — only finishJob() does. */
export function updateJob(jobId: string, update: JobState): void {
  jobs.set(jobId, update);
}

export function getJob(jobId: string): JobState | undefined {
  return jobs.get(jobId);
}

/** Stores a job's final state and schedules its removal after JOB_TTL_MS. */
export function finishJob(jobId: string, state: JobState): void {
  jobs.set(jobId, state);
  setTimeout(() => jobs.delete(jobId), JOB_TTL_MS);
}
