import type { Downloader, DownloadRequest, JobPhase, JobState, SetupState } from "./types";

const SERVER_URL = "http://localhost:3001";
const POLL_INTERVAL_MS = 600;
const PING_TIMEOUT_MS = 2000;

interface ServerJob {
  stage: "starting" | "fetching_info" | "downloading" | "converting" | "done" | "error";
  message: string;
  progress: number | null;
  downloadedMB?: number;
  totalMB?: number;
  speedMBs?: number;
  eta?: string;
  resultId?: string;
  title?: string;
  ext?: string;
  error?: string;
}

const STAGE_TO_PHASE: Record<ServerJob["stage"], JobPhase> = {
  starting: "queued",
  fetching_info: "fetching_info",
  downloading: "downloading",
  converting: "converting",
  done: "done",
  error: "error",
};

const jobs = new Map<string, JobState>();
const pollers = new Map<string, ReturnType<typeof setInterval>>();
const listeners = new Set<(jobs: JobState[], setup: SetupState) => void>();

// The web build talks to the local Express server; without a bounded timeout a dropped connection
// leaves fetch() hanging forever instead of failing (see contentdownloader-dev-server-networking memory).
async function isServerReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(`${SERVER_URL}/api/ping`, { signal: controller.signal });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.service === "content-downloader-server";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.error ?? "Unbekannter Fehler.";
  } catch {
    return "Unbekannter Fehler.";
  }
}

function notify() {
  const list = Array.from(jobs.values()).sort((a, b) => a.createdAt - b.createdAt);
  listeners.forEach((listener) => listener(list, { phase: "ready", message: "" }));
}

function patchJob(id: string, patch: Partial<JobState>) {
  const existing = jobs.get(id);
  if (!existing) return;
  jobs.set(id, { ...existing, ...patch, updatedAt: Date.now() });
  notify();
}

function stopPolling(id: string) {
  const timer = pollers.get(id);
  if (timer) {
    clearInterval(timer);
    pollers.delete(id);
  }
}

function pollJob(id: string) {
  const timer = setInterval(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/job/${id}`);
      if (!res.ok) {
        stopPolling(id);
        patchJob(id, { phase: "error", error: await parseError(res) });
        return;
      }
      const job: ServerJob = await res.json();

      if (job.stage === "done" && job.resultId && job.title && job.ext) {
        stopPolling(id);
        patchJob(id, {
          phase: "done",
          title: job.title,
          ext: job.ext as JobState["ext"],
          progress: 100,
          result: `${SERVER_URL}/api/download/${job.resultId}?name=${encodeURIComponent(job.title)}`,
        });
        return;
      }
      if (job.stage === "error") {
        stopPolling(id);
        patchJob(id, { phase: "error", error: job.error ?? "Download fehlgeschlagen." });
        return;
      }
      patchJob(id, {
        phase: STAGE_TO_PHASE[job.stage],
        progress: job.progress,
        downloadedMB: job.downloadedMB,
        totalMB: job.totalMB,
        speedMBs: job.speedMBs,
        lastLine: job.message,
      });
    } catch {
      stopPolling(id);
      patchJob(id, { phase: "error", error: `Server nicht erreichbar unter ${SERVER_URL}` });
    }
  }, POLL_INTERVAL_MS);
  pollers.set(id, timer);
}

export const downloader: Downloader = {
  subscribe(listener) {
    listeners.add(listener);
    listener(Array.from(jobs.values()).sort((a, b) => a.createdAt - b.createdAt), {
      phase: "ready",
      message: "",
    });
    return () => listeners.delete(listener);
  },

  async enqueue(request: DownloadRequest) {
    if (!(await isServerReachable())) {
      throw new Error(`Server nicht erreichbar unter ${SERVER_URL}. Bitte "pnpm dev:server" starten.`);
    }

    const res = await fetch(`${SERVER_URL}/api/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(await parseError(res));

    const { jobId } = await res.json();
    const now = Date.now();
    jobs.set(jobId, {
      id: jobId,
      url: request.url,
      format: request.format,
      quality: request.quality,
      phase: "queued",
      title: null,
      progress: null,
      etaSeconds: null,
      lastLine: "",
      result: null,
      ext: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    notify();
    pollJob(jobId);
    return jobId;
  },

  cancel(id: string) {
    // The server has no cancel endpoint; this only stops polling and hides the job, same as the
    // previous "Neu versuchen" reset behaved.
    stopPolling(id);
    patchJob(id, { phase: "cancelled" });
  },

  clearFinished() {
    for (const [id, job] of jobs) {
      if (job.phase === "done" || job.phase === "error" || job.phase === "cancelled") {
        jobs.delete(id);
      }
    }
    notify();
  },
};
