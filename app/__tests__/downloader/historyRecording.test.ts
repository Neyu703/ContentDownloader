import { startHistoryRecording } from "../../downloader/historyRecording";
import { appendHistoryEntries } from "../../lib/downloadHistory";
import type { JobState } from "../../downloader/types";

jest.mock("../../lib/downloadHistory", () => ({ appendHistoryEntries: jest.fn() }));

let mockDownloader: ReturnType<typeof makeDownloader>;
jest.mock("../../downloader", () => ({
  get downloader() {
    return mockDownloader;
  },
}));

function makeDownloader() {
  let listener: ((jobs: JobState[]) => void) | null = null;
  const unsubscribe = jest.fn();
  const subscribe = jest.fn((l: (jobs: JobState[]) => void) => {
    listener = l;
    return unsubscribe;
  });
  return {
    subscribe,
    unsubscribe,
    push(jobs: JobState[]) {
      listener?.(jobs);
    },
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
    thumbnail: "https://example.com/thumb.jpg",
    progress: 10,
    etaSeconds: null,
    lastLine: "",
    result: null,
    ext: null,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

beforeEach(() => {
  mockDownloader = makeDownloader();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("startHistoryRecording", () => {
  it("subscribes to the downloader and returns its unsubscribe function", () => {
    const result = startHistoryRecording();
    expect(mockDownloader.subscribe).toHaveBeenCalled();
    expect(result).toBe(mockDownloader.unsubscribe);
  });

  it("records a job once it reaches phase done", () => {
    startHistoryRecording();
    mockDownloader.push([makeJob({ phase: "done", result: "/cache/song.mp3", ext: "mp3", updatedAt: 3000 })]);
    expect(appendHistoryEntries).toHaveBeenCalledWith([
      {
        id: "j1",
        url: "https://youtube.com/watch?v=x",
        format: "audio",
        quality: "320",
        title: "My Song",
        thumbnail: "https://example.com/thumb.jpg",
        result: "/cache/song.mp3",
        ext: "mp3",
        createdAt: 1000,
        completedAt: 3000,
      },
    ]);
  });

  it("records several jobs that finish in the same notification as one batched call", () => {
    startHistoryRecording();
    mockDownloader.push([
      makeJob({ id: "a", phase: "done" }),
      makeJob({ id: "b", phase: "done" }),
      makeJob({ id: "c", phase: "downloading" }),
    ]);
    expect(appendHistoryEntries).toHaveBeenCalledTimes(1);
    const [recordedEntries] = (appendHistoryEntries as jest.Mock).mock.calls[0];
    expect(recordedEntries.map((entry: { id: string }) => entry.id)).toEqual(["a", "b"]);
  });

  it("defaults thumbnail to null when the job has none", () => {
    startHistoryRecording();
    mockDownloader.push([makeJob({ phase: "done", thumbnail: undefined })]);
    expect(appendHistoryEntries).toHaveBeenCalledWith([expect.objectContaining({ thumbnail: null })]);
  });

  it("does not call appendHistoryEntries when no job is active", () => {
    startHistoryRecording();
    mockDownloader.push([makeJob({ phase: "downloading" })]);
    expect(appendHistoryEntries).not.toHaveBeenCalled();
  });

  it("does not record an errored or cancelled job", () => {
    startHistoryRecording();
    mockDownloader.push([makeJob({ id: "a", phase: "error" }), makeJob({ id: "b", phase: "cancelled" })]);
    expect(appendHistoryEntries).not.toHaveBeenCalled();
  });

  it("records a job only once even if the listener fires again while it's still done", () => {
    startHistoryRecording();
    const job = makeJob({ phase: "done" });
    mockDownloader.push([job]);
    mockDownloader.push([job]);
    expect(appendHistoryEntries).toHaveBeenCalledTimes(1);
  });
});
