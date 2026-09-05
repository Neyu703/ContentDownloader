import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

import { spawn } from "node:child_process";
import fs from "node:fs";
import { updateYtDlp, checkEnvironment } from "./environment.js";

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
