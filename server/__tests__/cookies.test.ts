import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
    unlinkSync: vi.fn(),
    statSync: vi.fn(),
  },
}));

import fs from "node:fs";
import { cookiesArgs, COOKIES_FILE, deleteCookies, getCookiesStatus, saveCookies } from "../src/cookies.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveCookies", () => {
  it("creates the containing directory and writes the cookies file", () => {
    saveCookies("# Netscape HTTP Cookie File\n");
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("data"), { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(COOKIES_FILE, "# Netscape HTTP Cookie File\n", {
      encoding: "utf-8",
      mode: 0o600,
    });
  });

  it("locks the file to owner-only read/write, even when overwriting an existing file", () => {
    saveCookies("# Netscape HTTP Cookie File\n");
    expect(fs.chmodSync).toHaveBeenCalledWith(COOKIES_FILE, 0o600);
  });
});

describe("deleteCookies", () => {
  it("removes the cookies file when it exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    deleteCookies();
    expect(fs.unlinkSync).toHaveBeenCalledWith(COOKIES_FILE);
  });

  it("does nothing when no cookies file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    deleteCookies();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});

describe("getCookiesStatus", () => {
  it("reports absence when no cookies file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getCookiesStatus()).toEqual({ present: false, updatedAt: null });
  });

  it("reports presence and last-modified time when a cookies file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const mtime = new Date("2026-09-07T12:00:00.000Z");
    vi.mocked(fs.statSync).mockReturnValue({ mtime } as never);
    expect(getCookiesStatus()).toEqual({ present: true, updatedAt: mtime.toISOString() });
  });
});

describe("cookiesArgs", () => {
  it("returns an empty array when no cookies file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(cookiesArgs()).toEqual([]);
  });

  it("returns the --cookies flag when a cookies file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(cookiesArgs()).toEqual(["--cookies", COOKIES_FILE]);
  });
});
