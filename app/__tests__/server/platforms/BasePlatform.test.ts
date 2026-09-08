import { EventEmitter } from "node:events";

const mockLogWrite = jest.fn();

jest.mock("node:child_process", () => ({ spawn: jest.fn() }));
jest.mock("node:fs", () => ({
  __esModule: true,
  default: {
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
    createWriteStream: jest.fn(() => ({ write: mockLogWrite, on: jest.fn() })),
    existsSync: jest.fn(),
  },
}));

import { spawn } from "node:child_process";
import fs from "node:fs";
import { COOKIES_FILE } from "../../../server/cookies.js";
import * as environment from "../../../server/environment.js";
import type { ProgressUpdate } from "../../../server/progress.js";
import { TikTok } from "../../../server/platforms/TikTok.js";

/**
 * BasePlatform's behavior is generic across every non-playlist platform — exercised here through
 * TikTok (a plain BasePlatform subclass with no overrides) to prove that it really is generic and
 * not accidentally YouTube-specific.
 */
function tiktok(url = "https://www.tiktok.com/@someuser/video/123") {
  return new TikTok(url);
}

/** A minimal fake ChildProcess: stdout/stderr are EventEmitters, plus its own "error"/"close" events. */
function createFakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

/** Queues the next spawn() call to return this fake child. */
function mockNextSpawn(child: ReturnType<typeof createFakeChild>) {
  jest.mocked(spawn).mockReturnValueOnce(child as never);
}

/** Runs a fake child to completion: emits stdout, then closes with the given exit code. */
async function resolveSpawn(child: ReturnType<typeof createFakeChild>, stdout: string, code = 0) {
  if (stdout) child.stdout.emit("data", Buffer.from(stdout));
  child.emit("close", code);
  await Promise.resolve();
}

/** Joins every line appended to the download log across all DownloadLogger calls made in a test. */
function allLoggedContent(): string {
  return mockLogWrite.mock.calls.map(([content]) => content as string).join("");
}

beforeEach(() => {
  jest.mocked(fs.existsSync).mockReturnValue(true);
  jest.mocked(fs.readdirSync).mockReturnValue([] as never);
  jest.mocked(fs.statSync).mockReturnValue({ size: 1024 * 1024, mtimeMs: 0 } as never);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("checkAvailability", () => {
  it("does not throw for a plain https URL", () => {
    expect(() => tiktok("https://www.tiktok.com/@u/video/1").checkAvailability()).not.toThrow();
  });

  it("throws for a non-http(s) protocol", () => {
    expect(() => tiktok("ftp://www.tiktok.com/@u/video/1").checkAvailability()).toThrow("Unsupported URL scheme: ftp:");
  });
});

describe("fetchInfo", () => {
  it("returns metadata straight through when every field is present", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = tiktok().fetchInfo();
    await resolveSpawn(
      child,
      JSON.stringify({
        title: "T",
        duration: 42,
        thumbnail: "thumb.jpg",
        uploader: "U",
        upload_date: "20260115",
        id: "abc",
      })
    );
    await expect(promise).resolves.toEqual({
      title: "T",
      duration: 42,
      thumbnail: "thumb.jpg",
      uploader: "U",
      uploadDate: "20260115",
      videoId: "abc",
    });
  });

  it("applies every fallback when fields are missing", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = tiktok().fetchInfo();
    await resolveSpawn(child, JSON.stringify({}));
    await expect(promise).resolves.toEqual({
      title: "Unknown title",
      duration: 0,
      thumbnail: null,
      uploader: null,
      uploadDate: null,
      videoId: null,
    });
  });

  it("falls back to the caption when yt-dlp's title is a low-quality Instagram placeholder", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = tiktok().fetchInfo();
    await resolveSpawn(
      child,
      JSON.stringify({ title: "Video by dubisthalle", description: "My trip to the mountains", uploader: "dubisthalle" })
    );
    const info = await promise;
    expect(info.title).toBe("My trip to the mountains");
  });
});

describe("download / parseProgressLine / buildFormatArgs (via download)", () => {
  function progressUpdates(calls: ProgressUpdate[][]): ProgressUpdate[] {
    return calls.map(([update]) => update);
  }

  it("runs the full audio happy path: correct args, progress sequence, result, and log write", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);

    const onProgress = jest.fn();
    const promise = tiktok().download("audio", "320", onProgress);
    await resolveSpawn(infoChild, JSON.stringify({ title: "My Song" }));

    // Feed a download-progress line, then extraction, in two chunks to exercise line buffering.
    downloadChild.stdout.emit("data", Buffer.from("[download]  50.0% of ~10.00MiB at 1.00MiB/s ETA 00:05\n[ExtractAu"));
    downloadChild.stdout.emit("data", Buffer.from("dio] destination\n"));
    downloadChild.emit("close", 0);

    const result = await promise;
    expect(result).toEqual({
      id: expect.any(String),
      filePath: expect.stringContaining(`.mp3`),
      title: "My Song",
      ext: "mp3",
    });

    const updates = progressUpdates(onProgress.mock.calls as ProgressUpdate[][]);
    expect(updates[0]).toMatchObject({ stage: "fetching_info" });
    expect(updates[1]).toMatchObject({ stage: "downloading", progress: 0 });
    expect(updates[2]).toMatchObject({ stage: "downloading", progress: 50 });
    expect(updates[3]).toMatchObject({ stage: "converting", messageKey: "job.convertingAudio" });

    const downloadArgs = jest.mocked(spawn).mock.calls[1][1] as string[];
    expect(downloadArgs).toEqual(
      expect.arrayContaining(["-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "320K"])
    );
    expect(fs.createWriteStream).toHaveBeenCalled();
  });

  it("includes the --cookies flag in both info and download args when a cookies file is stored", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);

    const promise = tiktok().download("audio", "320", jest.fn());
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.emit("close", 0);
    await promise;

    const infoArgs = jest.mocked(spawn).mock.calls[0][1] as string[];
    const downloadArgs = jest.mocked(spawn).mock.calls[1][1] as string[];
    expect(infoArgs).toEqual(expect.arrayContaining(["--cookies", COOKIES_FILE]));
    expect(downloadArgs).toEqual(expect.arrayContaining(["--cookies", COOKIES_FILE]));
  });

  it("runs the video happy path with a height filter and the video converting message", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);

    const onProgress = jest.fn();
    const promise = tiktok().download("video", "720", onProgress);
    await resolveSpawn(infoChild, JSON.stringify({ title: "My Video" }));
    downloadChild.stdout.emit("data", Buffer.from("[ffmpeg] merging\n"));
    downloadChild.stdout.emit("data", Buffer.from("[Merger] merged\n"));
    downloadChild.emit("close", 0);

    const result = await promise;
    expect(result.ext).toBe("mp4");

    const updates = progressUpdates(onProgress.mock.calls as ProgressUpdate[][]);
    expect(updates.at(-2)).toMatchObject({ stage: "converting", messageKey: "job.convertingVideo" });
    expect(updates.at(-1)).toMatchObject({ stage: "converting", messageKey: "job.merging" });

    const downloadArgs = jest.mocked(spawn).mock.calls[1][1] as string[];
    expect(downloadArgs).toEqual(expect.arrayContaining(["-f", "bestvideo[height<=720]+bestaudio/best[height<=720]/best[height<=720]"]));
  });

  it("uses no height filter for video quality 'best'", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const promise = tiktok().download("video", "best", jest.fn());
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.emit("close", 0);
    await promise;
    const downloadArgs = jest.mocked(spawn).mock.calls[1][1] as string[];
    expect(downloadArgs).toEqual(expect.arrayContaining(["-f", "bestvideo+bestaudio/best/best"]));
  });

  it("ignores a line that matches none of the progress patterns", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const onProgress = jest.fn();
    const promise = tiktok().download("audio", "128", onProgress);
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    onProgress.mockClear();
    downloadChild.stdout.emit("data", Buffer.from("some unrelated yt-dlp line\n"));
    downloadChild.emit("close", 0);
    await promise;
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("parses speed/eta 'Unknown' sentinels and unparseable size as undefined, and handles K/G units", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const onProgress = jest.fn();
    const promise = tiktok().download("audio", "128", onProgress);
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.stdout.emit(
      "data",
      Buffer.from("[download]  10.0% of ~2.00GiB at Unknown speed ETA Unknown\n")
    );
    downloadChild.emit("close", 0);
    await promise;
    const updates = progressUpdates(onProgress.mock.calls as ProgressUpdate[][]);
    const progressUpdate = updates.find((u) => u.stage === "downloading" && u.progress === 10)!;
    expect(progressUpdate.speedMBs).toBeUndefined();
    expect(progressUpdate.eta).toBeUndefined();
    expect(progressUpdate.totalMB).toBeCloseTo(2048);
  });

  it("leaves totalMB/downloadedMB undefined when the size portion doesn't parse as a byte size", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const onProgress = jest.fn();
    const promise = tiktok().download("audio", "128", onProgress);
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.stdout.emit("data", Buffer.from("[download]  20.0% of ~10.00Xyz\n"));
    downloadChild.emit("close", 0);
    await promise;
    const updates = progressUpdates(onProgress.mock.calls as ProgressUpdate[][]);
    const update = updates.find((u) => u.stage === "downloading" && u.progress === 20)!;
    expect(update.totalMB).toBeUndefined();
    expect(update.downloadedMB).toBeUndefined();
  });

  it("leaves eta undefined when the ETA portion is absent entirely (not just 'Unknown')", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const onProgress = jest.fn();
    const promise = tiktok().download("audio", "128", onProgress);
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.stdout.emit("data", Buffer.from("[download]  75.0% of ~5.00MiB at 2.00MiB/s\n"));
    downloadChild.emit("close", 0);
    await promise;
    const updates = progressUpdates(onProgress.mock.calls as ProgressUpdate[][]);
    const update = updates.find((u) => u.stage === "downloading" && u.progress === 75)!;
    expect(update.eta).toBeUndefined();
  });

  it("converts a KiB total size down to MB (parseSizeToMB's K-unit branch)", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const onProgress = jest.fn();
    const promise = tiktok().download("audio", "128", onProgress);
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.stdout.emit("data", Buffer.from("[download]  5.0% of ~1024.00KiB\n"));
    downloadChild.emit("close", 0);
    await promise;
    const updates = progressUpdates(onProgress.mock.calls as ProgressUpdate[][]);
    const update = updates.find((u) => u.stage === "downloading" && u.progress === 5)!;
    expect(update.totalMB).toBeCloseTo(1);
  });

  it("treats a bare-byte size (no K/M/G unit letter) as the unitless multiplier-1 case", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const onProgress = jest.fn();
    const promise = tiktok().download("audio", "128", onProgress);
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.stdout.emit("data", Buffer.from("[download]  1.0% of ~500B\n"));
    downloadChild.emit("close", 0);
    await promise;
    const updates = progressUpdates(onProgress.mock.calls as ProgressUpdate[][]);
    const update = updates.find((u) => u.stage === "downloading" && u.progress === 1)!;
    expect(update.totalMB).toBeCloseTo(500);
  });

  describe("retry on transient failure", () => {
    it("retries once and succeeds on the second attempt, emitting a retry progress message", async () => {
      jest.useFakeTimers({ toFake: ["setTimeout"] });
      try {
        const infoChild = createFakeChild();
        const downloadChild1 = createFakeChild();
        const downloadChild2 = createFakeChild();
        mockNextSpawn(infoChild);
        mockNextSpawn(downloadChild1);
        mockNextSpawn(downloadChild2);

        const onProgress = jest.fn();
        const promise = tiktok().download("audio", "320", onProgress);
        await resolveSpawn(infoChild, JSON.stringify({ title: "My Song" }));

        downloadChild1.stderr.emit("data", Buffer.from("HTTP Error 403: Forbidden"));
        downloadChild1.emit("close", 1);
        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(2000);

        await resolveSpawn(downloadChild2, "");
        const result = await promise;

        expect(result.title).toBe("My Song");
        expect(onProgress).toHaveBeenCalledWith(
          expect.objectContaining({
            stage: "downloading",
            messageKey: "job.retrying",
            messageParams: { attempt: 2, maxAttempts: 3 },
            progress: null,
          })
        );
        expect(spawn).toHaveBeenCalledTimes(3);
      } finally {
        jest.useRealTimers();
      }
    });

    it("exhausts all attempts on repeated transient failures and rejects with the last error", async () => {
      jest.useFakeTimers({ toFake: ["setTimeout"] });
      try {
        const infoChild = createFakeChild();
        const downloadChildren = [createFakeChild(), createFakeChild(), createFakeChild()];
        mockNextSpawn(infoChild);
        downloadChildren.forEach(mockNextSpawn);

        const promise = tiktok().download("audio", "320", jest.fn());
        await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));

        for (const [index, child] of downloadChildren.entries()) {
          child.stderr.emit("data", Buffer.from("HTTP Error 403: Forbidden"));
          child.emit("close", 1);
          if (index < downloadChildren.length - 1) {
            await Promise.resolve();
            await jest.advanceTimersByTimeAsync(2000);
          }
        }

        await expect(promise).rejects.toThrow("HTTP Error 403: Forbidden");
        expect(spawn).toHaveBeenCalledTimes(1 + downloadChildren.length);
        const written = allLoggedContent();
        expect(written).toContain("attempt 1/3 failed");
        expect(written).toContain("attempt 2/3 failed");
        expect(written).toContain("FAILED after");
        expect(written).toContain("HTTP Error 403: Forbidden");
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it("logs a known yt-dlp version and ffmpeg availability when present", async () => {
    jest.spyOn(environment, "getYtDlpVersion").mockReturnValue("2026.01.01");
    jest.spyOn(environment, "isFfmpegAvailable").mockReturnValue(true);
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const promise = tiktok().download("audio", "128", jest.fn());
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.emit("close", 0);
    await promise;
    expect(allLoggedContent()).toContain("yt-dlp=2026.01.01 ffmpeg=available");
    jest.restoreAllMocks();
  });

  it("logs the result as unknown size when the finished file doesn't exist on disk", async () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const promise = tiktok().download("audio", "128", jest.fn());
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.emit("close", 0);
    await promise;
    expect(allLoggedContent()).toContain("size=unknown");
  });

  it("logs the result as unknown size when statting the finished file throws", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    jest.mocked(fs.statSync).mockImplementation(() => {
      throw new Error("EPERM");
    });
    const promise = tiktok().download("audio", "128", jest.fn());
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.emit("close", 0);
    await promise;
    expect(allLoggedContent()).toContain("size=unknown");
  });

  it("evicts the oldest log files beyond MAX_LOG_FILES", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const files = Array.from({ length: 12 }, (_, i) => `old-${i}.log`);
    jest.mocked(fs.readdirSync).mockReturnValue(files as never);
    jest.mocked(fs.statSync).mockImplementation(
      (p) => ({ mtimeMs: Number(String(p).match(/old-(\d+)/)?.[1] ?? 0) }) as never
    );
    const promise = tiktok().download("audio", "128", jest.fn());
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.emit("close", 0);
    await promise;
    // 10 kept (MAX_LOG_FILES), 2 oldest (lowest mtime = old-0, old-1) evicted.
    expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
  });
});
