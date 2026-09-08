import { createPersistedSetting } from "../lib/persistedSetting";

export const NONE_BACKGROUND_ID = "none";

export interface BackgroundSetting {
  backgroundId: string;
  params: Record<string, unknown>;
}

const DEFAULT_SETTING: BackgroundSetting = { backgroundId: NONE_BACKGROUND_ID, params: {} };

function isBackgroundSetting(value: unknown): value is BackgroundSetting {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as BackgroundSetting).backgroundId === "string" &&
    typeof (value as BackgroundSetting).params === "object" &&
    (value as BackgroundSetting).params !== null
  );
}

const backgroundSetting = createPersistedSetting<BackgroundSetting>("contentdownloader.backgroundSetting", {
  fallback: DEFAULT_SETTING,
  // JSON.parse can throw on a corrupted stored value, unlike the plain string-union checks other
  // preferences use — swallow that here so load() still resolves to the fallback instead of rejecting.
  parse: (raw) => {
    try {
      const parsed = JSON.parse(raw);
      return isBackgroundSetting(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  serialize: (value) => JSON.stringify(value),
});

/** Reads the user's saved background preference, defaulting to "none" if none was ever saved. */
export const loadBackgroundSetting = backgroundSetting.load;

/** Persists the user's background choice and its params for future launches (survives app updates too, since it's keyed by a fixed AsyncStorage key). */
export const saveBackgroundSetting = backgroundSetting.save;
