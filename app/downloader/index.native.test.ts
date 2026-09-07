import { AppState } from "react-native";
import type { NativeJob, NativeState } from "../modules/ytdlp";
import { createNativeYtdlpMock } from "../__mocks__/nativeYtdlp";
import type { JobState } from "./types";
import { freshDownloaderFrom } from "./testUtils";

const mockYtdlp = createNativeYtdlpMock();
jest.mock("../modules/ytdlp", () => ({
  __esModule: true,
  default: mockYtdlp,
}));

function freshDownloader() {
  return freshDownloaderFrom("./index.native");
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function nativeJob(overrides: Partial<NativeJob> = {}): NativeJob {
  return {
    id: "job-1",
    url: "https://youtu.be/x",
    format: "audio",
    quality: "320",
    groupId: null,
    groupTitle: null,
    phase: "queued",
    title: null,
    thumbnail: null,
    progress: null,
    etaSeconds: null,
    lastLine: "",
    lastLineKey: null,
    lastLineParams: null,
    filePath: null,
    ext: null,
    error: null,
    errorParams: null,
    createdAt: 0,
    startedAt: null,
    finishedAt: null,
    updatedAt: 0,
    ...overrides,
  };
}

function jobState(overrides: Partial<JobState> = {}): JobState {
  return {
    id: "j1",
    url: "u",
    format: "audio",
    quality: "320",
    phase: "done",
    title: null,
    progress: null,
    etaSeconds: null,
    lastLine: "",
    result: "/cache/My Video.mp3",
    ext: "mp3",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ensureInitialized (via subscribe/enqueue)", () => {
  it("calls Ytdlp.initialize and requestNotificationPermission only once across multiple triggers", async () => {
    const downloader = freshDownloader();
    const unsubscribe = downloader.subscribe(jest.fn());
    await downloader.enqueue({ url: "u", format: "audio", quality: "320" });
    await flushPromises();

    expect(mockYtdlp.initialize).toHaveBeenCalledTimes(1);
    expect(mockYtdlp.requestNotificationPermission).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("subscribe swallows an initialize() rejection instead of crashing", async () => {
    mockYtdlp.initialize.mockRejectedValueOnce(new Error("boom"));
    const downloader = freshDownloader();
    expect(() => downloader.subscribe(jest.fn())).not.toThrow();
    await flushPromises();
  });

  it("swallows a requestNotificationPermission() rejection instead of crashing", async () => {
    mockYtdlp.requestNotificationPermission.mockRejectedValueOnce(new Error("denied"));
    const downloader = freshDownloader();
    expect(() => downloader.subscribe(jest.fn())).not.toThrow();
    await flushPromises();
  });
});

describe("subscribe", () => {
  it("pushes the current mapped state immediately", async () => {
    mockYtdlp.getState.mockResolvedValueOnce({
      setup: { phase: "ready", message: "up to date", messageParams: null, ytdlpVersion: "1.2.3" },
      jobs: [nativeJob({ id: "a" })],
    });
    const downloader = freshDownloader();
    const listener = jest.fn();
    downloader.subscribe(listener);
    await flushPromises();

    expect(listener).toHaveBeenCalledWith(
      [
        {
          id: "a",
          url: "https://youtu.be/x",
          format: "audio",
          quality: "320",
          phase: "queued",
          title: null,
          thumbnail: null,
          progress: null,
          etaSeconds: null,
          lastLine: "",
          result: null,
          ext: null,
          createdAt: 0,
          updatedAt: 0,
          groupId: null,
          groupTitle: null,
        },
      ],
      { phase: "ready", message: "up to date" }
    );
  });

  it("re-pushes mapped state on every onStateChange event", async () => {
    const downloader = freshDownloader();
    const listener = jest.fn();
    downloader.subscribe(listener);
    await flushPromises();
    listener.mockClear();

    const handler = mockYtdlp.addListener.mock.calls[0][1] as (state: NativeState) => void;
    handler({
      setup: { phase: "ready", message: "", messageParams: null, ytdlpVersion: null },
      jobs: [nativeJob({ id: "b" })],
    });

    expect(listener).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "b" })],
      { phase: "ready", message: "" }
    );
  });

  it("re-syncs state when the app becomes active, but not on other AppState changes", async () => {
    const downloader = freshDownloader();
    const listener = jest.fn();
    downloader.subscribe(listener);
    await flushPromises();
    const callsSoFar = mockYtdlp.getState.mock.calls.length;

    const appStateHandler = (AppState.addEventListener as jest.Mock).mock.calls[0][1] as (
      status: string
    ) => void;

    appStateHandler("background");
    expect(mockYtdlp.getState).toHaveBeenCalledTimes(callsSoFar);

    appStateHandler("active");
    await flushPromises();
    expect(mockYtdlp.getState).toHaveBeenCalledTimes(callsSoFar + 1);
  });

  it("removes both the native listener and the AppState listener on unsubscribe", async () => {
    const removeNative = jest.fn();
    const removeAppState = jest.fn();
    mockYtdlp.addListener.mockReturnValueOnce({ remove: removeNative });
    (AppState.addEventListener as jest.Mock).mockReturnValueOnce({ remove: removeAppState });

    const downloader = freshDownloader();
    const unsubscribe = downloader.subscribe(jest.fn());
    await flushPromises();
    unsubscribe();

    expect(removeNative).toHaveBeenCalledTimes(1);
    expect(removeAppState).toHaveBeenCalledTimes(1);
  });

  it("ignores the initial getState() result if unsubscribed before it resolves (race guard)", async () => {
    let resolveGetState!: (value: NativeState) => void;
    mockYtdlp.getState.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGetState = resolve;
      })
    );
    const downloader = freshDownloader();
    const listener = jest.fn();
    const unsubscribe = downloader.subscribe(listener);
    unsubscribe();
    resolveGetState({ setup: { phase: "ready", message: "", messageParams: null, ytdlpVersion: null }, jobs: [] });
    await flushPromises();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("enqueue", () => {
  it("initializes then forwards the request, defaulting missing group fields to null", async () => {
    const downloader = freshDownloader();
    const id = await downloader.enqueue({ url: "u", format: "video", quality: "1080" });

    expect(mockYtdlp.initialize).toHaveBeenCalledTimes(1);
    expect(mockYtdlp.enqueue).toHaveBeenCalledWith("u", "video", "1080", null, null);
    expect(id).toBe("native-job-id");
  });

  it("forwards groupId/groupTitle when provided", async () => {
    const downloader = freshDownloader();
    await downloader.enqueue({
      url: "u",
      format: "audio",
      quality: "320",
      groupId: "g1",
      groupTitle: "Playlist",
    });

    expect(mockYtdlp.enqueue).toHaveBeenCalledWith("u", "audio", "320", "g1", "Playlist");
  });
});

describe("getPlaylistInfo", () => {
  it("initializes then forwards to the native module", async () => {
    const downloader = freshDownloader();
    await downloader.getPlaylistInfo("u", 5);

    expect(mockYtdlp.initialize).toHaveBeenCalledTimes(1);
    expect(mockYtdlp.getPlaylistInfo).toHaveBeenCalledWith("u", 5);
  });
});

describe("cancel", () => {
  it("fires Ytdlp.cancel and returns immediately without throwing", () => {
    const downloader = freshDownloader();
    expect(() => downloader.cancel("job-1")).not.toThrow();
    expect(mockYtdlp.cancel).toHaveBeenCalledWith("job-1");
  });

  it("swallows a rejection from Ytdlp.cancel", async () => {
    mockYtdlp.cancel.mockRejectedValueOnce(new Error("nope"));
    const downloader = freshDownloader();
    expect(() => downloader.cancel("job-1")).not.toThrow();
    await flushPromises();
  });
});

describe("removeJob", () => {
  it("fires Ytdlp.removeIfFinished and returns immediately without throwing", () => {
    const downloader = freshDownloader();
    expect(() => downloader.removeJob("job-1")).not.toThrow();
    expect(mockYtdlp.removeIfFinished).toHaveBeenCalledWith("job-1");
  });

  it("swallows a rejection from Ytdlp.removeIfFinished", async () => {
    mockYtdlp.removeIfFinished.mockRejectedValueOnce(new Error("nope"));
    const downloader = freshDownloader();
    expect(() => downloader.removeJob("job-1")).not.toThrow();
    await flushPromises();
  });
});

describe("clearFinished", () => {
  it("fires Ytdlp.clearFinished and returns immediately without throwing", () => {
    const downloader = freshDownloader();
    expect(() => downloader.clearFinished()).not.toThrow();
    expect(mockYtdlp.clearFinished).toHaveBeenCalled();
  });

  it("swallows a rejection from Ytdlp.clearFinished", async () => {
    mockYtdlp.clearFinished.mockRejectedValueOnce(new Error("nope"));
    const downloader = freshDownloader();
    expect(() => downloader.clearFinished()).not.toThrow();
    await flushPromises();
  });
});

describe("getDebugLogFileUri", () => {
  it("prefixes a bare path with file://", async () => {
    mockYtdlp.getDebugLogFile.mockResolvedValueOnce("/cache/log.txt");
    const downloader = freshDownloader();
    await expect(downloader.getDebugLogFileUri!()).resolves.toBe("file:///cache/log.txt");
  });

  it("leaves an already-prefixed file:// URI unchanged", async () => {
    mockYtdlp.getDebugLogFile.mockResolvedValueOnce("file:///cache/log.txt");
    const downloader = freshDownloader();
    await expect(downloader.getDebugLogFileUri!()).resolves.toBe("file:///cache/log.txt");
  });
});

describe("saveToDownloads", () => {
  it("no-ops when the job has no result yet", async () => {
    const downloader = freshDownloader();
    await downloader.saveToDownloads!(jobState({ result: null }));
    expect(mockYtdlp.saveToDownloads).not.toHaveBeenCalled();
  });

  it("saves an mp3 job with audio/mpeg mimeType, deriving the filename from the path", async () => {
    const downloader = freshDownloader();
    await downloader.saveToDownloads!(jobState({ result: "/cache/My Video.mp3", ext: "mp3" }));
    expect(mockYtdlp.saveToDownloads).toHaveBeenCalledWith(
      "/cache/My Video.mp3",
      "My Video.mp3",
      "audio/mpeg"
    );
  });

  it("saves an mp4 job with video/mp4 mimeType", async () => {
    const downloader = freshDownloader();
    await downloader.saveToDownloads!(jobState({ result: "/cache/Clip.mp4", ext: "mp4" }));
    expect(mockYtdlp.saveToDownloads).toHaveBeenCalledWith("/cache/Clip.mp4", "Clip.mp4", "video/mp4");
  });

  it("derives the filename from a backslash-separated (Windows-style) path", async () => {
    const downloader = freshDownloader();
    await downloader.saveToDownloads!(jobState({ result: "C:\\cache\\Song.mp3", ext: "mp3" }));
    expect(mockYtdlp.saveToDownloads).toHaveBeenCalledWith(
      "C:\\cache\\Song.mp3",
      "Song.mp3",
      "audio/mpeg"
    );
  });

  it("uses the sanitized override filename (keeping the real extension) when one is given", async () => {
    const downloader = freshDownloader();
    await downloader.saveToDownloads!(jobState({ result: "/cache/My Video.mp3", ext: "mp3" }), "Re/named:Title");
    expect(mockYtdlp.saveToDownloads).toHaveBeenCalledWith(
      "/cache/My Video.mp3",
      "RenamedTitle.mp3",
      "audio/mpeg"
    );
  });
});

describe("pickDownloadsFolder", () => {
  it("returns the picked folder's display name", async () => {
    mockYtdlp.pickDownloadsFolder.mockResolvedValueOnce("MyDownloads");
    const downloader = freshDownloader();
    await expect(downloader.pickDownloadsFolder!()).resolves.toBe("MyDownloads");
  });

  it("returns null when the user cancelled", async () => {
    mockYtdlp.pickDownloadsFolder.mockResolvedValueOnce(null);
    const downloader = freshDownloader();
    await expect(downloader.pickDownloadsFolder!()).resolves.toBeNull();
  });
});

describe("getDownloadsFolderName", () => {
  it("returns the currently picked folder's display name", async () => {
    mockYtdlp.getDownloadsFolderName.mockResolvedValueOnce("MyDownloads");
    const downloader = freshDownloader();
    await expect(downloader.getDownloadsFolderName!()).resolves.toBe("MyDownloads");
  });

  it("returns null when using the default public Downloads folder", async () => {
    mockYtdlp.getDownloadsFolderName.mockResolvedValueOnce(null);
    const downloader = freshDownloader();
    await expect(downloader.getDownloadsFolderName!()).resolves.toBeNull();
  });
});

describe("resetDownloadsFolder", () => {
  it("resets the native folder preference", async () => {
    const downloader = freshDownloader();
    await downloader.resetDownloadsFolder!();
    expect(mockYtdlp.resetDownloadsFolder).toHaveBeenCalled();
  });
});

describe("importCookies / getCookiesStatus / clearCookies", () => {
  it("importCookies forwards the cookies text to the native module", async () => {
    const downloader = freshDownloader();
    await downloader.importCookies("# Netscape HTTP Cookie File\n");
    expect(mockYtdlp.importCookies).toHaveBeenCalledWith("# Netscape HTTP Cookie File\n");
  });

  it("getCookiesStatus reports present with no date when cookies are stored", async () => {
    mockYtdlp.hasCookies.mockResolvedValueOnce(true);
    const downloader = freshDownloader();
    await expect(downloader.getCookiesStatus()).resolves.toEqual({ present: true, updatedAt: null });
  });

  it("getCookiesStatus reports absent when no cookies are stored", async () => {
    mockYtdlp.hasCookies.mockResolvedValueOnce(false);
    const downloader = freshDownloader();
    await expect(downloader.getCookiesStatus()).resolves.toEqual({ present: false, updatedAt: null });
  });

  it("clearCookies removes the stored cookies file", async () => {
    const downloader = freshDownloader();
    await downloader.clearCookies();
    expect(mockYtdlp.clearCookies).toHaveBeenCalled();
  });
});
