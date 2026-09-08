import { EventEmitter } from "node:events";

const mockLogWrite = jest.fn();

jest.mock("node:child_process", () => ({ spawn: jest.fn() }));
jest.mock("node:fs", () => ({
  __esModule: true,
  default: {
    readdirSync: jest.fn().mockReturnValue([]),
    statSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
    createWriteStream: jest.fn(() => ({ write: mockLogWrite, on: jest.fn() })),
    existsSync: jest.fn().mockReturnValue(false),
  },
}));

import { spawn } from "node:child_process";
import fs from "node:fs";
import { YouTube } from "../../../server/platforms/YouTube.js";

function youtube(url = "https://www.youtube.com/watch?v=x") {
  return new YouTube(url);
}

/** A minimal fake ChildProcess: stdout/stderr are EventEmitters, plus its own "error"/"close" events. */
function createFakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function mockNextSpawn(child: ReturnType<typeof createFakeChild>) {
  jest.mocked(spawn).mockReturnValueOnce(child as never);
}

async function resolveSpawn(child: ReturnType<typeof createFakeChild>, stdout: string, code = 0) {
  if (stdout) child.stdout.emit("data", Buffer.from(stdout));
  child.emit("close", code);
  await Promise.resolve();
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("isRetryableError", () => {
  it("is false for the known-permanent sign-in gate", () => {
    expect(youtube().isRetryableError(new Error("ERROR: Sign in to confirm you're not a bot"))).toBe(false);
  });

  it("is true for any other error", () => {
    expect(youtube().isRetryableError(new Error("HTTP Error 403: Forbidden"))).toBe(true);
  });
});

describe("describeError", () => {
  it("rewrites the sign-in-gate message to the sign-in-required key", () => {
    expect(youtube().describeError(new Error("Sign in to confirm you're not a bot"))).toEqual({
      key: "errors.signInRequired",
    });
  });

  it("matches the sign-in-gate pattern case-insensitively with a curly-apostrophe variant", () => {
    expect(youtube().describeError(new Error("SIGN IN TO CONFIRM YOU’RE NOT A BOT"))).toEqual({
      key: "errors.signInRequired",
    });
  });

  it("passes through a non-matching message as the raw key's param", () => {
    expect(youtube().describeError(new Error("network timeout"))).toEqual({
      key: "errors.raw",
      params: { raw: "network timeout" },
    });
  });

  it("uses the fallback as the raw param when err isn't an Error instance", () => {
    expect(youtube().describeError("boom", "fallback")).toEqual({
      key: "errors.raw",
      params: { raw: "fallback" },
    });
  });
});

describe("defaultThumbnail", () => {
  it("builds the i.ytimg.com hqdefault URL for a video id", () => {
    expect(youtube().defaultThumbnail("abc")).toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
  });

  it("is used by fetchPlaylistInfo when an entry has no thumbnails", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = youtube().fetchPlaylistInfo();
    await resolveSpawn(child, JSON.stringify({ id: "def", title: "Video B" }));
    const info = await promise;
    expect(info.entries[0].thumbnail).toBe("https://i.ytimg.com/vi/def/hqdefault.jpg");
  });
});

/** Joins every line appended to the download log across all DownloadLogger calls made in a test. */
function allLoggedContent(): string {
  return mockLogWrite.mock.calls.map(([content]) => content as string).join("");
}

describe("download", () => {
  it("propagates a non-retryable failure (sign-in gate) immediately without retrying, still writes the log", async () => {
    const infoChild = createFakeChild();
    const downloadChild = createFakeChild();
    mockNextSpawn(infoChild);
    mockNextSpawn(downloadChild);
    const promise = youtube().download("audio", "128", jest.fn());
    await resolveSpawn(infoChild, JSON.stringify({ title: "T" }));
    downloadChild.stderr.emit("data", Buffer.from("ERROR: Sign in to confirm you're not a bot"));
    downloadChild.emit("close", 1);
    await expect(promise).rejects.toThrow("Sign in to confirm you're not a bot");
    expect(spawn).toHaveBeenCalledTimes(2); // info fetch + exactly one download attempt, no retry
    expect(fs.createWriteStream).toHaveBeenCalled(); // the log file is created up front
    expect(allLoggedContent()).toContain("Sign in to confirm you're not a bot");
  });
});
