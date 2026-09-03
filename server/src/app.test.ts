import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("./youtube.js", async () => {
  const actual = await vi.importActual<typeof import("./youtube.js")>("./youtube.js");
  return {
    ...actual,
    getVideoInfo: vi.fn(),
    getPlaylistInfo: vi.fn(),
    downloadMedia: vi.fn(),
  };
});

import { app } from "./app.js";
import { getVideoInfo, getPlaylistInfo, downloadMedia, DOWNLOADS_DIR } from "./youtube.js";

const VALID_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

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
  });

  it("returns the video info on success", async () => {
    vi.mocked(getVideoInfo).mockResolvedValueOnce({ title: "T", duration: 1, thumbnail: null, uploader: null });
    const res = await request(app).get("/api/info").query({ url: VALID_URL });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("T");
  });

  it("502s when getVideoInfo rejects", async () => {
    vi.mocked(getVideoInfo).mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/api/info").query({ url: VALID_URL });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("boom");
  });
});

describe("GET /api/playlist-info", () => {
  it("400s on a missing/invalid url", async () => {
    const res = await request(app).get("/api/playlist-info");
    expect(res.status).toBe(400);
  });

  it("uses the default start when omitted", async () => {
    vi.mocked(getPlaylistInfo).mockResolvedValueOnce({ title: "P", entries: [], totalCount: 0 });
    const res = await request(app).get("/api/playlist-info").query({ url: VALID_URL });
    expect(res.status).toBe(200);
    expect(getPlaylistInfo).toHaveBeenCalledWith(VALID_URL, 1);
  });

  it("400s on start=0", async () => {
    const res = await request(app).get("/api/playlist-info").query({ url: VALID_URL, start: "0" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ungültiger Startindex.");
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
    vi.mocked(getPlaylistInfo).mockResolvedValueOnce({ title: "P", entries: [], totalCount: 3 });
    const res = await request(app).get("/api/playlist-info").query({ url: VALID_URL, start: "5" });
    expect(res.status).toBe(200);
    expect(getPlaylistInfo).toHaveBeenCalledWith(VALID_URL, 5);
  });

  it("502s when getPlaylistInfo rejects", async () => {
    vi.mocked(getPlaylistInfo).mockRejectedValueOnce(new Error("nope"));
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
    expect(res.body.error).toBe("Bitte Audio oder Video auswählen.");
  });

  it("400s on an invalid audio quality", async () => {
    const res = await request(app).post("/api/convert").send({ url: VALID_URL, format: "audio", quality: "999" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Bitte eine gültige Qualität auswählen.");
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
    vi.mocked(downloadMedia).mockImplementationOnce((_url, _format, _quality, onProgress) => {
      capturedOnProgress = onProgress;
      return new Promise((resolve) => {
        onProgress({ stage: "fetching_info", message: "…", progress: null });
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
      vi.mocked(downloadMedia).mockResolvedValueOnce({ id: "x", filePath: "/x", title: "T", ext: "mp3" });
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

  it("resolves a job to error when downloadMedia rejects", async () => {
    vi.mocked(downloadMedia).mockRejectedValueOnce(new Error("conversion failed"));
    const startRes = await request(app)
      .post("/api/convert")
      .send({ url: VALID_URL, format: "audio", quality: "320" });
    const { jobId } = startRes.body;

    await vi.waitFor(async () => {
      const res = await request(app).get(`/api/job/${jobId}`);
      expect(res.body.stage).toBe("error");
    });
    const finalRes = await request(app).get(`/api/job/${jobId}`);
    expect(finalRes.body.error).toBe("conversion failed");
  });
});

describe("GET /api/job/:jobId", () => {
  it("404s for an unknown job id", async () => {
    const res = await request(app).get("/api/job/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/download/:id", () => {
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
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    fs.writeFileSync(filePath, "fake audio content");

    const res = await request(app).get(`/api/download/${id}`).query({ name: 'My<>Song' });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("MySong.mp3");
    await vi.waitFor(() => expect(fs.existsSync(filePath)).toBe(false));
  });

  it("falls back to 'audio' when ?name= strips down to nothing but illegal characters", async () => {
    const id = "33333333-3333-3333-3333-333333333333";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp3`);
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    fs.writeFileSync(filePath, "fake audio content");

    const res = await request(app).get(`/api/download/${id}`).query({ name: "<<<>>>" });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("audio.mp3");
    await vi.waitFor(() => expect(fs.existsSync(filePath)).toBe(false));
  });

  it("falls back to 'download' as the filename when ?name= is omitted", async () => {
    const id = "22222222-2222-2222-2222-222222222222";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp4`);
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
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
