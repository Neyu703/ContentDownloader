import AsyncStorage from "@react-native-async-storage/async-storage";
import { AUDIO_QUALITIES, VIDEO_QUALITIES } from "../lib/format";
import type { MediaFormat } from "./types";

export interface FormatPreference {
  format: MediaFormat;
  quality: string;
}

const STORAGE_KEY = "contentdownloader.formatPreference";

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

/** Reads the user's saved default format+quality, or null if none was ever saved (or it's no longer valid). */
export async function loadFormatPreference(): Promise<FormatPreference | null> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    return isFormatPreference(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persists the user's default format+quality so future launches start with it instead of the hardcoded default. */
export async function saveFormatPreference(preference: FormatPreference): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
}
