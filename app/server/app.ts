import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { deleteCookies, getCookiesStatus, saveCookies } from "./cookies.js";
import { AUDIO_QUALITIES, DOWNLOADS_DIR, VIDEO_QUALITIES } from "./environment.js";
import { createJob, finishJob, getJob, updateJob } from "./jobStore.js";
import { detectPlatform } from "./platforms/registry.js";
import { isPlaylistCapable, type MediaFormat, type Platform } from "./platforms/Platform.js";

fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const DOWNLOAD_ID_PATTERN = /^[0-9a-f-]{36}$/i;
// Every request body is a handful of short fields or a cookies.txt export (at most tens of KB) —
// a generous but bounded limit blocks abuse without risking a legitimate request.
const JSON_BODY_LIMIT = 512 * 1024;
const PUBLIC_DIR = path.join(process.cwd(), "public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

class PayloadTooLargeError extends Error {}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || "audio";
}

/**
 * A plain quoted filename can't safely carry non-ASCII bytes over an HTTP header (Node throws on
 * non-Latin1 header values), so titles with e.g. Cyrillic/CJK characters need the RFC 5987
 * `filename*=` form alongside an ASCII-only fallback.
 */
function contentDispositionHeader(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let overLimit = false;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        // Reject once, but keep draining the socket instead of destroying it — killing the
        // connection mid-upload surfaces as an ECONNRESET on the client instead of our 413.
        if (!overLimit) reject(new PayloadTooLargeError());
        overLimit = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Reads and parses a JSON request body, or returns undefined for an empty one. */
async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const buf = await readBody(req, JSON_BODY_LIMIT);
  if (buf.length === 0) return undefined;
  return JSON.parse(buf.toString("utf-8"));
}

/** Runs `handler` with the parsed JSON body, writing the shared 413/400 response if parsing fails. */
async function withJsonBody(
  req: IncomingMessage,
  res: ServerResponse,
  handler: (body: Record<string, unknown> | undefined) => void | Promise<void>
): Promise<void> {
  let body: unknown;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      sendJson(res, 413, { errorKey: "errors.payloadTooLarge" });
    } else {
      sendJson(res, 400, { errorKey: "errors.invalidJson" });
    }
    return;
  }
  await handler(body as Record<string, unknown> | undefined);
}

/** Detects the platform for `url`, writing the shared 400 response if none matches. Returns the platform, or null. */
function requirePlatform(url: unknown, res: ServerResponse): Platform | null {
  const platform = typeof url === "string" ? detectPlatform(url) : null;
  if (platform) return platform;
  sendJson(res, 400, { errorKey: "errors.invalidUrl" });
  return null;
}

/** Writes the shared 502 response for a platform error, e.g. a failed fetchInfo()/fetchPlaylistInfo(). */
function respondWithPlatformError(res: ServerResponse, platform: Platform, err: unknown): void {
  const { key, params } = platform.describeError(err);
  sendJson(res, 502, { errorKey: key, errorParams: params });
}

/** Mirrors the old `cors()` middleware: reflects a localhost Origin, 500s for anything else, passes through with none. */
function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (LOCAL_ORIGIN.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    return true;
  }
  sendJson(res, 500, { errorKey: "errors.corsRejected" });
  return false;
}

function handlePreflight(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(204, {
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] ?? "Content-Type",
  });
  res.end();
}

async function handlePing(res: ServerResponse): Promise<void> {
  sendJson(res, 200, { ok: true, service: "content-downloader-server" });
}

async function handleInfo(res: ServerResponse, query: URLSearchParams): Promise<void> {
  const platform = requirePlatform(query.get("url"), res);
  if (!platform) return;

  try {
    const info = await platform.fetchInfo();
    sendJson(res, 200, info);
  } catch (err) {
    respondWithPlatformError(res, platform, err);
  }
}

async function handlePlaylistInfo(res: ServerResponse, query: URLSearchParams): Promise<void> {
  const platform = requirePlatform(query.get("url"), res);
  if (!platform) return;
  if (!isPlaylistCapable(platform)) {
    sendJson(res, 400, { errorKey: "errors.playlistNotSupported" });
    return;
  }
  const start = Number(query.get("start") ?? 1);
  if (!Number.isInteger(start) || start < 1) {
    sendJson(res, 400, { errorKey: "errors.invalidStartIndex" });
    return;
  }

  try {
    const info = await platform.fetchPlaylistInfo(start);
    sendJson(res, 200, info);
  } catch (err) {
    respondWithPlatformError(res, platform, err);
  }
}

async function handleConvert(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await withJsonBody(req, res, (body) => {
    const { format, quality } = body ?? {};
    const platform = requirePlatform(body?.url, res);
    if (!platform) return;
    if (format !== "audio" && format !== "video") {
      sendJson(res, 400, { errorKey: "errors.invalidFormat" });
      return;
    }
    const allowedQualities: readonly string[] = format === "audio" ? AUDIO_QUALITIES : VIDEO_QUALITIES;
    if (typeof quality !== "string" || !allowedQualities.includes(quality)) {
      sendJson(res, 400, { errorKey: "errors.invalidQuality" });
      return;
    }

    const jobId = randomUUID();
    createJob(jobId);
    sendJson(res, 200, { jobId });

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
}

async function handleGetCookies(res: ServerResponse): Promise<void> {
  sendJson(res, 200, getCookiesStatus());
}

async function handlePostCookies(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await withJsonBody(req, res, (body) => {
    const cookies = body?.cookies;
    if (typeof cookies !== "string" || !cookies.trim()) {
      sendJson(res, 400, { errorKey: "errors.cookiesEmpty" });
      return;
    }
    saveCookies(cookies);
    console.log(`Cookies importiert (${cookies.trim().split("\n").length} Zeilen)`);
    sendJson(res, 200, { ok: true });
  });
}

async function handleDeleteCookies(res: ServerResponse): Promise<void> {
  deleteCookies();
  console.log("Cookies entfernt");
  sendJson(res, 200, { ok: true });
}

async function handleGetJob(res: ServerResponse, jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) {
    sendJson(res, 404, { errorKey: "errors.jobNotFound" });
    return;
  }
  sendJson(res, 200, job);
}

/** Streams `filePath` to `res` as an attachment, invoking `callback(err)` exactly once — mirrors Express's res.download(). */
function streamFile(filePath: string, res: ServerResponse, callback: (err?: Error) => void): void {
  let settled = false;
  const settle = (err?: Error) => {
    if (settled) return;
    settled = true;
    callback(err);
  };

  const stream = fs.createReadStream(filePath);
  stream.on("error", settle);
  res.on("finish", () => settle());
  stream.pipe(res);
}

async function handleDownload(res: ServerResponse, id: string, query: URLSearchParams): Promise<void> {
  if (!DOWNLOAD_ID_PATTERN.test(id)) {
    sendJson(res, 400, { errorKey: "errors.invalidDownloadId" });
    return;
  }

  const match = fs.readdirSync(DOWNLOADS_DIR).find((f) => f.startsWith(`${id}.`));
  if (!match) {
    sendJson(res, 404, { errorKey: "errors.fileNotFound" });
    return;
  }
  const filePath = path.join(DOWNLOADS_DIR, match);
  const ext = path.extname(match);

  const downloadName = sanitizeFilename(query.get("name") ?? "download") + ext;
  res.setHeader("Content-Disposition", contentDispositionHeader(downloadName));
  streamFile(filePath, res, (err) => {
    if (err) {
      // Client aborted mid-transfer, or the read failed — leave the file in place so a retry can
      // still succeed. Before headers went out we can still report a clean 500; after that all we
      // can do is truncate the connection instead of leaving it hanging open.
      // streamFile only ever invokes this callback once (its `settled` guard), so if we're here
      // for an error, the 'finish' event hasn't fired yet and the response can't be ended already.
      if (!res.headersSent) sendJson(res, 500, { errorKey: "errors.unknown" });
      else res.end();
      return;
    }
    fs.unlink(filePath, () => {});
  });
}

/**
 * Resolves `requestPath` to an on-disk path under `base`. Safe against `..` traversal without an
 * explicit check: `requestPath` always comes from a WHATWG `URL`'s `pathname`, which the URL
 * spec guarantees is already dot-segment-normalized (including percent-encoded `%2e%2e`) before
 * we ever see it, so `path.join` here can't be walked above `base`.
 */
function resolveStaticPath(base: string, requestPath: string): string {
  return path.join(base, decodeURIComponent(requestPath));
}

/** Returns a file's stats, or null if it doesn't exist or isn't a regular file. */
function statFileOrNull(filePath: string): fs.Stats | null {
  const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  return stats?.isFile() ? stats : null;
}

/** Serves the exported web build from PUBLIC_DIR, falling back to index.html for SPA navigation paths. */
function serveStatic(res: ServerResponse, pathname: string): void {
  const requested = resolveStaticPath(PUBLIC_DIR, pathname === "/" ? "/index.html" : pathname);
  const hasExtension = path.extname(pathname) !== "";

  const requestedStats = hasExtension ? statFileOrNull(requested) : null;
  const target = requestedStats ? requested : hasExtension ? null : path.join(PUBLIC_DIR, "index.html");
  const targetStats = requestedStats ?? (target ? statFileOrNull(target) : null);

  if (!target || !targetStats) {
    sendJson(res, 404, { errorKey: "errors.notFound" });
    return;
  }

  res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(target)] ?? "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
}

export const app = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  try {
    if (!applyCors(req, res)) return;
    if (req.method === "OPTIONS") {
      handlePreflight(req, res);
      return;
    }

    // This handler only ever runs for regular HTTP requests (never CONNECT/upgrade), so Node
    // always populates both of these despite their optional IncomingMessage types.
    const { pathname, searchParams } = new URL(req.url!, "http://internal");
    const method = req.method!;

    if (method === "GET" && pathname === "/api/ping") return await handlePing(res);
    if (method === "GET" && pathname === "/api/info") return await handleInfo(res, searchParams);
    if (method === "GET" && pathname === "/api/playlist-info") return await handlePlaylistInfo(res, searchParams);
    if (method === "POST" && pathname === "/api/convert") return await handleConvert(req, res);
    if (method === "GET" && pathname === "/api/cookies") return await handleGetCookies(res);
    if (method === "POST" && pathname === "/api/cookies") return await handlePostCookies(req, res);
    if (method === "DELETE" && pathname === "/api/cookies") return await handleDeleteCookies(res);

    const jobMatch = method === "GET" ? pathname.match(/^\/api\/job\/([^/]+)$/) : null;
    if (jobMatch) return await handleGetJob(res, decodeURIComponent(jobMatch[1]));

    const downloadMatch = method === "GET" ? pathname.match(/^\/api\/download\/([^/]+)$/) : null;
    if (downloadMatch) return await handleDownload(res, decodeURIComponent(downloadMatch[1]), searchParams);

    if (method === "GET" && !pathname.startsWith("/api/")) {
      serveStatic(res, pathname);
      return;
    }

    sendJson(res, 404, { errorKey: "errors.notFound" });
  } catch {
    // A handler already started its response (e.g. mid-stream) before failing — no fresh body can
    // go out, so just close the connection instead of leaving the client hanging forever.
    if (!res.headersSent) sendJson(res, 500, { errorKey: "errors.unknown" });
    else res.end();
  }
};

export default app;
