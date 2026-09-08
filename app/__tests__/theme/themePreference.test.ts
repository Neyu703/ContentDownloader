import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadThemeSetting, saveThemeSetting } from "../../theme/themePreference";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

afterEach(() => {
  jest.clearAllMocks();
});

describe("loadThemeSetting", () => {
  it("returns 'system' when nothing was ever saved", async () => {
    await expect(loadThemeSetting()).resolves.toBe("system");
  });

  it("returns the stored setting when it's 'light'", async () => {
    await AsyncStorage.setItem("contentdownloader.themeSetting", "light");
    await expect(loadThemeSetting()).resolves.toBe("light");
  });

  it("returns the stored setting when it's 'dark'", async () => {
    await AsyncStorage.setItem("contentdownloader.themeSetting", "dark");
    await expect(loadThemeSetting()).resolves.toBe("dark");
  });

  it("falls back to 'system' for an unrecognized stored value", async () => {
    await AsyncStorage.setItem("contentdownloader.themeSetting", "solarized");
    await expect(loadThemeSetting()).resolves.toBe("system");
  });
});

describe("saveThemeSetting", () => {
  it("persists the setting under the expected key", async () => {
    await saveThemeSetting("dark");
    await expect(AsyncStorage.getItem("contentdownloader.themeSetting")).resolves.toBe("dark");
  });
});
