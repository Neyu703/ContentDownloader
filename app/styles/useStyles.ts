import { useMemo } from "react";
import { useTheme } from "../theme/ThemeContext";
import { useBackground } from "../backgrounds/BackgroundContext";
import { SIZE_SCALE_FACTORS } from "../display/displayPreferences";
import { useDisplayPreferences } from "../display/DisplayPreferencesContext";
import { makeStyles } from "./index";

/** Builds the app's StyleSheet for the current theme, background, and display-size preferences, memoized so it only rebuilds when one of those actually changes. */
export function useStyles() {
  const { colors } = useTheme();
  const { isActive } = useBackground();
  const { preferences } = useDisplayPreferences();
  const jobCardScale = SIZE_SCALE_FACTORS[preferences.jobCardSize];
  const formScale = SIZE_SCALE_FACTORS[preferences.formSize];
  return useMemo(
    () => makeStyles(colors, isActive, jobCardScale, formScale),
    [colors, isActive, jobCardScale, formScale]
  );
}
