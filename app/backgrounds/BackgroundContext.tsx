import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  loadBackgroundSetting,
  saveBackgroundSetting,
  NONE_BACKGROUND_ID,
  type BackgroundSetting,
} from "./backgroundPreference";

interface BackgroundContextValue {
  backgroundId: string;
  params: Record<string, unknown>;
  isActive: boolean;
  setBackground: (backgroundId: string, params: Record<string, unknown>) => void;
}

// Default (used by any component rendered outside a BackgroundProvider, e.g. an isolated component
// test): no background active, with a no-op setter — mirrors ThemeContext's default pattern.
const defaultBackgroundContextValue: BackgroundContextValue = {
  backgroundId: NONE_BACKGROUND_ID,
  params: {},
  isActive: false,
  setBackground: () => {},
};

const BackgroundContext = createContext<BackgroundContextValue>(defaultBackgroundContextValue);

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [setting, setSettingState] = useState<BackgroundSetting>({ backgroundId: NONE_BACKGROUND_ID, params: {} });

  useEffect(() => {
    loadBackgroundSetting().then(setSettingState);
  }, []);

  function setBackground(backgroundId: string, params: Record<string, unknown>): void {
    setSettingState({ backgroundId, params });
    saveBackgroundSetting({ backgroundId, params });
  }

  const isActive = setting.backgroundId !== NONE_BACKGROUND_ID;

  const value = useMemo(
    () => ({
      backgroundId: setting.backgroundId,
      params: setting.params,
      isActive,
      setBackground,
    }),
    [setting]
  );

  return <BackgroundContext.Provider value={value}>{children}</BackgroundContext.Provider>;
}

export function useBackground(): BackgroundContextValue {
  return useContext(BackgroundContext);
}
