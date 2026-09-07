import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const writeMock = vi.fn();
const onMock = vi.fn();

vi.mock("node:fs", () => ({
  default: {
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(() => ({ write: writeMock, on: onMock })),
  },
}));

import fs from "node:fs";
import { DownloadLogger } from "./downloadLog.js";

beforeEach(() => {
  vi.mocked(fs.readdirSync).mockReturnValue([] as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DownloadLogger", () => {
  it("creates the logs dir and an append-only write stream for the id on construction", () => {
    new DownloadLogger("job-1");
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("logs"), { recursive: true });
    expect(fs.createWriteStream).toHaveBeenCalledWith(expect.stringContaining("job-1.log"), {
      flags: "w",
      encoding: "utf-8",
    });
  });

  it("swallows a stream error instead of letting it propagate", () => {
    new DownloadLogger("job-1");
    const [, errorHandler] = onMock.mock.calls.find(([event]) => event === "error")!;
    expect(() => errorHandler(new Error("disk full"))).not.toThrow();
  });

  it("prunes the oldest log files beyond MAX_LOG_FILES on construction", () => {
    const files = Array.from({ length: 12 }, (_, i) => `old-${i}.log`);
    vi.mocked(fs.readdirSync).mockReturnValue(files as never);
    vi.mocked(fs.statSync).mockImplementation((p) => ({ mtimeMs: Number(String(p).match(/old-(\d+)/)?.[1] ?? 0) }) as never);
    new DownloadLogger("job-1");
    expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
  });

  it("appends a timestamped section header and echoes it to the console", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new DownloadLogger("job-1");
    logger.section("FETCH INFO");
    expect(writeMock).toHaveBeenCalledWith("\n=== FETCH INFO ===\n");
    expect(consoleSpy).toHaveBeenCalledWith("=== FETCH INFO ===");
    consoleSpy.mockRestore();
  });

  it("appends a timestamped line and echoes it to the console", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new DownloadLogger("job-1");
    logger.line("hello");
    const [content] = writeMock.mock.calls.at(-1)!;
    expect(content).toMatch(/^\[.+\] hello\n$/);
    expect(consoleSpy).toHaveBeenCalledWith(content.trim());
    consoleSpy.mockRestore();
  });

  it("logs a command with args quoted only when they need it", () => {
    const logger = new DownloadLogger("job-1");
    logger.command(["-f", "bestaudio/best", "-o", "some file.mp4", "https://example.com"]);
    const [content] = writeMock.mock.calls.at(-1)!;
    expect(content).toContain('command: yt-dlp -f bestaudio/best -o "some file.mp4" https://example.com');
  });

  it("escapes double quotes and backslashes inside a quoted arg", () => {
    const logger = new DownloadLogger("job-1");
    logger.command(['say "hi"']);
    const [content] = writeMock.mock.calls.at(-1)!;
    expect(content).toContain('command: yt-dlp "say \\"hi\\""');
  });
});
