import { Animated, Dimensions, Platform } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import App from "./App";
import type { JobState, PlaylistInfo, SetupState } from "./downloader/types";

jest.mock("expo-clipboard", () => ({ getStringAsync: jest.fn() }));
jest.mock("expo-mail-composer", () => ({ isAvailableAsync: jest.fn(), composeAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

let mockDownloader: ReturnType<typeof makeDownloader>;
jest.mock("./downloader", () => ({
  get downloader() {
    return mockDownloader;
  },
}));

function setWindowWidth(width: number) {
  jest.spyOn(Dimensions, "get").mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 });
}

function makeDownloader(overrides: Record<string, unknown> = {}) {
  let listener: ((jobs: JobState[], setup: SetupState) => void) | null = null;
  const unsubscribe = jest.fn();
  const subscribe = jest.fn((l: (jobs: JobState[], setup: SetupState) => void) => {
    listener = l;
    l([], { phase: "ready", message: "" });
    return unsubscribe;
  });
  return {
    subscribe,
    unsubscribe,
    async push(jobs: JobState[], setup: SetupState = { phase: "ready", message: "" }) {
      await act(() => {
        listener?.(jobs, setup);
      });
    },
    enqueue: jest.fn().mockResolvedValue("job-1"),
    cancel: jest.fn(),
    clearFinished: jest.fn(),
    getPlaylistInfo: jest.fn(),
    ...overrides,
  };
}

function makeJob(overrides: Partial<JobState> = {}): JobState {
  return {
    id: "j1",
    url: "https://youtube.com/watch?v=x",
    format: "audio",
    quality: "320",
    phase: "downloading",
    title: "My Song",
    progress: 10,
    etaSeconds: null,
    lastLine: "",
    result: null,
    ext: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makePlaylistInfo(overrides: Partial<PlaylistInfo> = {}): PlaylistInfo {
  return {
    title: "My Playlist",
    entries: [
      { id: "e1", url: "https://youtube.com/watch?v=e1", title: "Video 1", thumbnail: null, duration: 60 },
      { id: "e2", url: "https://youtube.com/watch?v=e2", title: "Video 2", thumbnail: null, duration: 120 },
    ],
    totalCount: 2,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDownloader = makeDownloader();
  setWindowWidth(400);
  Platform.OS = "ios";
  // JobCard's own expand/collapse animation is already covered by JobCard.test.tsx; stubbing it
  // here avoids a real 220ms setTimeout outliving a fast App test and firing during a later one.
  jest
    .spyOn(Animated, "timing")
    .mockReturnValue({ start: (cb?: (result: { finished: boolean }) => void) => cb?.({ finished: true }) } as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete (globalThis as { window?: { location?: unknown } }).window?.location;
  delete Constants.expoConfig!.extra!.debugLogEmail;
});

describe("format/quality selection", () => {
  it("resets quality to the format's default when the format changes", async () => {
    await render(<App />);
    await fireEvent.press(screen.getByText("Nur Audio (MP3)"));
    await fireEvent.press(screen.getByText("Video (MP4)"));
    expect(screen.getByText("Beste verfügbare Qualität")).toBeTruthy();
  });

  it("lets the user pick a specific quality", async () => {
    await render(<App />);
    await fireEvent.press(screen.getByText("Beste (320 kbps)"));
    await fireEvent.press(screen.getByText("Gut (192 kbps)"));
    expect(screen.getByText("Gut (192 kbps)")).toBeTruthy();
  });
});

describe("paste", () => {
  it("fills the url field with trimmed clipboard text", async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce("  https://youtu.be/abc  ");
    await render(<App />);
    await fireEvent.press(screen.getByLabelText("Einfügen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://www.youtube.com/watch?v=...").props.value).toBe(
        "https://youtu.be/abc"
      );
    });
  });

  it("leaves the url field untouched when the clipboard is empty", async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce("");
    await render(<App />);
    await fireEvent.press(screen.getByLabelText("Einfügen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://www.youtube.com/watch?v=...").props.value).toBe("");
    });
  });
});

describe("preview debounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it("does nothing when the downloader has no getVideoInfo (native)", async () => {
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByText("Suche Video…")).toBeNull();
  });

  it("fetches and shows a preview after the debounce for a plain video url", async () => {
    const getVideoInfo = jest.fn().mockResolvedValue({ title: "A Video", duration: 90, thumbnail: null, uploader: null });
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview: jest.fn() });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    expect(screen.getByText("Suche Video…")).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => expect(screen.getByText("A Video")).toBeTruthy());
    expect(screen.getByText("1:30")).toBeTruthy();
    expect(getVideoInfo).toHaveBeenCalledWith("https://youtu.be/abc", expect.any(Object));
  });

  it("renders the preview thumbnail when the fetched info includes one", async () => {
    const getVideoInfo = jest.fn().mockResolvedValue({ title: "A Video", duration: 90, thumbnail: "https://example.com/thumb.jpg", uploader: null });
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview: jest.fn() });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => expect(screen.getByTestId("preview-thumbnail")).toBeTruthy());
  });

  it("clears the preview immediately for a playlist url without fetching", async () => {
    const getVideoInfo = jest.fn().mockResolvedValue({ title: "A Video", duration: 90, thumbnail: null, uploader: null });
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview: jest.fn() });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtube.com/playlist?list=PL123");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(getVideoInfo).not.toHaveBeenCalled();
    expect(screen.queryByText("Suche Video…")).toBeNull();
  });

  it("clears the preview for an empty url", async () => {
    const getVideoInfo = jest.fn().mockResolvedValue({ title: "A Video", duration: 90, thumbnail: null, uploader: null });
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview: jest.fn() });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => expect(screen.getByText("A Video")).toBeTruthy());
    await fireEvent.changeText(input, "");
    expect(screen.queryByText("A Video")).toBeNull();
  });

  it("does not show a preview when getVideoInfo rejects", async () => {
    const getVideoInfo = jest.fn().mockRejectedValue(new Error("nope"));
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview: jest.fn() });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => expect(screen.queryByText("Suche Video…")).toBeNull());
    expect(screen.queryByText("A Video")).toBeNull();
  });

  it("only fetches the final url when typed twice within the debounce window (stale-request guard)", async () => {
    const getVideoInfo = jest.fn().mockResolvedValue({ title: "Second", duration: 30, thumbnail: null, uploader: null });
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview: jest.fn() });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/first");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    await fireEvent.changeText(input, "https://youtu.be/second");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
    expect(getVideoInfo).toHaveBeenCalledTimes(1);
    expect(getVideoInfo).toHaveBeenCalledWith("https://youtu.be/second", expect.any(Object));
  });

  it("aborts the in-flight request's signal and does not warn when unmounted before it resolves", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    let resolveInfo!: (info: unknown) => void;
    const getVideoInfo = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveInfo = resolve;
        })
    );
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview: jest.fn() });
    const { unmount } = await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    await unmount();
    resolveInfo({ title: "Too late", duration: 10, thumbnail: null, uploader: null });
    await act(async () => {
      await Promise.resolve();
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("handleConvert — single video", () => {
  it("does nothing when the url is blank", async () => {
    await render(<App />);
    await fireEvent.press(screen.getByText("Herunterladen"));
    expect(mockDownloader.enqueue).not.toHaveBeenCalled();
  });

  it("submits the trimmed url and clears the input", async () => {
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "  https://youtu.be/abc  ");
    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() => expect(mockDownloader.enqueue).toHaveBeenCalled());
    expect(mockDownloader.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://youtu.be/abc", format: "audio", quality: "320" })
    );
    expect(input.props.value).toBe("");
  });

  it("shows the enqueue error message and re-enables the button", async () => {
    mockDownloader = makeDownloader({ enqueue: jest.fn().mockRejectedValue(new Error("Server down")) });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() => expect(screen.getByText("Server down")).toBeTruthy());
    expect(screen.getByText("Herunterladen")).toBeTruthy();
  });

  it("shows a generic error message when enqueue throws a non-Error value", async () => {
    mockDownloader = makeDownloader({ enqueue: jest.fn().mockRejectedValue("boom") });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() => expect(screen.getByText("Herunterladen fehlgeschlagen.")).toBeTruthy());
  });

  it("patches the job with preview info fetched after the job already started", async () => {
    jest.useFakeTimers();
    const updateJobPreview = jest.fn();
    const getVideoInfo = jest.fn().mockResolvedValue({ title: "Late Title", duration: 42, thumbnail: null, uploader: null });
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await fireEvent.press(screen.getByText("Herunterladen"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => expect(updateJobPreview).toHaveBeenCalledWith("job-1", expect.objectContaining({ title: "Late Title" })));
  });

  it("reuses the already in-flight debounced fetch instead of starting a second one", async () => {
    jest.useFakeTimers();
    let resolveInfo!: (info: unknown) => void;
    const getVideoInfo = jest.fn(() => new Promise((resolve) => { resolveInfo = resolve; }));
    const updateJobPreview = jest.fn();
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    expect(getVideoInfo).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByText("Herunterladen"));
    await act(async () => {
      resolveInfo({ title: "Reused", duration: 5, thumbnail: null, uploader: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(updateJobPreview).toHaveBeenCalledWith("job-1", expect.objectContaining({ title: "Reused" })));
    expect(getVideoInfo).toHaveBeenCalledTimes(1);
  });

  it("silently skips the preview patch when a fresh (non-debounced) fetch fails", async () => {
    const getVideoInfo = jest.fn().mockRejectedValue(new Error("nope"));
    const updateJobPreview = jest.fn();
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    // Pressed immediately, well before the 600ms debounce fires — no pending preview request exists.
    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() => expect(getVideoInfo).toHaveBeenCalledWith("https://youtu.be/abc"));
    expect(updateJobPreview).not.toHaveBeenCalled();
  });

  it("does not patch preview info when getVideoInfo/updateJobPreview are absent (native)", async () => {
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() => expect(mockDownloader.enqueue).toHaveBeenCalled());
  });

  it("uses the already-resolved preview instead of enqueueing without info when the preview matches", async () => {
    jest.useFakeTimers();
    const getVideoInfo = jest.fn().mockResolvedValue({ title: "Matched", duration: 15, thumbnail: null, uploader: null });
    mockDownloader = makeDownloader({ getVideoInfo, updateJobPreview: jest.fn() });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtu.be/abc");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => expect(screen.getByText("Matched")).toBeTruthy());

    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() =>
      expect(mockDownloader.enqueue).toHaveBeenCalledWith(expect.objectContaining({ title: "Matched", durationSeconds: 15 }))
    );
  });
});

describe("handleConvert — playlist", () => {
  it("loads playlist info and opens the picker", async () => {
    const getPlaylistInfo = jest.fn().mockResolvedValue(makePlaylistInfo());
    mockDownloader = makeDownloader({ getPlaylistInfo });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtube.com/playlist?list=PL1");
    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() => expect(screen.getByText("Video 1")).toBeTruthy());
    expect(getPlaylistInfo).toHaveBeenCalledWith("https://youtube.com/playlist?list=PL1", 1);
  });

  it("shows the playlist error message and closes the loading state on failure", async () => {
    const getPlaylistInfo = jest.fn().mockRejectedValue(new Error("Playlist kaputt"));
    mockDownloader = makeDownloader({ getPlaylistInfo });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtube.com/playlist?list=PL1");
    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() => expect(screen.getByText("Playlist kaputt")).toBeTruthy());
    expect(screen.getByText("Herunterladen")).toBeTruthy();
  });

  it("shows a generic playlist error message for a non-Error rejection", async () => {
    const getPlaylistInfo = jest.fn().mockRejectedValue("boom");
    mockDownloader = makeDownloader({ getPlaylistInfo });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtube.com/playlist?list=PL1");
    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() => expect(screen.getByText("Playlist konnte nicht geladen werden.")).toBeTruthy());
  });

  it("marks an empty playlist page as having no more pages", async () => {
    const getPlaylistInfo = jest.fn().mockResolvedValue(makePlaylistInfo({ entries: [], totalCount: 0 }));
    mockDownloader = makeDownloader({ getPlaylistInfo });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtube.com/playlist?list=PL1");
    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() => expect(screen.getByText("Abbrechen")).toBeTruthy());

    await fireEvent(screen.getByTestId("playlist-entry-list"), "endReached");
    expect(getPlaylistInfo).toHaveBeenCalledTimes(1);
  });

  it("ignores Herunterladen presses while a playlist is already loading", async () => {
    let resolvePlaylist!: (info: PlaylistInfo) => void;
    const getPlaylistInfo = jest.fn(
      () =>
        new Promise<PlaylistInfo>((resolve) => {
          resolvePlaylist = resolve;
        })
    );
    mockDownloader = makeDownloader({ getPlaylistInfo });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtube.com/playlist?list=PL1");
    // Not awaited: handleConvert is async and won't settle until getPlaylistInfo resolves below,
    // so awaiting this press would block on that still-pending promise.
    fireEvent.press(screen.getByText("Herunterladen"));
    await screen.findByText("Lädt Playlist…");
    // The "Herunterladen" button is disabled while loading, but the TextInput's onSubmitEditing
    // calls handleConvert directly, unguarded by that disabled prop — exercise that path.
    await fireEvent(input, "submitEditing");
    await act(async () => {
      resolvePlaylist(makePlaylistInfo());
      await Promise.resolve();
    });
    expect(getPlaylistInfo).toHaveBeenCalledTimes(1);
  });
});

describe("playlist picker interactions", () => {
  async function openPicker(getPlaylistInfo = jest.fn().mockResolvedValue(makePlaylistInfo())) {
    mockDownloader = makeDownloader({ getPlaylistInfo });
    await render(<App />);
    const input = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    await fireEvent.changeText(input, "https://youtube.com/playlist?list=PL1");
    await fireEvent.press(screen.getByText("Herunterladen"));
    await waitFor(() => expect(screen.getByText("Video 1")).toBeTruthy());
    return getPlaylistInfo;
  }

  it("toggles a single entry off and on", async () => {
    await openPicker();
    expect(screen.getByText("2 Audios herunterladen")).toBeTruthy();
    await fireEvent.press(screen.getByText("Video 1"));
    expect(screen.getByText("1 Audio herunterladen")).toBeTruthy();
    await fireEvent.press(screen.getByText("Video 1"));
    expect(screen.getByText("2 Audios herunterladen")).toBeTruthy();
  });

  it("selects and deselects all entries", async () => {
    await openPicker();
    await fireEvent.press(screen.getByText("Alle abwählen"));
    expect(screen.getByText("Nichts ausgewählt")).toBeTruthy();
    expect(screen.getByText("Alle auswählen")).toBeTruthy();
    await fireEvent.press(screen.getByText("Alle auswählen"));
    expect(screen.getByText("2 Audios herunterladen")).toBeTruthy();
  });

  it("shows 'Alle abwählen' right after opening even when two entries share a duplicate id", async () => {
    // A video can legitimately appear twice in the same YouTube playlist (re-added), so
    // PlaylistEntry.id (the raw video id) isn't guaranteed unique across entries.
    const getPlaylistInfo = jest.fn().mockResolvedValue(
      makePlaylistInfo({
        entries: [
          { id: "dup", url: "https://youtube.com/watch?v=dup", title: "Video 1", thumbnail: null, duration: 60 },
          { id: "dup", url: "https://youtube.com/watch?v=dup", title: "Video 2", thumbnail: null, duration: 60 },
        ],
        totalCount: 2,
      })
    );
    await openPicker(getPlaylistInfo);
    expect(screen.getByText("Alle abwählen")).toBeTruthy();
  });

  it("loads more entries on end-reached and keeps them pre-selected", async () => {
    const getPlaylistInfo = jest
      .fn()
      .mockResolvedValueOnce(makePlaylistInfo({ totalCount: null }))
      .mockResolvedValueOnce(
        makePlaylistInfo({
          entries: [{ id: "e3", url: "https://youtube.com/watch?v=e3", title: "Video 3", thumbnail: null, duration: 30 }],
          totalCount: null,
        })
      );
    await openPicker(getPlaylistInfo);
    await fireEvent(screen.getByTestId("playlist-entry-list"), "endReached");
    await waitFor(() => expect(screen.getByText("Video 3")).toBeTruthy());
    expect(screen.getByText("3 Audios herunterladen")).toBeTruthy();
    expect(getPlaylistInfo).toHaveBeenLastCalledWith("https://youtube.com/playlist?list=PL1", 3);
  });

  it("stops paging once totalCount is reached without calling getPlaylistInfo again", async () => {
    const getPlaylistInfo = jest.fn().mockResolvedValue(makePlaylistInfo({ totalCount: 2 }));
    await openPicker(getPlaylistInfo);
    await fireEvent(screen.getByTestId("playlist-entry-list"), "endReached");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getPlaylistInfo).toHaveBeenCalledTimes(1);
  });

  it("stops paging once a loaded page comes back empty (noMorePages)", async () => {
    const getPlaylistInfo = jest
      .fn()
      .mockResolvedValueOnce(makePlaylistInfo({ totalCount: null }))
      .mockResolvedValueOnce(makePlaylistInfo({ entries: [], totalCount: null }));
    await openPicker(getPlaylistInfo);
    await fireEvent(screen.getByTestId("playlist-entry-list"), "endReached");
    await waitFor(() => expect(getPlaylistInfo).toHaveBeenCalledTimes(2));

    await fireEvent(screen.getByTestId("playlist-entry-list"), "endReached");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getPlaylistInfo).toHaveBeenCalledTimes(2);
  });

  it("silently stops paging and keeps already-loaded entries when loading more fails", async () => {
    const getPlaylistInfo = jest
      .fn()
      .mockResolvedValueOnce(makePlaylistInfo({ totalCount: null }))
      .mockRejectedValueOnce(new Error("boom"));
    await openPicker(getPlaylistInfo);
    await fireEvent(screen.getByTestId("playlist-entry-list"), "endReached");
    await waitFor(() => expect(getPlaylistInfo).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Video 1")).toBeTruthy();
  });

  it("ignores a loadMore page that arrives after the user already cancelled the picker", async () => {
    let resolveMore!: (info: PlaylistInfo) => void;
    const getPlaylistInfo = jest
      .fn()
      .mockResolvedValueOnce(makePlaylistInfo({ totalCount: null }))
      .mockReturnValueOnce(
        new Promise<PlaylistInfo>((resolve) => {
          resolveMore = resolve;
        })
      );
    await openPicker(getPlaylistInfo);
    // Not awaited: loadMorePlaylistEntries is async and won't settle until getPlaylistInfo's
    // second call resolves below, so awaiting this would block on that still-pending promise.
    fireEvent(screen.getByTestId("playlist-entry-list"), "endReached");
    await waitFor(() => expect(getPlaylistInfo).toHaveBeenCalledTimes(2));
    await fireEvent.press(screen.getByText("Abbrechen"));
    expect(screen.queryByText("Video 1")).toBeNull();

    await act(async () => {
      resolveMore(
        makePlaylistInfo({
          entries: [{ id: "e3", url: "https://youtube.com/watch?v=e3", title: "Video 3", thumbnail: null, duration: 30 }],
          totalCount: null,
        })
      );
      await Promise.resolve();
    });
    expect(screen.queryByText("Video 3")).toBeNull();
  });

  it("confirms the playlist download, submitting each selected entry with a shared group", async () => {
    await openPicker();
    await fireEvent.press(screen.getByText("2 Audios herunterladen"));
    await waitFor(() => expect(mockDownloader.enqueue).toHaveBeenCalledTimes(2));
    expect(mockDownloader.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ url: "https://youtube.com/watch?v=e1", title: "Video 1", groupTitle: "My Playlist" })
    );
    const [firstCall, secondCall] = mockDownloader.enqueue.mock.calls;
    expect(firstCall[0].groupId).toBe(secondCall[0].groupId);
    expect(screen.queryByText("Video 1")).toBeNull();
  });

  it("closes the picker on cancel without submitting anything", async () => {
    await openPicker();
    await fireEvent.press(screen.getByText("Abbrechen"));
    expect(screen.queryByText("Video 1")).toBeNull();
    expect(mockDownloader.enqueue).not.toHaveBeenCalled();
  });
});

describe("handleSendLog", () => {
  it("is not shown when the downloader has no getDebugLogFileUri (web)", async () => {
    await render(<App />);
    expect(screen.queryByText("Debug-Log senden")).toBeNull();
  });

  it("sends the log via mail without a recipient when none is configured", async () => {
    const getDebugLogFileUri = jest.fn().mockResolvedValue("file:///log.txt");
    mockDownloader = makeDownloader({ getDebugLogFileUri });
    (MailComposer.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (MailComposer.composeAsync as jest.Mock).mockResolvedValue(undefined);
    await render(<App />);
    await fireEvent.press(screen.getByText("Debug-Log senden"));
    await waitFor(() => expect(MailComposer.composeAsync).toHaveBeenCalled());
    expect(MailComposer.composeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: ["file:///log.txt"], recipients: undefined })
    );
    expect(screen.getByText("Debug-Log senden")).toBeTruthy();
  });

  it("sends the log to the configured recipient when debugLogEmail is set", async () => {
    Constants.expoConfig!.extra!.debugLogEmail = "logs@example.com";
    const getDebugLogFileUri = jest.fn().mockResolvedValue("file:///log.txt");
    mockDownloader = makeDownloader({ getDebugLogFileUri });
    (MailComposer.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (MailComposer.composeAsync as jest.Mock).mockResolvedValue(undefined);
    await render(<App />);
    await fireEvent.press(screen.getByText("Debug-Log senden"));
    await waitFor(() =>
      expect(MailComposer.composeAsync).toHaveBeenCalledWith(expect.objectContaining({ recipients: ["logs@example.com"] }))
    );
  });

  it("shows an error when no mail app is available", async () => {
    const getDebugLogFileUri = jest.fn().mockResolvedValue("file:///log.txt");
    mockDownloader = makeDownloader({ getDebugLogFileUri });
    (MailComposer.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    await render(<App />);
    await fireEvent.press(screen.getByText("Debug-Log senden"));
    await waitFor(() => expect(screen.getByText("Keine Mail-App auf diesem Gerät eingerichtet.")).toBeTruthy());
    expect(MailComposer.composeAsync).not.toHaveBeenCalled();
  });

  it("shows a generic error when preparing the log throws", async () => {
    const getDebugLogFileUri = jest.fn().mockRejectedValue(new Error("disk full"));
    mockDownloader = makeDownloader({ getDebugLogFileUri });
    await render(<App />);
    await fireEvent.press(screen.getByText("Debug-Log senden"));
    await waitFor(() => expect(screen.getByText("Log konnte nicht vorbereitet werden.")).toBeTruthy());
  });

  it("disables the button while a send is already in flight", async () => {
    let resolveLog!: (uri: string) => void;
    const getDebugLogFileUri = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLog = resolve;
        })
    );
    mockDownloader = makeDownloader({ getDebugLogFileUri });
    await render(<App />);
    // Not awaited: handleSendLog is async and won't settle until getDebugLogFileUri resolves
    // below, so awaiting this press would block on that still-pending promise.
    fireEvent.press(screen.getByText("Debug-Log senden"));
    const sendingButton = await screen.findByText("Bereite Log vor…");
    expect(sendingButton.parent!.props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      resolveLog("file:///log.txt");
      await Promise.resolve();
    });
    expect(getDebugLogFileUri).toHaveBeenCalledTimes(1);
  });
});

describe("handleShare", () => {
  function finishedJob(overrides: Partial<JobState> = {}) {
    return makeJob({ phase: "done", result: "/cache/song.mp3", ext: "mp3", ...overrides });
  }

  it("does nothing when the job has no result", async () => {
    mockDownloader = makeDownloader({ getDebugLogFileUri: jest.fn(), saveToDownloads: jest.fn() });
    await render(<App />);
    await mockDownloader.push([finishedJob({ id: "j1", result: null, phase: "downloading" })]);
    expect(screen.queryByText("Teilen")).toBeNull();
  });

  it("does nothing when pressed on a done job that has no result yet", async () => {
    await render(<App />);
    await mockDownloader.push([finishedJob({ result: null })]);
    await fireEvent.press(screen.getByText("MP3 herunterladen"));
    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
  });

  it("falls back to 'download' as the dialog title when the job has no title", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    await render(<App />);
    await mockDownloader.push([finishedJob({ title: null })]);
    await fireEvent.press(screen.getByText("MP3 herunterladen"));
    await waitFor(() =>
      expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ dialogTitle: "download" }))
    );
  });

  it("sets window.location.href on web instead of using native sharing", async () => {
    Platform.OS = "web";
    (globalThis as { window?: { location?: { href?: string } } }).window = { location: { href: "" } };
    await render(<App />);
    await mockDownloader.push([finishedJob()]);
    await fireEvent.press(screen.getByText("MP3 herunterladen"));
    expect((globalThis as { window: { location: { href: string } } }).window.location.href).toBe("/cache/song.mp3");
    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
  });

  it("shares a file:// prefixed path unchanged when sharing is available", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    await render(<App />);
    await mockDownloader.push([finishedJob({ result: "file:///cache/song.mp3" })]);
    await fireEvent.press(screen.getByText("MP3 herunterladen"));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/song.mp3", expect.objectContaining({ mimeType: "audio/mpeg" }));
  });

  it("prefixes a bare path with file:// before sharing an mp4", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    await render(<App />);
    await mockDownloader.push([finishedJob({ result: "/cache/clip.mp4", ext: "mp4" })]);
    await fireEvent.press(screen.getByText("MP4 herunterladen"));
    await waitFor(() =>
      expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/clip.mp4", expect.objectContaining({ mimeType: "video/mp4" }))
    );
  });

  it("does not call shareAsync when sharing is unavailable", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    await render(<App />);
    await mockDownloader.push([finishedJob()]);
    await fireEvent.press(screen.getByText("MP3 herunterladen"));
    await waitFor(() => expect(Sharing.isAvailableAsync).toHaveBeenCalled());
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("resets the sharing indicator after sharing finishes", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    await render(<App />);
    await mockDownloader.push([finishedJob()]);
    await fireEvent.press(screen.getByText("MP3 herunterladen"));
    await waitFor(() => expect(screen.queryByText("…")).toBeNull());
  });
});

describe("job save (native onSave wiring)", () => {
  it("wires saveToDownloads into the JobCard when present", async () => {
    const saveToDownloads = jest.fn().mockResolvedValue(undefined);
    mockDownloader = makeDownloader({ saveToDownloads });
    await render(<App />);
    await mockDownloader.push([makeJob({ phase: "done", result: "/cache/song.mp3", ext: "mp3" })]);
    await fireEvent.press(screen.getByText("MP3 speichern"));
    await waitFor(() => expect(saveToDownloads).toHaveBeenCalled());
  });
});

describe("job list rendering", () => {
  it("shows nothing job-related when there are no jobs", async () => {
    await render(<App />);
    expect(screen.queryByText("Fertige entfernen")).toBeNull();
  });

  it("shows a group header with a done/total tally for playlist jobs", async () => {
    await render(<App />);
    await mockDownloader.push([
      makeJob({ id: "a", groupId: "g1", groupTitle: "My Playlist", phase: "done" }),
      makeJob({ id: "b", groupId: "g1", groupTitle: "My Playlist", phase: "downloading" }),
    ]);
    expect(screen.getByText("My Playlist — 1/2 fertig")).toBeTruthy();
  });

  it("falls back to a generic group label when groupTitle is missing", async () => {
    await render(<App />);
    await mockDownloader.push([makeJob({ id: "a", groupId: "g1", groupTitle: null, phase: "downloading" })]);
    expect(screen.getByText("Playlist — 0/1 fertig")).toBeTruthy();
  });

  it("renders ungrouped jobs without a group header", async () => {
    await render(<App />);
    await mockDownloader.push([makeJob({ id: "a" })]);
    expect(screen.queryByText(/fertig/)).toBeNull();
    expect(screen.getByText("My Song")).toBeTruthy();
  });

  it("shows 'Fertige entfernen' only when a finished job exists, and wires it to clearFinished", async () => {
    await render(<App />);
    await mockDownloader.push([makeJob({ id: "a", phase: "downloading" })]);
    expect(screen.queryByText("Fertige entfernen")).toBeNull();

    await mockDownloader.push([makeJob({ id: "a", phase: "done" })]);
    await fireEvent.press(screen.getByText("Fertige entfernen"));
    expect(mockDownloader.clearFinished).toHaveBeenCalled();
  });

  it("wires onCancel and onRetry to the downloader", async () => {
    await render(<App />);
    await mockDownloader.push([makeJob({ id: "a", phase: "downloading" })]);
    await fireEvent.press(screen.getByText("Abbrechen"));
    expect(mockDownloader.cancel).toHaveBeenCalledWith("a");

    await mockDownloader.push([makeJob({ id: "a", phase: "error", error: "oops" })]);
    await fireEvent.press(screen.getByText("Erneut versuchen"));
    await waitFor(() =>
      expect(mockDownloader.enqueue).toHaveBeenCalledWith(expect.objectContaining({ url: "https://youtube.com/watch?v=x" }))
    );
  });
});

describe("setup phase messages", () => {
  it.each([
    ["preparing", "Bereite yt-dlp vor…"],
    ["updating", "Aktualisiere yt-dlp…"],
    ["failed", "Setup fehlgeschlagen"],
  ] as const)("shows the setup message while phase is %s", async (phase, message) => {
    await render(<App />);
    await mockDownloader.push([], { phase, message });
    expect(screen.getByText(message)).toBeTruthy();
  });

  it("shows nothing extra once setup is ready", async () => {
    await render(<App />);
    await mockDownloader.push([], { phase: "ready", message: "" });
    expect(screen.queryByText(/Bereite|Aktualisiere|fehlgeschlagen/)).toBeNull();
  });
});

describe("layout", () => {
  it("stacks the form and job list in a single column below the breakpoint", async () => {
    setWindowWidth(400);
    await render(<App />);
    await mockDownloader.push([makeJob({ id: "a" })]);
    expect(screen.getByText("My Song")).toBeTruthy();
  });

  it("switches to a two-column layout at/above the breakpoint once jobs exist", async () => {
    setWindowWidth(900);
    await render(<App />);
    await mockDownloader.push([makeJob({ id: "a" })]);
    expect(screen.getByText("My Song")).toBeTruthy();
  });

  it("stays single-column when wide but there are no jobs yet", async () => {
    setWindowWidth(900);
    await render(<App />);
    expect(screen.getByText("Herunterladen")).toBeTruthy();
  });

  it("applies the wide flushTop style to 'Fertige entfernen' in the two-column layout", async () => {
    setWindowWidth(900);
    await render(<App />);
    await mockDownloader.push([makeJob({ id: "a", phase: "done" })]);
    expect(screen.getByText("Fertige entfernen")).toBeTruthy();
  });
});

describe("useNow ticking", () => {
  it("updates the elapsed-time label every second while a job is active", async () => {
    jest.useFakeTimers();
    await render(<App />);
    await mockDownloader.push([makeJob({ id: "a", phase: "downloading", createdAt: Date.now() })]);
    expect(screen.getByText(/Läuft seit: 0s/)).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/Läuft seit: 1s/)).toBeTruthy();
  });
});
