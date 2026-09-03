import express, { type Response } from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isValidYoutubeUrl } from "./validate.js";
import { userFacingErrorMessage } from "./utils.js";
import {
  downloadMedia,
  getVideoInfo,
  getPlaylistInfo,
  DOWNLOADS_DIR,
  AUDIO_QUALITIES,
  VIDEO_QUALITIES,
  type ProgressUpdate,
  type MediaFormat,
} from "./youtube.js";

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

/** Validates `url` and, if invalid, writes the shared 400 response. Returns whether it was valid. */
function requireYoutubeUrl(url: unknown, res: Response): url is string {
  if (typeof url === "string" && isValidYoutubeUrl(url)) return true;
  res.status(400).json({ error: "Bitte einen gültigen YouTube-Link angeben." });
  return false;
}

type JobState = Omit<ProgressUpdate, "stage"> & {
  stage: ProgressUpdate["stage"] | "starting" | "done" | "error";
  resultId?: string;
  title?: string;
  ext?: string;
  error?: string;
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
  const url = req.query.url;
  if (!requireYoutubeUrl(url, res)) return;

  try {
    const info = await getVideoInfo(url);
    res.json(info);
  } catch (err) {
    res.status(502).json({ error: userFacingErrorMessage(err, "Video-Informationen konnten nicht geladen werden.") });
  }
});

app.get("/api/playlist-info", async (req, res) => {
  const url = req.query.url;
  if (!requireYoutubeUrl(url, res)) return;
  const start = Number(req.query.start ?? 1);
  if (!Number.isInteger(start) || start < 1) {
    res.status(400).json({ error: "Ungültiger Startindex." });
    return;
  }

  try {
    const info = await getPlaylistInfo(url, start);
    res.json(info);
  } catch (err) {
    res.status(502).json({ error: userFacingErrorMessage(err, "Playlist konnte nicht geladen werden.") });
  }
});

app.post("/api/convert", (req, res) => {
  const { url, format, quality } = req.body ?? {};
  if (!requireYoutubeUrl(url, res)) return;
  if (format !== "audio" && format !== "video") {
    res.status(400).json({ error: "Bitte Audio oder Video auswählen." });
    return;
  }
  const allowedQualities: readonly string[] = format === "audio" ? AUDIO_QUALITIES : VIDEO_QUALITIES;
  if (typeof quality !== "string" || !allowedQualities.includes(quality)) {
    res.status(400).json({ error: "Bitte eine gültige Qualität auswählen." });
    return;
  }

  const jobId = randomUUID();
  jobs.set(jobId, { stage: "starting", message: "Wird gestartet…", progress: null });
  res.json({ jobId });

  downloadMedia(url, format as MediaFormat, quality, (update) => {
    jobs.set(jobId, update);
  })
    .then((result) => {
      finishJob(jobId, {
        stage: "done",
        message: "Fertig!",
        progress: 100,
        resultId: result.id,
        title: result.title,
        ext: result.ext,
      });
    })
    .catch((err) => {
      finishJob(jobId, {
        stage: "error",
        message: "Konvertierung fehlgeschlagen.",
        progress: null,
        error: userFacingErrorMessage(err),
      });
    });
});

app.get("/api/job/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job nicht gefunden." });
    return;
  }
  res.json(job);
});

app.get("/api/download/:id", (req, res) => {
  const id = req.params.id;
  if (!DOWNLOAD_ID_PATTERN.test(id)) {
    res.status(400).json({ error: "Ungültige ID." });
    return;
  }

  const match = fs.readdirSync(DOWNLOADS_DIR).find((f) => f.startsWith(`${id}.`));
  if (!match) {
    res.status(404).json({ error: "Datei nicht gefunden." });
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
