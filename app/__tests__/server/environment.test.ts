import { EventEmitter } from "node:events";
import { waitFor } from "@testing-library/react-native";

jest.mock("node:child_process", () => ({ spawn: jest.fn() }));
jest.mock("node:fs", () => ({
  __esModule: true,
  default: {
    existsSync: jest.fn(),
  },
}));

import { spawn } from "node:child_process";
import fs from "node:fs";
import {
  updateYtDlp,
  checkEnvironment,
  getYtDlpVersion,
  isFfmpegAvailable,
  startPeriodicYtDlpUpdates,
  UPDATE_RETRY_ATTEMPTS,
} from "../../server/environment.js";

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

/** One retry attempt's pair of fake children: the plain pip form, then its --break-system-packages fallback. */
type FailingAttempt = { plain: ReturnType<typeof createFakeChild>; fallback: ReturnType<typeof createFakeChild> };

/** Queues fake children for `count` of updateYtDlp()'s retry attempts (plain pip form, then the
 * --break-system-packages fallback, per attempt) — shared setup for the "all retries exhausted"
 * tests below, which only differ in how the final attempt fails. */
function queueFailingAttempts(count: number): FailingAttempt[] {
  const attempts = Array.from({ length: count }, () => ({ plain: createFakeChild(), fallback: createFakeChild() }));
  for (const attempt of attempts) {
    mockNextSpawn(attempt.plain);
    mockNextSpawn(attempt.fallback);
  }
  return attempts;
}

/** Fails both pip forms of every attempt but the last, advancing the fake clock past each
 * attempt's backoff delay so updateYtDlp()'s loop reaches the final attempt. */
async function failAllButLastAttempt(attempts: FailingAttempt[]) {
  for (let index = 0; index < attempts.length - 1; index++) {
    const attemptNumber = index + 1;
    const { plain, fallback } = attempts[index];
    await waitFor(() => expect(spawn).toHaveBeenCalledTimes(attemptNumber * 2 - 1));
    plain.emit("close", 1);
    await waitFor(() => expect(spawn).toHaveBeenCalledTimes(attemptNumber * 2));
    fallback.emit("close", 1);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5000 * attemptNumber);
  }
}

beforeEach(() => {
  jest.mocked(fs.existsSync).mockReturnValue(true);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("updateYtDlp", () => {
  it("logs the trimmed output when the plain pip upgrade succeeds", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = updateYtDlp();
    await resolveSpawn(child, "Successfully installed yt-dlp\n");
    await promise;
    expect(logSpy).toHaveBeenCalledWith("Successfully installed yt-dlp");
    expect(spawn).toHaveBeenCalledWith("pip3", ["install", "--user", "--upgrade", "--pre", "yt-dlp"], expect.anything());
  });

  it("retries with --break-system-packages when the plain pip upgrade fails, then logs the fallback's output", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const first = createFakeChild();
    const second = createFakeChild();
    mockNextSpawn(first);
    mockNextSpawn(second);
    const promise = updateYtDlp();
    first.emit("close", 1);
    await waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    await resolveSpawn(second, "Successfully installed yt-dlp\n");
    await promise;
    expect(logSpy).toHaveBeenCalledWith("Successfully installed yt-dlp");
    expect(spawn).toHaveBeenLastCalledWith(
      "pip3",
      ["install", "--user", "--upgrade", "--pre", "--break-system-packages", "yt-dlp"],
      expect.anything()
    );
  });

  it("retries the whole attempt after a backoff delay when both pip forms fail, then succeeds on the next attempt", async () => {
    jest.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      const attempt1Plain = createFakeChild();
      const attempt1Fallback = createFakeChild();
      const attempt2Plain = createFakeChild();
      [attempt1Plain, attempt1Fallback, attempt2Plain].forEach(mockNextSpawn);

      const promise = updateYtDlp();

      attempt1Plain.emit("close", 1);
      await waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
      attempt1Fallback.emit("close", 1);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(5000);

      await waitFor(() => expect(spawn).toHaveBeenCalledTimes(3));
      await resolveSpawn(attempt2Plain, "Successfully installed yt-dlp\n");
      await promise;

      expect(logSpy).toHaveBeenCalledWith("Successfully installed yt-dlp");
    } finally {
      jest.useRealTimers();
    }
  });

  it(`warns with the last attempt's Error message once all ${UPDATE_RETRY_ATTEMPTS} retries are exhausted`, async () => {
    jest.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const attempts = queueFailingAttempts(UPDATE_RETRY_ATTEMPTS);
      const last = attempts[attempts.length - 1];

      const promise = updateYtDlp();
      await failAllButLastAttempt(attempts);

      await waitFor(() => expect(spawn).toHaveBeenCalledTimes(attempts.length * 2 - 1));
      last.plain.emit("close", 1);
      await waitFor(() => expect(spawn).toHaveBeenCalledTimes(attempts.length * 2));
      last.fallback.stderr.emit("data", Buffer.from("network down"));
      last.fallback.emit("close", 1);

      await promise;
      expect(warnSpy).toHaveBeenCalledWith("yt-dlp Selbst-Update fehlgeschlagen:", "network down");
    } finally {
      jest.useRealTimers();
    }
  });

  it("warns with the raw rejection when the final attempt's spawn errors without a proper Error", async () => {
    jest.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const attempts = queueFailingAttempts(UPDATE_RETRY_ATTEMPTS);
      const last = attempts[attempts.length - 1];

      const promise = updateYtDlp();
      await failAllButLastAttempt(attempts);

      await waitFor(() => expect(spawn).toHaveBeenCalledTimes(attempts.length * 2 - 1));
      last.plain.emit("close", 1);
      await waitFor(() => expect(spawn).toHaveBeenCalledTimes(attempts.length * 2));
      last.fallback.emit("error", "spawn failed" as never);

      await promise;
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("startPeriodicYtDlpUpdates", () => {
  it("does not trigger an update before the interval elapses", async () => {
    jest.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
    try {
      startPeriodicYtDlpUpdates();
      await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 - 1);
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("re-runs the pip upgrade once the interval elapses", async () => {
    jest.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
    try {
      startPeriodicYtDlpUpdates();
      const child = createFakeChild();
      mockNextSpawn(child);

      await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);

      expect(spawn).toHaveBeenCalledWith("pip3", ["install", "--user", "--upgrade", "--pre", "yt-dlp"], expect.anything());
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("checkEnvironment", () => {
  it("logs the version, no warnings, when yt-dlp/ffmpeg/PO-token script are all present", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
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
    expect(getYtDlpVersion()).toBe("2026.01.01");
    expect(isFfmpegAvailable()).toBe(true);
  });

  it("warns when the yt-dlp version check fails with an Error", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const versionChild = createFakeChild();
    const ffmpegChild = createFakeChild();
    mockNextSpawn(versionChild);
    mockNextSpawn(ffmpegChild);

    const promise = checkEnvironment();
    versionChild.emit("close", 1);
    await waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    ffmpegChild.emit("close", 0);
    await promise;

    expect(warnSpy).toHaveBeenCalledWith("WARNUNG: yt-dlp nicht erreichbar:", expect.any(String));
  });

  it("warns when the yt-dlp version check fails without a proper Error", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const versionChild = createFakeChild();
    const ffmpegChild = createFakeChild();
    mockNextSpawn(versionChild);
    mockNextSpawn(ffmpegChild);

    const promise = checkEnvironment();
    versionChild.emit("error", "boom" as never);
    await waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    ffmpegChild.emit("close", 0);
    await promise;

    expect(warnSpy).toHaveBeenCalledWith("WARNUNG: yt-dlp nicht erreichbar:", "boom");
  });

  it("warns when ffmpeg is not found (non-zero exit)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const versionChild = createFakeChild();
    const ffmpegChild = createFakeChild();
    mockNextSpawn(versionChild);
    mockNextSpawn(ffmpegChild);

    const promise = checkEnvironment();
    await resolveSpawn(versionChild, "1.0\n");
    ffmpegChild.emit("close", 1);
    await promise;

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ffmpeg wurde nicht gefunden"));
    expect(isFfmpegAvailable()).toBe(false);
  });

  it("warns when ffmpeg spawn itself errors", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
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
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.mocked(fs.existsSync).mockReturnValue(false);
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
