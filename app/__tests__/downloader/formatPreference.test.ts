import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadFormatPreference, saveFormatPreference } from "../../downloader/formatPreference";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const STORAGE_KEY = "contentdownloader.formatPreference";

afterEach(() => {
  jest.clearAllMocks();
});

describe("loadFormatPreference", () => {
  it("returns null when nothing was ever saved", async () => {
    await expect(loadFormatPreference()).resolves.toBeNull();
  });

  it("returns the stored preference when it's valid", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ format: "video", quality: "720" }));
    await expect(loadFormatPreference()).resolves.toEqual({ format: "video", quality: "720" });
  });

  it("returns null for malformed JSON", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "not json");
    await expect(loadFormatPreference()).resolves.toBeNull();
  });

  it("returns null when the stored JSON parses to a non-object", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(42));
    await expect(loadFormatPreference()).resolves.toBeNull();
  });

  it("returns null when format is neither 'audio' nor 'video'", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ format: "pdf", quality: "320" }));
    await expect(loadFormatPreference()).resolves.toBeNull();
  });

  it("returns null when quality isn't valid for the stored format", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ format: "audio", quality: "720" }));
    await expect(loadFormatPreference()).resolves.toBeNull();
  });

  it("returns null when quality is missing", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ format: "audio" }));
    await expect(loadFormatPreference()).resolves.toBeNull();
  });
});

describe("saveFormatPreference", () => {
  it("persists the preference under the expected key", async () => {
    await saveFormatPreference({ format: "audio", quality: "192" });
    await expect(loadFormatPreference()).resolves.toEqual({ format: "audio", quality: "192" });
  });
});
