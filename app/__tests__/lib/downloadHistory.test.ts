import AsyncStorage from "@react-native-async-storage/async-storage";
import { appendHistoryEntries, loadHistory, removeHistoryEntries, type HistoryEntry } from "../../lib/downloadHistory";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const STORAGE_KEY = "contentdownloader.downloadHistory";

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "job-1",
    url: "https://youtube.com/watch?v=x",
    format: "audio",
    quality: "320",
    title: "My Song",
    thumbnail: null,
    result: "/cache/song.mp3",
    ext: "mp3",
    createdAt: 1000,
    completedAt: 2000,
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("loadHistory", () => {
  it("returns an empty array when nothing was ever saved", async () => {
    await expect(loadHistory()).resolves.toEqual([]);
  });

  it("returns the stored entries when valid", async () => {
    const entry = makeEntry();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry]));
    await expect(loadHistory()).resolves.toEqual([entry]);
  });

  it("returns an empty array for malformed JSON", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "not json");
    await expect(loadHistory()).resolves.toEqual([]);
  });

  it("returns an empty array when the stored JSON parses to a non-array", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));
    await expect(loadHistory()).resolves.toEqual([]);
  });

  it("drops only the individual entries that don't look like a HistoryEntry", async () => {
    const valid = makeEntry({ id: "good" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([valid, { id: "bad" }, "not an object", 42, null]));
    await expect(loadHistory()).resolves.toEqual([valid]);
  });

  it.each([
    ["id", { id: 42 }],
    ["url", { url: 42 }],
    ["format", { format: "pdf" }],
    ["quality", { quality: 42 }],
    ["title", { title: 42 }],
    ["thumbnail", { thumbnail: 42 }],
    ["result", { result: 42 }],
    ["ext", { ext: "wav" }],
    ["createdAt", { createdAt: "not a number" }],
    ["completedAt", { completedAt: "not a number" }],
  ])("rejects an entry with an invalid %s field", async (_field, overrides) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([{ ...makeEntry(), ...overrides }]));
    await expect(loadHistory()).resolves.toEqual([]);
  });

  it("accepts null title/thumbnail/result/ext", async () => {
    const entry = makeEntry({ title: null, thumbnail: null, result: null, ext: null });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry]));
    await expect(loadHistory()).resolves.toEqual([entry]);
  });
});

describe("appendHistoryEntries", () => {
  it("is a no-op for an empty list", async () => {
    await appendHistoryEntries([]);
    await expect(loadHistory()).resolves.toEqual([]);
  });

  it("persists a single new entry", async () => {
    await appendHistoryEntries([makeEntry()]);
    await expect(loadHistory()).resolves.toEqual([makeEntry()]);
  });

  it("persists several new entries in one call, oldest first", async () => {
    await appendHistoryEntries([makeEntry({ id: "a" }), makeEntry({ id: "b" })]);
    await expect(loadHistory()).resolves.toEqual([makeEntry({ id: "a" }), makeEntry({ id: "b" })]);
  });

  it("appends to existing entries across separate calls, oldest first", async () => {
    await appendHistoryEntries([makeEntry({ id: "a" })]);
    await appendHistoryEntries([makeEntry({ id: "b" })]);
    await expect(loadHistory()).resolves.toEqual([makeEntry({ id: "a" }), makeEntry({ id: "b" })]);
  });

  it("is a no-op when every entry in the batch was already recorded", async () => {
    await appendHistoryEntries([makeEntry({ id: "a", title: "First" })]);
    await appendHistoryEntries([makeEntry({ id: "a", title: "Second" })]);
    await expect(loadHistory()).resolves.toEqual([makeEntry({ id: "a", title: "First" })]);
  });

  it("skips only the entries whose id was already recorded, keeping the rest of the batch", async () => {
    await appendHistoryEntries([makeEntry({ id: "a", title: "First" })]);
    await appendHistoryEntries([makeEntry({ id: "a", title: "Second" }), makeEntry({ id: "b" })]);
    await expect(loadHistory()).resolves.toEqual([makeEntry({ id: "a", title: "First" }), makeEntry({ id: "b" })]);
  });

  it("caps the list at 200 entries, dropping the oldest first", async () => {
    const entries = Array.from({ length: 200 }, (_, i) => makeEntry({ id: `job-${i}` }));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    await appendHistoryEntries([makeEntry({ id: "job-200" })]);
    const stored = await loadHistory();
    expect(stored).toHaveLength(200);
    expect(stored[0].id).toBe("job-1");
    expect(stored[stored.length - 1].id).toBe("job-200");
  });
});

describe("appendHistoryEntries ordering", () => {
  it("slots re-added (older) entries back into completedAt order", async () => {
    await appendHistoryEntries([makeEntry({ id: "a", completedAt: 1 }), makeEntry({ id: "c", completedAt: 3 })]);
    await appendHistoryEntries([makeEntry({ id: "b", completedAt: 2 })]);
    const history = await loadHistory();
    expect(history.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

describe("removeHistoryEntries", () => {
  it("removes only the entries with the given ids", async () => {
    await appendHistoryEntries([makeEntry({ id: "a" }), makeEntry({ id: "b" }), makeEntry({ id: "c" })]);
    await removeHistoryEntries(["a", "c"]);
    const history = await loadHistory();
    expect(history.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("is a no-op for unknown ids", async () => {
    await appendHistoryEntries([makeEntry({ id: "a" })]);
    await removeHistoryEntries(["missing"]);
    const history = await loadHistory();
    expect(history.map((entry) => entry.id)).toEqual(["a"]);
  });
});
