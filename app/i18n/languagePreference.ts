import * as Localization from "expo-localization";
import { createPersistedSetting } from "../lib/persistedSetting";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "./index";

export type LanguageSetting = "system" | SupportedLanguage;

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

const languageSetting = createPersistedSetting<LanguageSetting>("contentdownloader.languageSetting", {
  fallback: "system",
  parse: (raw) => (raw === "system" || isSupportedLanguage(raw) ? (raw as LanguageSetting) : null),
});

/** Reads the user's saved language preference, defaulting to "system" if none was ever saved. */
export const loadLanguageSetting = languageSetting.load;

/** Persists the user's language preference for future launches. */
export const saveLanguageSetting = languageSetting.save;

/** Picks the first device locale that's a supported language, falling back to English. */
export function resolveSystemLanguage(): SupportedLanguage {
  const locales = Localization.getLocales();
  const match = locales.find((locale) => isSupportedLanguage(locale.languageCode ?? ""));
  return match ? (match.languageCode as SupportedLanguage) : "en";
}

/** Resolves a saved setting ("system" | "de" | "en") into the concrete language i18next should use. */
export function resolveLanguage(setting: LanguageSetting): SupportedLanguage {
  return setting === "system" ? resolveSystemLanguage() : setting;
}
