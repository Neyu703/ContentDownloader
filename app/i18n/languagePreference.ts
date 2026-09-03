import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "./index";

export type LanguageSetting = "system" | SupportedLanguage;

const STORAGE_KEY = "contentdownloader.languageSetting";

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function isLanguageSetting(value: string | null): value is LanguageSetting {
  return value === "system" || (value !== null && isSupportedLanguage(value));
}

/** Reads the user's saved language preference, defaulting to "system" if none was ever saved. */
export async function loadLanguageSetting(): Promise<LanguageSetting> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return isLanguageSetting(stored) ? stored : "system";
}

/** Persists the user's language preference for future launches. */
export async function saveLanguageSetting(setting: LanguageSetting): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, setting);
}

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
