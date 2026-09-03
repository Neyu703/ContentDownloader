import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "contentdownloader.lastSeenVersion";

/** Reads the last app version the user has seen the changelog for, or null if never recorded. */
export async function getLastSeenVersion(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

/** Records the given version as seen. */
export async function setLastSeenVersion(version: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, version);
}

/**
 * Compares the persisted last-seen version against the current build version, always persisting
 * `currentVersion` afterward so the next launch compares correctly. Returns true only when a
 * stored value already existed and differs from `currentVersion` — never on a fresh install
 * (no stored value yet), so the changelog only auto-shows after a genuine update.
 */
export async function checkForVersionUpdate(currentVersion: string): Promise<boolean> {
  const stored = await getLastSeenVersion();
  await setLastSeenVersion(currentVersion);
  return stored !== null && stored !== currentVersion;
}
