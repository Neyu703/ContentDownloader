import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { de } from "./locales/de";
import { en } from "./locales/en";

export const resources = { de: { translation: de }, en: { translation: en } } as const;
export const SUPPORTED_LANGUAGES = ["de", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Initializes i18next with a language already resolved by the caller (see languagePreference.ts) — never call before that, or strings flash in English first. */
export function initI18n(initialLanguage: SupportedLanguage): typeof i18n {
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      resources,
      lng: initialLanguage,
      fallbackLng: "en",
      interpolation: { escapeValue: false }, // React Native has no HTML injection risk
      compatibilityJSON: "v4",
    });
  } else {
    i18n.changeLanguage(initialLanguage);
  }
  return i18n;
}

export default i18n;
