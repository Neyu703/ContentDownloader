import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme, type ColorSchemeName } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "./colors";
import { loadThemeSetting, saveThemeSetting, type ThemeSetting } from "./themePreference";

interface ThemeContextValue {
  colors: ThemeColors;
  themeSetting: ThemeSetting;
  setThemeSetting: (setting: ThemeSetting) => void;
}

// Default (used by any component rendered outside a ThemeProvider, e.g. an isolated component
// test): the app's original, always-dark palette, with a no-op setter. ThemeProvider below
// replaces this with the real system-scheme-aware, persisted value for the actual app.
const defaultThemeContextValue: ThemeContextValue = {
  colors: darkColors,
  themeSetting: "system",
  setThemeSetting: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(defaultThemeContextValue);

/**
 * Resolves a saved setting ("system" | "light" | "dark") into the concrete palette to render.
 * Anything other than exactly "light" (including "dark", "unspecified", or an unknown system
 * scheme) falls back to the dark palette, matching the app's original always-dark default.
 */
function resolveColors(themeSetting: ThemeSetting, systemScheme: ColorSchemeName): ThemeColors {
  const scheme = themeSetting === "system" ? systemScheme : themeSetting;
  return scheme === "light" ? lightColors : darkColors;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>("system");

  useEffect(() => {
    loadThemeSetting().then(setThemeSettingState);
  }, []);

  function setThemeSetting(next: ThemeSetting): void {
    setThemeSettingState(next);
    saveThemeSetting(next);
  }

  const colors = resolveColors(themeSetting, systemScheme);
  const value = useMemo(() => ({ colors, themeSetting, setThemeSetting }), [colors, themeSetting]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
