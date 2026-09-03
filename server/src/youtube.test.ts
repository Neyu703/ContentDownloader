import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs", () => ({
  default: {
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
  },
}));

import { spawn } from "node:child_process";
import fs from "node:fs";
import {
  updateYtDlp,
  checkEnvironment,
  getVideoInfo,
  getPlaylistInfo,
  downloadMedia,
  type ProgressUpdate,
} from "./youtube.js";

/** A minimal fake ChildProcess: stdout/stderr are EventEmitters, plus its own "error"/"close" events. */
function createFakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

/** Queues the next spawn() call to return this fake child. */
function mockNextSpawn(child: ReturnType<typeof createFakeChild>) {
  vi.mocked(spawn).mockReturnValueOnce(child as never);
}

/** Runs a fake child to completion: emits stdout, then closes with the given exit code. */
async function resolveSpawn(child: ReturnType<typeof createFakeChild>, stdout: string, code = 0) {
  if (stdout) child.stdout.emit("data", Buffer.from(stdout));
  child.emit("close", code);
  await Promise.resolve();
}

beforeEach(() => {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readdirSync).mockReturnValue([] as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("updateYtDlp", () => {
  it("logs the trimmed output on success", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = updateYtDlp();
    await resolveSpawn(child, "updated\n");
    await promise;
    expect(logSpy).toHaveBeenCalledWith("updated");
  });

  it("warns with the Error message when the update fails with an Error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = updateYtDlp();
    child.stderr.emit("data", Buffer.from("network down"));
    child.emit("close", 1);
    await promise;
    expect(warnSpy).toHaveBeenCalledWith("yt-dlp Selbst-Update fehlgeschlagen:", "network down");
  });

  it("warns with the raw rejection when it is not an Error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = updateYtDlp();
    child.emit("error", "spawn failed" as never);
    await promise;
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("checkEnvironment", () => {
  it("logs the version, no warnings, when yt-dlp/ffmpeg/PO-token script are all present", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const versionChild = createFakeChild();
    const ffmpegChild = createFakeChild();
    mockNextSpawn(versionChild);
    mockNextSpawn(ffmpegChild);

    const promise = checkEnvironment();
    await resolveSpawn(versionChild, "2026.01.01\n");
    ffmpegChild.emit("close", 0);
    await promise;

    expect(logSpy).toHaveBeenCalledWith("yt-dlp Version: 2026.01.01");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when the yt-dlp version check fails with an Error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const versionChild = createFakeChild();
    const ffmpegChild = createFakeChild();
    mockNextSpawn(versionChild);
    mockNextSpawn(ffmpegChild);

    const promise = checkEnvironment();
    versionChild.emit("close", 1);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    ffmpegChild.emit("close", 0);
    await promise;

    expect(warnSpy).toHaveBeenCalledWith("WARNUNG: yt-dlp nicht erreichbar:", expect.any(String));
  });

  it("warns when the yt-dlp version check fails without a proper Error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const versionChild = createFakeChild();
    const ffmpegChild = createFakeChild();
    mockNextSpawn(versionChild);
    mockNextSpawn(ffmpegChild);

    const promise = checkEnvironment();
    versionChild.emit("error", "boom" as never);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    ffmpegChild.emit("close", 0);
    await promise;

    expect(warnSpy).toHaveBeenCalledWith("WARNUNG: yt-dlp nicht erreichbar:", "boom");
  });

  it("warns when ffmpeg is not found (non-zero exit)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const versionChild = createFakeChild();
    const ffmpegChild = createFakeChild();
    mockNextSpawn(versionChild);
    mockNextSpawn(ffmpegChild);

    const promise = checkEnvironment();
    await resolveSpawn(versionChild, "1.0\n");
    ffmpegChild.emit("close", 1);
    await promise;

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ffmpeg wurde nicht gefunden"));
  });

  it("warns when ffmpeg spawn itself errors", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const versionChild = createFakeChild();
    const ffmpegChild = createFakeChild();
    mockNextSpawn(versionChild);
    mockNextSpawn(ffmpegChild);

    const promise = checkEnvironment();
    await resolveSpawn(versionChild, "1.0\n");
    ffmpegChild.emit("error", new Error("enoent"));
    await promise;

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ffmpeg wurde nicht gefunden"));
  });

  it("warns when the PO-token provider script is missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const versionChild = createFakeChild();
    const ffmpegChild = createFakeChild();
    mockNextSpawn(versionChild);
    mockNextSpawn(ffmpegChild);

    const promise = checkEnvironment();
    await resolveSpawn(versionChild, "1.0\n");
    ffmpegChild.emit("close", 0);
    await promise;

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("PO-Token-Skript fehlt"));
  });
});

describe("getVideoInfo", () => {
  it("returns metadata straight through when every field is present", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = getVideoInfo("https://www.youtube.com/watch?v=x");
    await resolveSpawn(child, JSON.stringify({ title: "T", duration: 42, thumbnail: "thumb.jpg", uploader: "U" }));
    await expect(promise).resolves.toEqual({ title: "T", duration: 42, thumbnail: "thumb.jpg", uploader: "U" });
  });

  it("applies every fallback when fields are missing", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = getVideoInfo("https://www.youtube.com/watch?v=x");
    await resolveSpawn(child, JSON.stringify({}));
    await expect(promise).resolves.toEqual({
      title: "Unknown title",
      duration: 0,
      thumbnail: null,
      uploader: null,
    });
  });
});

describe("getPlaylistInfo", () => {
  it("parses playlist_title, playlist_count, and full entry fields from multi-line JSON", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = getPlaylistInfo("https://www.youtube.com/playlist?list=x");
    const lines = [
      JSON.stringify({
        id: "abc",
        playlist_title: "My Playlist",
        playlist_count: 2,
        webpage_url: "https://youtube.com/watch?v=abc",
        title: "Video A",
        thumbnails: [{ url: "small.jpg" }, { url: "large.jpg" }],
        duration: 100,
      }),
      JSON.stringify({ id: "def", title: "Video B" }),
    ].join("\n");
    await resolveSpawn(child, lines);
    const info = await promise;

    expect(info.title).toBe("My Playlist");
    expect(info.totalCount).toBe(2);
    expect(info.entries).toHaveLength(2);
    expect(info.entries[0]).toEqual({
      id: "abc",
      url: "https://youtube.com/watch?v=abc",
      title: "Video A",
      thumbnail: "large.jpg",
      duration: 100,
    });
    // second entry: falls back to url from id, title from id, synthesized thumbnail, null duration
    expect(info.entries[1]).toEqual({
      id: "def",
      url: undefined,
      title: "Video B",
      thumbnail: "https://i.ytimg.com/vi/def/hqdefault.jpg",
      duration: null,
    });
  });

  it("falls back to the legacy playlist field, then to a literal default title", async () => {
    const childA = createFakeChild();
    mockNextSpawn(childA);
    const promiseA = getPlaylistInfo("https://www.youtube.com/playlist?list=x");
    await resolveSpawn(childA, JSON.stringify({ id: "1", playlist: "Legacy Name" }));
    expect((await promiseA).title).toBe("Legacy Name");

    const childB = createFakeChild();
    mockNextSpawn(childB);
    const promiseB = getPlaylistInfo("https://www.youtube.com/playlist?list=x");
    await resolveSpawn(childB, JSON.stringify({ id: "1" }));
    expect((await promiseB).title).toBe("Playlist");
  });

  it("skips blank lines and defaults totalCount to null when playlist_count is missing/non-numeric", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = getPlaylistInfo("https://www.youtube.com/playlist?list=x");
    await resolveSpawn(child, `\n${JSON.stringify({ id: "1", playlist_count: "not a number" })}\n\n`);
    const info = await promise;
    expect(info.entries).toHaveLength(1);
    expect(info.totalCount).toBeNull();
  });

  it("gives no thumbnail when neither thumbnails nor id are present", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = getPlaylistInfo("https://www.youtube.com/playlist?list=x");
    await resolveSpawn(child, JSON.stringify({ title: "No id" }));
    const info = await promise;
    expect(info.entries[0].thumbnail).toBeNull();
  });

  it("sends the requested 1-indexed --playlist-items range, defaulting to the page size", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = getPlaylistInfo("https://www.youtube.com/playlist?list=x");
    await resolveSpawn(child, "");
    await promise;
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    const idx = args.indexOf("--playlist-items");
    expect(args[idx + 1]).toBe("1-50");

    const child2 = createFakeChild();
    mockNextSpawn(child2);
    const promise2 = getPlaylistInfo("https://www.youtube.com/playlist?list=x", 51, 25);
    await resolveSpawn(child2, "");
    await promise2;
    const args2 = vi.mocked(spawn).mock.calls[1][1] as string[];
    expect(args2[args2.indexOf("--playlist-items") + 1]).toBe("51-75");
  });
});

describe("downloadMedia / parseProgressLine / buildFormatArgs (via downloadMedia)", () => {
  function progressUpdates(calls: ProgressUpdate[][]): ProgressUpdate[] {
    return calls.map(([update]) => update);
  }

  it("runs the full audio happy path: correct args, progress sequence, result, and log write", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);

    const onProgress = vi.fn();
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "320", onProgress);
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
    expect(updates[3]).toMatchObject({ stage: "converting", message: "Konvertiere zu MP3…" });

    const downloadArgs = vi.mocked(spawn).mock.calls[1][1] as string[];
    expect(downloadArgs).toEqual(
      expect.arrayContaining(["-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "320K"])
    );
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("runs the video happy path with a height filter and the video converting message", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);

    const onProgress = vi.fn();
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "video", "720", onProgress);
    await resolveSpawn(infoChild, JSON.stringify({ title: "My Video" }));
    downloadChild.stdout.emit("data", Buffer.from("[ffmpeg] merging\n"));
    downloadChild.stdout.emit("data", Buffer.from("[Merger] merged\n"));
    downloadChild.emit("close", 0);

    const result = await promise;
    expect(result.ext).toBe("mp4");

    const updates = progressUpdates(onProgress.mock.calls as ProgressUpdate[][]);
    expect(updates.at(-2)).toMatchObject({ stage: "converting", message: "Verarbeite Video…" });
    expect(updates.at(-1)).toMatchObject({ stage: "converting", message: "Führe Video und Audio zusammen…" });

    const downloadArgs = vi.mocked(spawn).mock.calls[1][1] as string[];
    expect(downloadArgs).toEqual(expect.arrayContaining(["-f", "bestvideo[height<=720]+bestaudio/best[height<=720]/best[height<=720]"]));
  });

  it("uses no height filter for video quality 'best'", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "video", "best", vi.fn());
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.emit("close", 0);
    await promise;
    const downloadArgs = vi.mocked(spawn).mock.calls[1][1] as string[];
    expect(downloadArgs).toEqual(expect.arrayContaining(["-f", "bestvideo+bestaudio/best/best"]));
  });

  it("ignores a line that matches none of the progress patterns", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const onProgress = vi.fn();
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "128", onProgress);
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
    const onProgress = vi.fn();
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "128", onProgress);
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
    const onProgress = vi.fn();
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "128", onProgress);
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
    const onProgress = vi.fn();
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "128", onProgress);
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
    const onProgress = vi.fn();
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "128", onProgress);
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
    const onProgress = vi.fn();
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "128", onProgress);
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.stdout.emit("data", Buffer.from("[download]  1.0% of ~500B\n"));
    downloadChild.emit("close", 0);
    await promise;
    const updates = progressUpdates(onProgress.mock.calls as ProgressUpdate[][]);
    const update = updates.find((u) => u.stage === "downloading" && u.progress === 1)!;
    expect(update.totalMB).toBeCloseTo(500);
  });

  it("propagates a non-retryable failure (sign-in gate) immediately without retrying, still writes the log", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "128", vi.fn());
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.stderr.emit("data", Buffer.from("ERROR: Sign in to confirm you're not a bot"));
    downloadChild.emit("close", 1);
    await expect(promise).rejects.toThrow("Sign in to confirm you're not a bot");
    expect(spawn).toHaveBeenCalledTimes(2); // info fetch + exactly one download attempt, no retry
    expect(fs.writeFileSync).toHaveBeenCalled();
    const written = vi.mocked(fs.writeFileSync).mock.calls.at(-1)![1] as string;
    expect(written).toContain("ERROR: ERROR: Sign in to confirm you're not a bot");
  });

  describe("retry on transient failure", () => {
    it("retries once and succeeds on the second attempt, emitting a retry progress message", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout"] });
      try {
        const infoChild = createFakeChild();
        const downloadChild1 = createFakeChild();
        const downloadChild2 = createFakeChild();
        mockNextSpawn(infoChild);
        mockNextSpawn(downloadChild1);
        mockNextSpawn(downloadChild2);

        const onProgress = vi.fn();
        const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "320", onProgress);
        await resolveSpawn(infoChild, JSON.stringify({ title: "My Song" }));

        downloadChild1.stderr.emit("data", Buffer.from("HTTP Error 403: Forbidden"));
        downloadChild1.emit("close", 1);
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(2000);

        await resolveSpawn(downloadChild2, "");
        const result = await promise;

        expect(result.title).toBe("My Song");
        expect(onProgress).toHaveBeenCalledWith(
          expect.objectContaining({ stage: "downloading", message: "Erneuter Versuch (2/3)…", progress: null })
        );
        expect(spawn).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it("exhausts all attempts on repeated transient failures and rejects with the last error", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout"] });
      try {
        const infoChild = createFakeChild();
        const downloadChildren = [createFakeChild(), createFakeChild(), createFakeChild()];
        mockNextSpawn(infoChild);
        downloadChildren.forEach(mockNextSpawn);

        const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "320", vi.fn());
        await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));

        for (const [index, child] of downloadChildren.entries()) {
          child.stderr.emit("data", Buffer.from("HTTP Error 403: Forbidden"));
          child.emit("close", 1);
          if (index < downloadChildren.length - 1) {
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(2000);
          }
        }

        await expect(promise).rejects.toThrow("HTTP Error 403: Forbidden");
        expect(spawn).toHaveBeenCalledTimes(1 + downloadChildren.length);
        const written = vi.mocked(fs.writeFileSync).mock.calls.at(-1)![1] as string;
        expect(written).toContain("attempt 1/3 failed");
        expect(written).toContain("attempt 2/3 failed");
        expect(written).toContain("ERROR: HTTP Error 403: Forbidden");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("evicts the oldest log files beyond MAX_LOG_FILES", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const files = Array.from({ length: 12 }, (_, i) => `old-${i}.log`);
    vi.mocked(fs.readdirSync).mockReturnValue(files as never);
    vi.mocked(fs.statSync).mockImplementation(
      (p) => ({ mtimeMs: Number(String(p).match(/old-(\d+)/)?.[1] ?? 0) }) as never
    );
    const promise = downloadMedia("https://www.youtube.com/watch?v=x", "audio", "128", vi.fn());
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.emit("close", 0);
    await promise;
    // 10 kept (MAX_LOG_FILES), 2 oldest (lowest mtime = old-0, old-1) evicted.
    expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
  });
});
