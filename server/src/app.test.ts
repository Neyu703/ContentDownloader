import fs from "node:fs";
import path from "node:path";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("./platforms/registry.js", () => ({ detectPlatform: vi.fn() }));

import { app } from "./app.js";
import { detectPlatform } from "./platforms/registry.js";
import { DOWNLOADS_DIR } from "./environment.js";
import type { Platform } from "./platforms/Platform.js";

const VALID_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

/** Mirrors BasePlatform's default describeError() so the fake behaves like a real platform would. */
function describeErrorLikeBasePlatform(err: unknown): { key: string; params: { raw: string } } {
  const raw = err instanceof Error ? err.message : String(err);
  return { key: "errors.raw", params: { raw } };
}

/** A fake platform supporting only the core interface — used for /api/info and /api/convert tests. */
function fakePlatform() {
  return {
    id: "fake",
    checkAvailability: vi.fn(),
    fetchInfo: vi.fn(),
    buildFormatArgs: vi.fn(),
    download: vi.fn(),
    isRetryableError: vi.fn(),
    describeError: vi.fn(describeErrorLikeBasePlatform),
  };
}

/** A fake platform that also supports playlists — used for /api/playlist-info tests. */
function fakePlaylistPlatform() {
  return {
    ...fakePlatform(),
    fetchPlaylistInfo: vi.fn(),
    defaultThumbnail: vi.fn(),
  };
}

let platform: ReturnType<typeof fakePlaylistPlatform>;

beforeEach(() => {
  platform = fakePlaylistPlatform();
  vi.mocked(detectPlatform).mockImplementation((url: string) =>
    url === VALID_URL ? (platform as unknown as Platform) : null
  );
});

describe("GET /api/ping", () => {
  it("reports ok with the service name", async () => {
    const res = await request(app).get("/api/ping");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: "content-downloader-server" });
  });
});

describe("GET /api/info", () => {
  it("400s on a missing/invalid url", async () => {
    const res = await request(app).get("/api/info");
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("errors.invalidUrl");
  });

  it("returns the video info on success", async () => {
    platform.fetchInfo.mockResolvedValueOnce({ title: "T", duration: 1, thumbnail: null, uploader: null });
    const res = await request(app).get("/api/info").query({ url: VALID_URL });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("T");
  });

  it("502s when fetchInfo rejects", async () => {
    platform.fetchInfo.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/api/info").query({ url: VALID_URL });
    expect(res.status).toBe(502);
    expect(res.body.errorKey).toBe("errors.raw");
    expect(res.body.errorParams).toEqual({ raw: "boom" });
  });
});

describe("GET /api/playlist-info", () => {
  it("400s on a missing/invalid url", async () => {
    const res = await request(app).get("/api/playlist-info");
    expect(res.status).toBe(400);
  });

  it("400s with errors.playlistNotSupported when the platform doesn't support playlists", async () => {
    vi.mocked(detectPlatform).mockImplementation((url: string) =>
      url === VALID_URL ? (fakePlatform() as unknown as Platform) : null
    );
    const res = await request(app).get("/api/playlist-info").query({ url: VALID_URL });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("errors.playlistNotSupported");
  });

  it("uses the default start when omitted", async () => {
    platform.fetchPlaylistInfo.mockResolvedValueOnce({ title: "P", entries: [], totalCount: 0 });
    const res = await request(app).get("/api/playlist-info").query({ url: VALID_URL });
    expect(res.status).toBe(200);
    expect(platform.fetchPlaylistInfo).toHaveBeenCalledWith(1);
  });

  it("400s on start=0", async () => {
    const res = await request(app).get("/api/playlist-info").query({ url: VALID_URL, start: "0" });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("errors.invalidStartIndex");
  });

  it("400s on a negative start", async () => {
    const res = await request(app).get("/api/playlist-info").query({ url: VALID_URL, start: "-5" });
    expect(res.status).toBe(400);
  });

  it("400s on a non-integer start", async () => {
    const res = await request(app).get("/api/playlist-info").query({ url: VALID_URL, start: "x" });
    expect(res.status).toBe(400);
  });

  it("returns playlist info for a valid start", async () => {
    platform.fetchPlaylistInfo.mockResolvedValueOnce({ title: "P", entries: [], totalCount: 3 });
    const res = await request(app).get("/api/playlist-info").query({ url: VALID_URL, start: "5" });
    expect(res.status).toBe(200);
    expect(platform.fetchPlaylistInfo).toHaveBeenCalledWith(5);
  });

  it("502s when fetchPlaylistInfo rejects", async () => {
    platform.fetchPlaylistInfo.mockRejectedValueOnce(new Error("nope"));
    const res = await request(app).get("/api/playlist-info").query({ url: VALID_URL });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/convert", () => {
  it("400s on a missing/invalid url", async () => {
    const res = await request(app).post("/api/convert").send({ format: "audio", quality: "320" });
    expect(res.status).toBe(400);
  });

  it("400s when no body is sent at all (req.body is undefined, not just missing url)", async () => {
    const res = await request(app).post("/api/convert");
    expect(res.status).toBe(400);
  });

  it("400s on an invalid format", async () => {
    const res = await request(app).post("/api/convert").send({ url: VALID_URL, format: "pdf", quality: "320" });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("errors.invalidFormat");
  });

  it("400s on an invalid audio quality", async () => {
    const res = await request(app).post("/api/convert").send({ url: VALID_URL, format: "audio", quality: "999" });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("errors.invalidQuality");
  });

  it("400s on an invalid video quality", async () => {
    const res = await request(app).post("/api/convert").send({ url: VALID_URL, format: "video", quality: "999" });
    expect(res.status).toBe(400);
  });

  it("400s on a non-string quality", async () => {
    const res = await request(app).post("/api/convert").send({ url: VALID_URL, format: "audio", quality: 320 });
    expect(res.status).toBe(400);
  });

  it("starts a job, then resolves it to done via the polled job endpoint", async () => {
    let capturedOnProgress: ((u: unknown) => void) | undefined;
    platform.download.mockImplementationOnce((_format: unknown, _quality: unknown, onProgress: (u: unknown) => void) => {
      capturedOnProgress = onProgress;
      return new Promise((resolve) => {
        onProgress({ stage: "fetching_info", messageKey: "job.fetchingInfo", progress: null });
        setTimeout(() => resolve({ id: "file-id", filePath: "/x", title: "Song", ext: "mp3" }), 5);
      });
    });

    const startRes = await request(app)
      .post("/api/convert")
      .send({ url: VALID_URL, format: "audio", quality: "320" });
    expect(startRes.status).toBe(200);
    const { jobId } = startRes.body;
    expect(jobId).toEqual(expect.any(String));
    expect(capturedOnProgress).toBeDefined();

    const intermediate = await request(app).get(`/api/job/${jobId}`);
    expect(intermediate.body.stage).toBe("fetching_info");

    await vi.waitFor(async () => {
      const res = await request(app).get(`/api/job/${jobId}`);
      expect(res.body.stage).toBe("done");
    });
    const finalRes = await request(app).get(`/api/job/${jobId}`);
    expect(finalRes.body).toMatchObject({ stage: "done", resultId: "file-id", title: "Song", ext: "mp3" });
  });

  it("evicts a finished job from the map after the TTL elapses", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      platform.download.mockResolvedValueOnce({ id: "x", filePath: "/x", title: "T", ext: "mp3" });
      const startRes = await request(app)
        .post("/api/convert")
        .send({ url: VALID_URL, format: "audio", quality: "320" });
      const { jobId } = startRes.body;

      const doneRes = await request(app).get(`/api/job/${jobId}`);
      expect(doneRes.body.stage).toBe("done");

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      const afterRes = await request(app).get(`/api/job/${jobId}`);
      expect(afterRes.status).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves a job to error when download rejects", async () => {
    platform.download.mockRejectedValueOnce(new Error("conversion failed"));
    const startRes = await request(app)
      .post("/api/convert")
      .send({ url: VALID_URL, format: "audio", quality: "320" });
    const { jobId } = startRes.body;

    await vi.waitFor(async () => {
      const res = await request(app).get(`/api/job/${jobId}`);
      expect(res.body.stage).toBe("error");
    });
    const finalRes = await request(app).get(`/api/job/${jobId}`);
    expect(finalRes.body.errorKey).toBe("errors.raw");
    expect(finalRes.body.errorParams).toEqual({ raw: "conversion failed" });
  });
});

describe("GET /api/job/:jobId", () => {
  it("404s for an unknown job id", async () => {
    const res = await request(app).get("/api/job/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/download/:id", () => {
  beforeEach(() => {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  });

  it("400s on a malformed id", async () => {
    const res = await request(app).get("/api/download/not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("404s when no matching file exists", async () => {
    const res = await request(app).get("/api/download/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("streams the file, sanitizes the ?name= query param, and deletes it afterward", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp3`);
    fs.writeFileSync(filePath, "fake audio content");

    const res = await request(app).get(`/api/download/${id}`).query({ name: 'My<>Song' });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("MySong.mp3");
    await vi.waitFor(() => expect(fs.existsSync(filePath)).toBe(false));
  });

  it("falls back to 'audio' when ?name= strips down to nothing but illegal characters", async () => {
    const id = "33333333-3333-3333-3333-333333333333";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp3`);
    fs.writeFileSync(filePath, "fake audio content");

    const res = await request(app).get(`/api/download/${id}`).query({ name: "<<<>>>" });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("audio.mp3");
    await vi.waitFor(() => expect(fs.existsSync(filePath)).toBe(false));
  });

  it("responds 500 and keeps the file when the transfer errors before headers are sent", async () => {
    const id = "44444444-4444-4444-4444-444444444444";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp3`);
    fs.writeFileSync(filePath, "fake audio content");
    const downloadSpy = vi
      .spyOn(express.response, "download")
      .mockImplementation(function (this: unknown, ..._args: unknown[]) {
        (_args[2] as (err: Error) => void)(new Error("transfer failed"));
      });

    const res = await request(app).get(`/api/download/${id}`);

    expect(res.status).toBe(500);
    expect(fs.existsSync(filePath)).toBe(true);
    downloadSpy.mockRestore();
    fs.unlinkSync(filePath);
  });

  it("leaves the response alone when the transfer errors after headers were already sent", async () => {
    const id = "55555555-5555-5555-5555-555555555555";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp3`);
    fs.writeFileSync(filePath, "fake audio content");
    const downloadSpy = vi
      .spyOn(express.response, "download")
      .mockImplementation(function (this: import("express").Response, ..._args: unknown[]) {
        this.status(200).write("partial content");
        (_args[2] as (err: Error) => void)(new Error("connection dropped mid-transfer"));
        this.end();
      });

    const res = await request(app).get(`/api/download/${id}`);

    expect(res.status).toBe(200);
    expect(fs.existsSync(filePath)).toBe(true);
    downloadSpy.mockRestore();
    fs.unlinkSync(filePath);
  });

  it("falls back to 'download' as the filename when ?name= is omitted", async () => {
    const id = "22222222-2222-2222-2222-222222222222";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp4`);
    fs.writeFileSync(filePath, "fake video content");

    const res = await request(app).get(`/api/download/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("download.mp4");
    await vi.waitFor(() => expect(fs.existsSync(filePath)).toBe(false));
  });
});

describe("CORS", () => {
  it("allows a request with no Origin header", async () => {
    const res = await request(app).get("/api/ping");
    expect(res.status).toBe(200);
  });

  it("allows a localhost origin", async () => {
    const res = await request(app).get("/api/ping").set("Origin", "http://localhost:3000");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("rejects a non-local origin", async () => {
    const res = await request(app).get("/api/ping").set("Origin", "https://evil.example.com");
    expect(res.status).toBe(500);
  });
});

afterEach(() => {
  vi.clearAllMocks();
  // Clean up any leftover test files under DOWNLOADS_DIR from a failed assertion.
  if (fs.existsSync(DOWNLOADS_DIR)) {
    for (const f of fs.readdirSync(DOWNLOADS_DIR)) fs.rmSync(path.join(DOWNLOADS_DIR, f), { force: true });
  }
});
