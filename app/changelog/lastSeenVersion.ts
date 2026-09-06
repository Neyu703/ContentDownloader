import { createPersistedSetting } from "../lib/persistedSetting";

const lastSeenVersionSetting = createPersistedSetting<string | null>("contentdownloader.lastSeenVersion", {
  fallback: null,
  parse: (raw) => raw,
  // save() is only ever called via setLastSeenVersion(version: string) below, never with null.
  serialize: (value) => value!,
});

/** Reads the last app version the user has seen the changelog for, or null if never recorded. */
export const getLastSeenVersion = lastSeenVersionSetting.load;

/** Records the given version as seen. */
export const setLastSeenVersion = (version: string): Promise<void> => lastSeenVersionSetting.save(version);

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
