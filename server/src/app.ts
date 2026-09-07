import express, { type Response } from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deleteCookies, getCookiesStatus, saveCookies } from "./cookies.js";
import { AUDIO_QUALITIES, DOWNLOADS_DIR, VIDEO_QUALITIES } from "./environment.js";
import { createJob, finishJob, getJob, updateJob } from "./jobStore.js";
import { detectPlatform } from "./platforms/registry.js";
import { isPlaylistCapable, type MediaFormat, type Platform } from "./platforms/Platform.js";

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
// Every request body is a handful of short fields or a cookies.txt export (at most tens of KB) —
// a generous but bounded limit blocks abuse without risking a legitimate request.
app.use(express.json({ limit: "512kb" }));

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

/** Writes the shared 502 response for a platform error, e.g. a failed fetchInfo()/fetchPlaylistInfo(). */
function respondWithPlatformError(res: Response, platform: Platform, err: unknown): void {
  const { key, params } = platform.describeError(err);
  res.status(502).json({ errorKey: key, errorParams: params });
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
    respondWithPlatformError(res, platform, err);
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
    respondWithPlatformError(res, platform, err);
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
  createJob(jobId);
  res.json({ jobId });

  platform
    .download(format as MediaFormat, quality, (update) => {
      updateJob(jobId, update);
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

app.get("/api/cookies", (_req, res) => {
  res.json(getCookiesStatus());
});

app.post("/api/cookies", (req, res) => {
  const cookies = req.body?.cookies;
  if (typeof cookies !== "string" || !cookies.trim()) {
    res.status(400).json({ errorKey: "errors.cookiesEmpty" });
    return;
  }
  saveCookies(cookies);
  console.log(`Cookies importiert (${cookies.trim().split("\n").length} Zeilen)`);
  res.json({ ok: true });
});

app.delete("/api/cookies", (_req, res) => {
  deleteCookies();
  console.log("Cookies entfernt");
  res.json({ ok: true });
});

app.get("/api/job/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
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
    if (err) {
      // Client aborted mid-transfer, or the read failed — leave the file in place so a retry can
      // still succeed, and finish the response ourselves (res.download won't on error).
      if (!res.headersSent) res.status(500).json({ errorKey: "errors.unknown" });
      return;
    }
    fs.unlink(filePath, () => {});
  });
});

export default app;
