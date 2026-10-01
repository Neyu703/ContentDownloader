import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEBUG_FIELD_IDS,
  DEFAULT_DISPLAY_PREFERENCES,
  loadDisplayPreferences,
  saveDisplayPreferences,
  type DebugFieldId,
  type DebugFieldsVisibility,
  type DisplayPreferences,
  type SizeLevel,
} from "./displayPreferences";

interface DisplayPreferencesContextValue {
  preferences: DisplayPreferences;
  setJobCardSize: (size: SizeLevel) => void;
  setFormSize: (size: SizeLevel) => void;
  setDebugFieldVisible: (field: DebugFieldId, visible: boolean) => void;
  setAllDebugFieldsVisible: (visible: boolean) => void;
}

// Default (used by any component rendered outside a DisplayPreferencesProvider, e.g. an isolated
// component test): today's exact behavior — original size, every debug field visible — with
// no-op setters. DisplayPreferencesProvider below replaces this with the real persisted value.
const defaultDisplayPreferencesContextValue: DisplayPreferencesContextValue = {
  preferences: DEFAULT_DISPLAY_PREFERENCES,
  setJobCardSize: () => {},
  setFormSize: () => {},
  setDebugFieldVisible: () => {},
  setAllDebugFieldsVisible: () => {},
};

const DisplayPreferencesContext = createContext<DisplayPreferencesContextValue>(defaultDisplayPreferencesContextValue);

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<DisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES);

  useEffect(() => {
    loadDisplayPreferences().then(setPreferencesState);
  }, []);

  function persist(next: DisplayPreferences): void {
    setPreferencesState(next);
    saveDisplayPreferences(next);
  }

  function setJobCardSize(size: SizeLevel): void {
    persist({ ...preferences, jobCardSize: size });
  }

  function setFormSize(size: SizeLevel): void {
    persist({ ...preferences, formSize: size });
  }

  function setDebugFieldVisible(field: DebugFieldId, visible: boolean): void {
    persist({ ...preferences, debugFields: { ...preferences.debugFields, [field]: visible } });
  }

  function setAllDebugFieldsVisible(visible: boolean): void {
    const debugFields = Object.fromEntries(DEBUG_FIELD_IDS.map((id) => [id, visible])) as DebugFieldsVisibility;
    persist({ ...preferences, debugFields });
  }

  const value = useMemo(
    () => ({ preferences, setJobCardSize, setFormSize, setDebugFieldVisible, setAllDebugFieldsVisible }),
    [preferences]
  );

  return <DisplayPreferencesContext.Provider value={value}>{children}</DisplayPreferencesContext.Provider>;
}

export function useDisplayPreferences(): DisplayPreferencesContextValue {
  return useContext(DisplayPreferencesContext);
}
