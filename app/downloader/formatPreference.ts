import { AUDIO_QUALITIES, VIDEO_QUALITIES } from "../lib/format";
import { createPersistedSetting } from "../lib/persistedSetting";
import type { MediaFormat } from "./types";

export interface FormatPreference {
  format: MediaFormat;
  quality: string;
}

function isValidQuality(format: MediaFormat, quality: string): boolean {
  const validQualities: readonly string[] = format === "audio" ? AUDIO_QUALITIES : VIDEO_QUALITIES;
  return validQualities.includes(quality);
}

function isFormatPreference(value: unknown): value is FormatPreference {
  if (typeof value !== "object" || value === null) return false;
  const { format, quality } = value as Record<string, unknown>;
  if (format !== "audio" && format !== "video") return false;
  return typeof quality === "string" && isValidQuality(format, quality);
}

const formatSetting = createPersistedSetting<FormatPreference | null>("contentdownloader.formatPreference", {
  fallback: null,
  parse: (raw) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isFormatPreference(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  serialize: (value) => JSON.stringify(value),
});

/** Reads the user's saved default format+quality, or null if none was ever saved (or it's no longer valid). */
export const loadFormatPreference = formatSetting.load;

/** Persists the user's default format+quality so future launches start with it instead of the hardcoded default. */
export const saveFormatPreference = (preference: FormatPreference): Promise<void> => formatSetting.save(preference);
