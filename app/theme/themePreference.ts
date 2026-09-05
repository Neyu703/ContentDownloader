import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeSetting = "system" | "light" | "dark";

const STORAGE_KEY = "contentdownloader.themeSetting";

function isThemeSetting(value: string | null): value is ThemeSetting {
  return value === "system" || value === "light" || value === "dark";
}

/** Reads the user's saved theme preference, defaulting to "system" if none was ever saved. */
export async function loadThemeSetting(): Promise<ThemeSetting> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return isThemeSetting(stored) ? stored : "system";
}

/** Persists the user's theme preference for future launches. */
export async function saveThemeSetting(setting: ThemeSetting): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, setting);
}
