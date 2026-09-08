import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import * as cookies from "../../src/cookies.js";
import { SoundCloud } from "../../src/platforms/SoundCloud.js";

/**
 * PlaylistCapableBasePlatform's playlist listing is generic across every platform that supports
 * it — exercised here through SoundCloud (no overrides) to prove that it really is generic. The
 * `i.ytimg.com` fallback thumbnail is YouTube-specific and tested separately in YouTube.test.ts;
 * here, a missing thumbnail defaults to null (BasePlatform.defaultThumbnail()'s default).
 */
function soundcloud(url = "https://soundcloud.com/someartist/sometrack") {
  return new SoundCloud(url);
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
  vi.mocked(spawn).mockReturnValueOnce(child as never);
}

/** Runs a fake child to completion: emits stdout, then closes with the given exit code. */
async function resolveSpawn(child: ReturnType<typeof createFakeChild>, stdout: string, code = 0) {
  if (stdout) child.stdout.emit("data", Buffer.from(stdout));
  child.emit("close", code);
  await Promise.resolve();
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchPlaylistInfo", () => {
  it("parses playlist_title, playlist_count, and full entry fields from multi-line JSON", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = soundcloud().fetchPlaylistInfo();
    const lines = [
      JSON.stringify({
        id: "abc",
        playlist_title: "My Playlist",
        playlist_count: 2,
        webpage_url: "https://soundcloud.com/someartist/sometrack",
        title: "Track A",
        thumbnails: [{ url: "small.jpg" }, { url: "large.jpg" }],
        duration: 100,
      }),
      JSON.stringify({ id: "def", title: "Track B" }),
    ].join("\n");
    await resolveSpawn(child, lines);
    const info = await promise;

    expect(info.title).toBe("My Playlist");
    expect(info.totalCount).toBe(2);
    expect(info.entries).toHaveLength(2);
    expect(info.entries[0]).toEqual({
      id: "abc",
      url: "https://soundcloud.com/someartist/sometrack",
      title: "Track A",
      thumbnail: "large.jpg",
      duration: 100,
    });
    // second entry has no thumbnails at all: falls back to defaultThumbnail(), which is null generically.
    expect(info.entries[1]).toEqual({
      id: "def",
      url: undefined,
      title: "Track B",
      thumbnail: null,
      duration: null,
    });
  });

  it("falls back to the legacy playlist field, then to a literal default title", async () => {
    const childA = createFakeChild();
    mockNextSpawn(childA);
    const promiseA = soundcloud().fetchPlaylistInfo();
    await resolveSpawn(childA, JSON.stringify({ id: "1", playlist: "Legacy Name" }));
    expect((await promiseA).title).toBe("Legacy Name");

    const childB = createFakeChild();
    mockNextSpawn(childB);
    const promiseB = soundcloud().fetchPlaylistInfo();
    await resolveSpawn(childB, JSON.stringify({ id: "1" }));
    expect((await promiseB).title).toBe("Playlist");
  });

  it("skips blank lines and defaults totalCount to null when playlist_count is missing/non-numeric", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = soundcloud().fetchPlaylistInfo();
    await resolveSpawn(child, `\n${JSON.stringify({ id: "1", playlist_count: "not a number" })}\n\n`);
    const info = await promise;
    expect(info.entries).toHaveLength(1);
    expect(info.totalCount).toBeNull();
  });

  it("gives no thumbnail when neither thumbnails nor id are present", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = soundcloud().fetchPlaylistInfo();
    await resolveSpawn(child, JSON.stringify({ title: "No id" }));
    const info = await promise;
    expect(info.entries[0].thumbnail).toBeNull();
  });

  it("includes the --cookies flag when a cookies file is stored", async () => {
    const cookiesArgsSpy = vi.spyOn(cookies, "cookiesArgs").mockReturnValue(["--cookies", "/data/cookies.txt"]);
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = soundcloud().fetchPlaylistInfo();
    await resolveSpawn(child, "");
    await promise;
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args).toEqual(expect.arrayContaining(["--cookies", "/data/cookies.txt"]));
    cookiesArgsSpy.mockRestore();
  });

  it("sends the requested 1-indexed --playlist-items range, defaulting to the page size", async () => {
    const child = createFakeChild();
    mockNextSpawn(child);
    const promise = soundcloud().fetchPlaylistInfo();
    await resolveSpawn(child, "");
    await promise;
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    const idx = args.indexOf("--playlist-items");
    expect(args[idx + 1]).toBe("1-50");

    const child2 = createFakeChild();
    mockNextSpawn(child2);
    const promise2 = soundcloud().fetchPlaylistInfo(51, 25);
    await resolveSpawn(child2, "");
    await promise2;
    const args2 = vi.mocked(spawn).mock.calls[1][1] as string[];
    expect(args2[args2.indexOf("--playlist-items") + 1]).toBe("51-75");
  });
});
