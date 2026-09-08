import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadBackgroundSetting, saveBackgroundSetting, NONE_BACKGROUND_ID } from "./backgroundPreference";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

afterEach(() => {
  jest.clearAllMocks();
});

describe("loadBackgroundSetting", () => {
  it("returns 'none' with empty params when nothing was ever saved", async () => {
    await expect(loadBackgroundSetting()).resolves.toEqual({ backgroundId: NONE_BACKGROUND_ID, params: {} });
  });

  it("returns a previously saved setting, round-tripped through JSON", async () => {
    await saveBackgroundSetting({ backgroundId: "aeroShards", params: { scale: 1.5 } });
    await expect(loadBackgroundSetting()).resolves.toEqual({ backgroundId: "aeroShards", params: { scale: 1.5 } });
  });

  it("falls back to the default when the stored value isn't valid JSON", async () => {
    await AsyncStorage.setItem("contentdownloader.backgroundSetting", "not json");
    await expect(loadBackgroundSetting()).resolves.toEqual({ backgroundId: NONE_BACKGROUND_ID, params: {} });
  });

  it("falls back to the default when the stored value is missing required fields", async () => {
    await AsyncStorage.setItem("contentdownloader.backgroundSetting", JSON.stringify({ backgroundId: "aeroShards" }));
    await expect(loadBackgroundSetting()).resolves.toEqual({ backgroundId: NONE_BACKGROUND_ID, params: {} });
  });

  it("falls back to the default when the stored value is a JSON primitive, not an object", async () => {
    await AsyncStorage.setItem("contentdownloader.backgroundSetting", JSON.stringify("aeroShards"));
    await expect(loadBackgroundSetting()).resolves.toEqual({ backgroundId: NONE_BACKGROUND_ID, params: {} });
  });
});

describe("saveBackgroundSetting", () => {
  it("persists the setting as JSON under the expected key", async () => {
    await saveBackgroundSetting({ backgroundId: "aeroShards", params: { scale: 1 } });
    await expect(AsyncStorage.getItem("contentdownloader.backgroundSetting")).resolves.toBe(
      JSON.stringify({ backgroundId: "aeroShards", params: { scale: 1 } })
    );
  });
});
