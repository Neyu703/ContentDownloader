import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Wraps a single AsyncStorage-backed setting: `load()` reads it back, falling back to `fallback`
 * when nothing is stored or `parse` rejects the stored raw string; `save()` writes it, via
 * `serialize` if given (defaults to `String(value)`, which round-trips a plain string/string-union
 * `T` unchanged — pass an explicit `serialize` for anything else, e.g. `JSON.stringify` for an
 * object-shaped `T`). Kept out of lib/format.ts on purpose — that module is imported widely by
 * code with no AsyncStorage mock in its tests, and pulling the native module in there broke them.
 */
export function createPersistedSetting<T>(
  key: string,
  options: { fallback: T; parse: (raw: string) => T | null; serialize?: (value: T) => string }
): { load(): Promise<T>; save(value: T): Promise<void> } {
  const serialize = options.serialize ?? ((value: T) => String(value));
  return {
    async load(): Promise<T> {
      const stored = await AsyncStorage.getItem(key);
      if (stored === null) return options.fallback;
      return options.parse(stored) ?? options.fallback;
    },
    async save(value: T): Promise<void> {
      await AsyncStorage.setItem(key, serialize(value));
    },
  };
}
