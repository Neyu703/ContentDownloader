import express, { type Response } from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AUDIO_QUALITIES, DOWNLOADS_DIR, VIDEO_QUALITIES } from "./environment.js";
import { detectPlatform } from "./platforms/registry.js";
import { isPlaylistCapable, type MediaFormat, type Platform } from "./platforms/Platform.js";
import type { ProgressUpdate } from "./progress.js";

fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const DOWNLOAD_ID_PATTERN = /^[0-9a-f-]{36}$/i;

export const app = express();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || LOCAL_ORIGIN.test(origin)) callback(null, true);
      else callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || "audio";
}

/** Detects the platform for `url`, writing the shared 400 response if none matches. Returns the platform, or null. */
function requirePlatform(url: unknown, res: Response): Platform | null {
  const platform = typeof url === "string" ? detectPlatform(url) : null;
  if (platform) return platform;
  res.status(400).json({ errorKey: "errors.invalidUrl" });
  return null;
}

type JobState = Omit<ProgressUpdate, "stage"> & {
  stage: ProgressUpdate["stage"] | "starting" | "done" | "error";
  resultId?: string;
  title?: string;
  ext?: string;
  errorKey?: string;
  errorParams?: Record<string, string | number>;
};

const jobs = new Map<string, JobState>();
const JOB_TTL_MS = 10 * 60 * 1000;

/** Stores a job's final state and schedules its removal after JOB_TTL_MS. */
function finishJob(jobId: string, state: JobState): void {
  jobs.set(jobId, state);
  setTimeout(() => jobs.delete(jobId), JOB_TTL_MS);
}

app.get("/api/ping", (_req, res) => {
  res.json({ ok: true, service: "content-downloader-server" });
});

app.get("/api/info", async (req, res) => {
  const platform = requirePlatform(req.query.url, res);
  if (!platform) return;

  try {
    const info = await platform.fetchInfo();
    res.json(info);
  } catch (err) {
    const { key, params } = platform.describeError(err);
    res.status(502).json({ errorKey: key, errorParams: params });
  }
});

app.get("/api/playlist-info", async (req, res) => {
  const platform = requirePlatform(req.query.url, res);
  if (!platform) return;
  if (!isPlaylistCapable(platform)) {
    res.status(400).json({ errorKey: "errors.playlistNotSupported" });
    return;
  }
  const start = Number(req.query.start ?? 1);
  if (!Number.isInteger(start) || start < 1) {
    res.status(400).json({ errorKey: "errors.invalidStartIndex" });
    return;
  }

  try {
    const info = await platform.fetchPlaylistInfo(start);
    res.json(info);
  } catch (err) {
    const { key, params } = platform.describeError(err);
    res.status(502).json({ errorKey: key, errorParams: params });
  }
});

app.post("/api/convert", (req, res) => {
  const { format, quality } = req.body ?? {};
  const platform = requirePlatform(req.body?.url, res);
  if (!platform) return;
  if (format !== "audio" && format !== "video") {
    res.status(400).json({ errorKey: "errors.invalidFormat" });
    return;
  }
  const allowedQualities: readonly string[] = format === "audio" ? AUDIO_QUALITIES : VIDEO_QUALITIES;
  if (typeof quality !== "string" || !allowedQualities.includes(quality)) {
    res.status(400).json({ errorKey: "errors.invalidQuality" });
    return;
  }

  const jobId = randomUUID();
  jobs.set(jobId, { stage: "starting", messageKey: "job.starting", progress: null });
  res.json({ jobId });

  platform
    .download(format as MediaFormat, quality, (update) => {
      jobs.set(jobId, update);
    })
    .then((result) => {
      finishJob(jobId, {
        stage: "done",
        messageKey: "job.done",
        progress: 100,
        resultId: result.id,
        title: result.title,
        ext: result.ext,
      });
    })
    .catch((err) => {
      const { key, params } = platform.describeError(err);
      finishJob(jobId, {
        stage: "error",
        messageKey: "job.conversionFailed",
        progress: null,
        errorKey: key,
        errorParams: params,
      });
    });
});

app.get("/api/job/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ errorKey: "errors.jobNotFound" });
    return;
  }
  res.json(job);
});

app.get("/api/download/:id", (req, res) => {
  const id = req.params.id;
  if (!DOWNLOAD_ID_PATTERN.test(id)) {
    res.status(400).json({ errorKey: "errors.invalidDownloadId" });
    return;
  }

  const match = fs.readdirSync(DOWNLOADS_DIR).find((f) => f.startsWith(`${id}.`));
  if (!match) {
    res.status(404).json({ errorKey: "errors.fileNotFound" });
    return;
  }
  const filePath = path.join(DOWNLOADS_DIR, match);
  const ext = path.extname(match);

  const downloadName = sanitizeFilename(String(req.query.name ?? "download")) + ext;
  res.download(filePath, downloadName, (err) => {
    fs.unlink(filePath, () => {});
  });
});

export default app;
