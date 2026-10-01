import { createPersistedSetting } from "../lib/persistedSetting";

export type SizeLevel = "original" | "comfortable" | "spacious";

export const SIZE_SCALE_FACTORS: Record<SizeLevel, number> = {
  original: 1,
  comfortable: 1.15,
  spacious: 1.35,
};

export type DebugFieldId = "progress" | "downloaded" | "estimatedSize" | "speed" | "eta" | "runningSince" | "rawStatus";

export const DEBUG_FIELD_IDS: DebugFieldId[] = [
  "progress",
  "downloaded",
  "estimatedSize",
  "speed",
  "eta",
  "runningSince",
  "rawStatus",
];

export type DebugFieldsVisibility = Record<DebugFieldId, boolean>;

export interface DisplayPreferences {
  jobCardSize: SizeLevel;
  formSize: SizeLevel;
  debugFields: DebugFieldsVisibility;
}

export const DEFAULT_DEBUG_FIELDS: DebugFieldsVisibility = {
  progress: true,
  downloaded: true,
  estimatedSize: true,
  speed: true,
  eta: true,
  runningSince: true,
  rawStatus: true,
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  jobCardSize: "original",
  formSize: "original",
  debugFields: DEFAULT_DEBUG_FIELDS,
};

function isSizeLevel(value: unknown): value is SizeLevel {
  return value === "original" || value === "comfortable" || value === "spacious";
}

/**
 * Merges a possibly-partial/corrupt stored debugFields object onto the defaults, one field at a
 * time — so a field added in a future release (missing from an older save) defaults to visible
 * instead of silently disappearing, and one corrupt field doesn't invalidate the other six.
 */
function mergeDebugFields(value: unknown): DebugFieldsVisibility {
  const stored = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const merged = {} as DebugFieldsVisibility;
  for (const id of DEBUG_FIELD_IDS) {
    merged[id] = typeof stored[id] === "boolean" ? stored[id] : DEFAULT_DEBUG_FIELDS[id];
  }
  return merged;
}

const displaySetting = createPersistedSetting<DisplayPreferences>("contentdownloader.displayPreferences", {
  fallback: DEFAULT_DISPLAY_PREFERENCES,
  parse: (raw) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      const { jobCardSize, formSize, debugFields } = parsed as Record<string, unknown>;
      return {
        jobCardSize: isSizeLevel(jobCardSize) ? jobCardSize : DEFAULT_DISPLAY_PREFERENCES.jobCardSize,
        formSize: isSizeLevel(formSize) ? formSize : DEFAULT_DISPLAY_PREFERENCES.formSize,
        debugFields: mergeDebugFields(debugFields),
      };
    } catch {
      return null;
    }
  },
  serialize: (value) => JSON.stringify(value),
});

/** Reads the user's saved display preferences, defaulting to today's unchanged look/behavior if none were ever saved. */
export const loadDisplayPreferences = displaySetting.load;

/** Persists the user's display preferences for future launches. */
export const saveDisplayPreferences = displaySetting.save;
