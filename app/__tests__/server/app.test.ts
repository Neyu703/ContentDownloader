import fs from "node:fs";
import { waitFor } from "@testing-library/react-native";
import path from "node:path";
import { PassThrough } from "node:stream";
import request from "supertest";

jest.mock("../../server/platforms/registry.js", () => ({ detectPlatform: jest.fn() }));
// The real functions already write to server/data/cookies.txt — a path shared with a locally
// running dev server's actual imported cookies. Mocked here so this test file never touches that
// real file (confirmed the hard way: a host-side test run once deleted a real cookies.txt while
// the Docker dev server had one imported, since both share the same bind-mounted directory).
jest.mock("../../server/cookies.js", () => ({
  saveCookies: jest.fn(),
  deleteCookies: jest.fn(),
  getCookiesStatus: jest.fn(),
}));

import { app } from "../../server/app.js";
import { deleteCookies, getCookiesStatus, saveCookies } from "../../server/cookies.js";
import { detectPlatform } from "../../server/platforms/registry.js";
import { DOWNLOADS_DIR } from "../../server/environment.js";
import type { Platform } from "../../server/platforms/Platform.js";

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
    checkAvailability: jest.fn(),
    fetchInfo: jest.fn(),
    buildFormatArgs: jest.fn(),
    download: jest.fn(),
    isRetryableError: jest.fn(),
    describeError: jest.fn(describeErrorLikeBasePlatform),
  };
}

/** A fake platform that also supports playlists — used for /api/playlist-info tests. */
function fakePlaylistPlatform() {
  return {
    ...fakePlatform(),
    fetchPlaylistInfo: jest.fn(),
    defaultThumbnail: jest.fn(),
  };
}

let platform: ReturnType<typeof fakePlaylistPlatform>;

beforeEach(() => {
  platform = fakePlaylistPlatform();
  jest.mocked(detectPlatform).mockImplementation((url: string) =>
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

describe("/api/cookies", () => {
  it("reports the current status", async () => {
    jest.mocked(getCookiesStatus).mockReturnValueOnce({ present: false, updatedAt: null });
    const res = await request(app).get("/api/cookies");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ present: false, updatedAt: null });
  });

  it("rejects an empty cookies body", async () => {
    const res = await request(app).post("/api/cookies").send({ cookies: "  " });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errorKey: "errors.cookiesEmpty" });
    expect(saveCookies).not.toHaveBeenCalled();
  });

  it("rejects a non-string cookies body", async () => {
    const res = await request(app).post("/api/cookies").send({ cookies: 123 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errorKey: "errors.cookiesEmpty" });
    expect(saveCookies).not.toHaveBeenCalled();
  });

  it("rejects a body over the size limit before it ever reaches saveCookies", async () => {
    const oversized = "x".repeat(600 * 1024);
    const res = await request(app).post("/api/cookies").send({ cookies: oversized });
    expect(res.status).toBe(413);
    expect(saveCookies).not.toHaveBeenCalled();
  });

  it("stores cookies and logs the import", async () => {
    const consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});

    const importRes = await request(app).post("/api/cookies").send({ cookies: "# Netscape HTTP Cookie File\n" });

    expect(importRes.status).toBe(200);
    expect(importRes.body).toEqual({ ok: true });
    expect(saveCookies).toHaveBeenCalledWith("# Netscape HTTP Cookie File\n");
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("Cookies importiert"));

    consoleLog.mockRestore();
  });

  it("removes cookies and logs the removal", async () => {
    const consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});

    const deleteRes = await request(app).delete("/api/cookies");

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ ok: true });
    expect(deleteCookies).toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith("Cookies entfernt");

    consoleLog.mockRestore();
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

  it("falls back to a plain 500 when a handler throws synchronously instead of rejecting", async () => {
    jest.mocked(detectPlatform).mockImplementationOnce(() => {
      throw new Error("unexpected synchronous failure");
    });
    const res = await request(app).get("/api/info").query({ url: VALID_URL });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ errorKey: "errors.unknown" });
  });
});

describe("GET /api/playlist-info", () => {
  it("400s on a missing/invalid url", async () => {
    const res = await request(app).get("/api/playlist-info");
    expect(res.status).toBe(400);
  });

  it("400s with errors.playlistNotSupported when the platform doesn't support playlists", async () => {
    jest.mocked(detectPlatform).mockImplementation((url: string) =>
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

  it("400s with errors.invalidJson on a malformed JSON body", async () => {
    const res = await request(app).post("/api/convert").set("Content-Type", "application/json").send("{not valid json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errorKey: "errors.invalidJson" });
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
        // Long enough that the "fetching_info" intermediate check below reliably runs first —
        // Jest's per-request overhead (vs. vitest's) made a 5ms window flaky in practice.
        setTimeout(() => resolve({ id: "file-id", filePath: "/x", title: "Song", ext: "mp3" }), 50);
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

    await waitFor(async () => {
      const res = await request(app).get(`/api/job/${jobId}`);
      expect(res.body.stage).toBe("done");
    });
    const finalRes = await request(app).get(`/api/job/${jobId}`);
    expect(finalRes.body).toMatchObject({ stage: "done", resultId: "file-id", title: "Song", ext: "mp3" });
  });

  it("evicts a finished job from the map after the TTL elapses", async () => {
    jest.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      platform.download.mockResolvedValueOnce({ id: "x", filePath: "/x", title: "T", ext: "mp3" });
      const startRes = await request(app)
        .post("/api/convert")
        .send({ url: VALID_URL, format: "audio", quality: "320" });
      const { jobId } = startRes.body;

      const doneRes = await request(app).get(`/api/job/${jobId}`);
      expect(doneRes.body.stage).toBe("done");

      await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
      const afterRes = await request(app).get(`/api/job/${jobId}`);
      expect(afterRes.status).toBe(404);
    } finally {
      jest.useRealTimers();
    }
  });

  it("resolves a job to error when download rejects", async () => {
    platform.download.mockRejectedValueOnce(new Error("conversion failed"));
    const startRes = await request(app)
      .post("/api/convert")
      .send({ url: VALID_URL, format: "audio", quality: "320" });
    const { jobId } = startRes.body;

    await waitFor(async () => {
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

  it("404s for a non-GET method against a path-param route instead of matching it", async () => {
    const res = await request(app).post("/api/job/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ errorKey: "errors.notFound" });
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
    await waitFor(() => expect(fs.existsSync(filePath)).toBe(false));
  });

  it("falls back to 'audio' when ?name= strips down to nothing but illegal characters", async () => {
    const id = "33333333-3333-3333-3333-333333333333";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp3`);
    fs.writeFileSync(filePath, "fake audio content");

    const res = await request(app).get(`/api/download/${id}`).query({ name: "<<<>>>" });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("audio.mp3");
    await waitFor(() => expect(fs.existsSync(filePath)).toBe(false));
  });

  it("responds 500 and keeps the file when the transfer errors before headers are sent", async () => {
    const id = "44444444-4444-4444-4444-444444444444";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp3`);
    fs.writeFileSync(filePath, "fake audio content");
    // A fake read stream whose pipe() never writes anything before erroring — headers are still unsent.
    const fakeStream = new PassThrough();
    const createReadStreamSpy = jest.spyOn(fs, "createReadStream").mockReturnValue(fakeStream as never);
    fakeStream.pipe = ((dest: NodeJS.WritableStream) => {
      process.nextTick(() => fakeStream.emit("error", new Error("transfer failed")));
      return dest;
    }) as typeof fakeStream.pipe;

    const res = await request(app).get(`/api/download/${id}`);

    expect(res.status).toBe(500);
    expect(fs.existsSync(filePath)).toBe(true);
    createReadStreamSpy.mockRestore();
    fs.unlinkSync(filePath);
  });

  it("leaves the response alone when the transfer errors after headers were already sent", async () => {
    const id = "55555555-5555-5555-5555-555555555555";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp3`);
    fs.writeFileSync(filePath, "fake audio content");
    // A fake read stream whose pipe() writes once (flushing headers) before erroring.
    const fakeStream = new PassThrough();
    const createReadStreamSpy = jest.spyOn(fs, "createReadStream").mockReturnValue(fakeStream as never);
    fakeStream.pipe = ((dest: NodeJS.WritableStream) => {
      dest.write("partial content");
      fakeStream.emit("error", new Error("connection dropped mid-transfer"));
      return dest;
    }) as typeof fakeStream.pipe;

    const res = await request(app).get(`/api/download/${id}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe("partial content");
    expect(fs.existsSync(filePath)).toBe(true);
    createReadStreamSpy.mockRestore();
    fs.unlinkSync(filePath);
  });

  it("streams a non-ASCII title via the RFC 5987 filename* fallback", async () => {
    const id = "66666666-6666-6666-6666-666666666666";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp3`);
    fs.writeFileSync(filePath, "fake audio content");

    const res = await request(app).get(`/api/download/${id}`).query({ name: "Zürich Café" });

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain('filename="Z_rich Caf_.mp3"');
    expect(res.headers["content-disposition"]).toContain("filename*=UTF-8''Z%C3%BCrich%20Caf%C3%A9.mp3");
    await waitFor(() => expect(fs.existsSync(filePath)).toBe(false));
  });

  it("falls back to 'download' as the filename when ?name= is omitted", async () => {
    const id = "22222222-2222-2222-2222-222222222222";
    const filePath = path.join(DOWNLOADS_DIR, `${id}.mp4`);
    fs.writeFileSync(filePath, "fake video content");

    const res = await request(app).get(`/api/download/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("download.mp4");
    await waitFor(() => expect(fs.existsSync(filePath)).toBe(false));
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

describe("CORS preflight (OPTIONS)", () => {
  it("responds 204 and echoes the requested headers for an allowed origin", async () => {
    const res = await request(app)
      .options("/api/convert")
      .set("Origin", "http://localhost:8081")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:8081");
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-headers"]).toBe("Content-Type");
  });

  it("falls back to Content-Type when no Access-Control-Request-Headers was sent", async () => {
    const res = await request(app).options("/api/convert").set("Origin", "http://localhost:8081");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-headers"]).toBe("Content-Type");
  });

  it("rejects a preflight from a disallowed origin", async () => {
    const res = await request(app).options("/api/convert").set("Origin", "https://evil.example.com");
    expect(res.status).toBe(500);
  });
});

describe("static web build", () => {
  const PUBLIC_DIR = path.join(process.cwd(), "public");

  beforeEach(() => {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    fs.writeFileSync(path.join(PUBLIC_DIR, "index.html"), "<html>shell</html>");
    fs.writeFileSync(path.join(PUBLIC_DIR, "app.js"), "console.log('hi')");
  });

  afterEach(() => {
    fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
  });

  it("serves a known asset with the matching content type", async () => {
    const res = await request(app).get("/app.js");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/javascript");
    expect(res.text).toBe("console.log('hi')");
  });

  it("falls back to application/octet-stream for an unrecognized extension", async () => {
    fs.writeFileSync(path.join(PUBLIC_DIR, "asset.bin"), "raw bytes");
    const res = await request(app).get("/asset.bin");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/octet-stream");
  });

  it("serves index.html for the root path", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("<html>shell</html>");
  });

  it("falls back to index.html for an unknown SPA navigation path", async () => {
    const res = await request(app).get("/settings");
    expect(res.status).toBe(200);
    expect(res.text).toBe("<html>shell</html>");
  });

  it("404s for a missing asset that looks like a file (has an extension)", async () => {
    const res = await request(app).get("/does-not-exist.png");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ errorKey: "errors.notFound" });
  });

  it("does not let /api/* fall through to the static handler", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ errorKey: "errors.notFound" });
  });

  it("closes the connection instead of hanging when a handler throws after sending headers", async () => {
    const createReadStreamSpy = jest.spyOn(fs, "createReadStream").mockImplementationOnce(() => {
      throw new Error("disk read failed after headers were already written");
    });

    const res = await request(app).get("/app.js");

    expect(res.status).toBe(200);
    expect(res.text).toBe("");
    createReadStreamSpy.mockRestore();
  });

  it("can't escape PUBLIC_DIR via an encoded '..' segment", async () => {
    // The URL spec normalizes dot-segments — including percent-encoded %2e%2e — before we ever
    // see `pathname`, so this resolves to plain "/package.json" inside PUBLIC_DIR (which doesn't
    // exist there) rather than escaping to the real server/package.json one level up.
    const res = await request(app).get("/%2e%2e/package.json");
    expect(res.status).toBe(404);
  });
});

afterEach(() => {
  jest.clearAllMocks();
  // Clean up any leftover test files under DOWNLOADS_DIR from a failed assertion.
  if (fs.existsSync(DOWNLOADS_DIR)) {
    for (const f of fs.readdirSync(DOWNLOADS_DIR)) fs.rmSync(path.join(DOWNLOADS_DIR, f), { force: true });
  }
});
