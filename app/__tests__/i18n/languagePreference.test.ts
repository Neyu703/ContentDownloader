import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import {
  loadLanguageSetting,
  resolveLanguage,
  resolveSystemLanguage,
  saveLanguageSetting,
} from "../../i18n/languagePreference";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));

/** Minimal stand-in for expo-localization's Locale — only languageCode matters to resolveSystemLanguage(). */
function fakeLocale(languageCode: string | null): Localization.Locale {
  return { languageCode } as unknown as Localization.Locale;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("loadLanguageSetting", () => {
  it("returns 'system' when nothing was ever saved", async () => {
    await expect(loadLanguageSetting()).resolves.toBe("system");
  });

  it("returns the stored setting when it's a supported language", async () => {
    await AsyncStorage.setItem("contentdownloader.languageSetting", "de");
    await expect(loadLanguageSetting()).resolves.toBe("de");
  });

  it("returns the stored setting when it's explicitly 'system'", async () => {
    await AsyncStorage.setItem("contentdownloader.languageSetting", "system");
    await expect(loadLanguageSetting()).resolves.toBe("system");
  });

  it("falls back to 'system' for a stored value that's neither 'system' nor a supported language", async () => {
    await AsyncStorage.setItem("contentdownloader.languageSetting", "fr");
    await expect(loadLanguageSetting()).resolves.toBe("system");
  });
});

describe("saveLanguageSetting", () => {
  it("persists the setting under the expected key", async () => {
    await saveLanguageSetting("en");
    await expect(AsyncStorage.getItem("contentdownloader.languageSetting")).resolves.toBe("en");
  });
});

describe("resolveSystemLanguage", () => {
  it("picks the first device locale that's a supported language", () => {
    jest.mocked(Localization.getLocales).mockReturnValue([fakeLocale("fr"), fakeLocale("de")]);
    expect(resolveSystemLanguage()).toBe("de");
  });

  it("falls back to 'en' when no device locale is supported", () => {
    jest.mocked(Localization.getLocales).mockReturnValue([fakeLocale("fr")]);
    expect(resolveSystemLanguage()).toBe("en");
  });

  it("falls back to 'en' when a locale's languageCode is null", () => {
    jest.mocked(Localization.getLocales).mockReturnValue([fakeLocale(null)]);
    expect(resolveSystemLanguage()).toBe("en");
  });
});

describe("resolveLanguage", () => {
  it("resolves 'system' via resolveSystemLanguage", () => {
    jest.mocked(Localization.getLocales).mockReturnValue([fakeLocale("de")]);
    expect(resolveLanguage("system")).toBe("de");
  });

  it("passes an explicit language setting through unchanged", () => {
    expect(resolveLanguage("en")).toBe("en");
  });
});
