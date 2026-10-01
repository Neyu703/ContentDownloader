import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_DEBUG_FIELDS,
  DEFAULT_DISPLAY_PREFERENCES,
  loadDisplayPreferences,
  saveDisplayPreferences,
} from "../../display/displayPreferences";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const STORAGE_KEY = "contentdownloader.displayPreferences";

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("loadDisplayPreferences", () => {
  it("returns the default (original size, every field visible) when nothing was ever saved", async () => {
    await expect(loadDisplayPreferences()).resolves.toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  it("returns the stored preferences when valid", async () => {
    const stored = { jobCardSize: "spacious", formSize: "comfortable", debugFields: { ...DEFAULT_DEBUG_FIELDS, speed: false } };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    await expect(loadDisplayPreferences()).resolves.toEqual(stored);
  });

  it("falls back to the default for malformed JSON", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "not json");
    await expect(loadDisplayPreferences()).resolves.toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  it("falls back to the default when the stored JSON parses to a non-object", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(42));
    await expect(loadDisplayPreferences()).resolves.toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  it("falls back to original for an invalid jobCardSize, keeping the rest", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobCardSize: "huge", formSize: "spacious", debugFields: DEFAULT_DEBUG_FIELDS })
    );
    await expect(loadDisplayPreferences()).resolves.toEqual({
      jobCardSize: "original",
      formSize: "spacious",
      debugFields: DEFAULT_DEBUG_FIELDS,
    });
  });

  it("falls back to original for an invalid formSize, keeping the rest", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobCardSize: "spacious", formSize: 42, debugFields: DEFAULT_DEBUG_FIELDS })
    );
    await expect(loadDisplayPreferences()).resolves.toEqual({
      jobCardSize: "spacious",
      formSize: "original",
      debugFields: DEFAULT_DEBUG_FIELDS,
    });
  });

  it("defaults every debugFields key to true when the stored value is missing entirely", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ jobCardSize: "comfortable", formSize: "comfortable" }));
    await expect(loadDisplayPreferences()).resolves.toEqual({
      jobCardSize: "comfortable",
      formSize: "comfortable",
      debugFields: DEFAULT_DEBUG_FIELDS,
    });
  });

  it("defaults an individual debugFields key to true when it's missing (forward-compat with a future field)", async () => {
    const { speed: _omit, ...partialFields } = DEFAULT_DEBUG_FIELDS;
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobCardSize: "original", formSize: "original", debugFields: partialFields })
    );
    await expect(loadDisplayPreferences()).resolves.toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  it("defaults an individual debugFields key to true when its stored value isn't a boolean", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        jobCardSize: "original",
        formSize: "original",
        debugFields: { ...DEFAULT_DEBUG_FIELDS, eta: "yes" },
      })
    );
    await expect(loadDisplayPreferences()).resolves.toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  it("defaults every debugFields key to true when the stored debugFields value isn't an object", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobCardSize: "original", formSize: "original", debugFields: "nope" })
    );
    await expect(loadDisplayPreferences()).resolves.toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });
});

describe("saveDisplayPreferences", () => {
  it("persists the preferences under the expected key", async () => {
    const next = { jobCardSize: "spacious" as const, formSize: "original" as const, debugFields: DEFAULT_DEBUG_FIELDS };
    await saveDisplayPreferences(next);
    await expect(loadDisplayPreferences()).resolves.toEqual(next);
  });
});
