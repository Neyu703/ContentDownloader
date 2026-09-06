import { createPersistedSetting } from "../lib/persistedSetting";

export type ThemeSetting = "system" | "light" | "dark";

const themeSetting = createPersistedSetting<ThemeSetting>("contentdownloader.themeSetting", {
  fallback: "system",
  parse: (raw) => (raw === "system" || raw === "light" || raw === "dark" ? raw : null),
});

/** Reads the user's saved theme preference, defaulting to "system" if none was ever saved. */
export const loadThemeSetting = themeSetting.load;

/** Persists the user's theme preference for future launches. */
export const saveThemeSetting = themeSetting.save;
