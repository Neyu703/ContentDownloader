/** A fully-stubbed fake matching the native Ytdlp module's shape, for `jest.mock("../modules/ytdlp", ...)`. */
export function createNativeYtdlpMock() {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue({ setup: { phase: "ready", message: "", ytdlpVersion: null }, jobs: [] }),
    enqueue: jest.fn().mockResolvedValue("native-job-id"),
    getPlaylistInfo: jest.fn().mockResolvedValue({ title: "", entries: [], totalCount: null }),
    cancel: jest.fn().mockResolvedValue(undefined),
    clearFinished: jest.fn().mockResolvedValue(undefined),
    getDebugLogFile: jest.fn().mockResolvedValue("/cache/ytdlp-debug-log.txt"),
    requestNotificationPermission: jest.fn().mockResolvedValue(true),
    saveToDownloads: jest.fn().mockResolvedValue("content://downloads/x"),
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    removeAllListeners: jest.fn(),
  };
}
