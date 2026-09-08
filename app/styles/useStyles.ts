import { useMemo } from "react";
import { useTheme } from "../theme/ThemeContext";
import { useBackground } from "../backgrounds/BackgroundContext";
import { makeStyles } from "./index";

/** Builds the app's StyleSheet for the current theme and background state, memoized so it only rebuilds when either changes. */
export function useStyles() {
  const { colors } = useTheme();
  const { isActive } = useBackground();
  return useMemo(() => makeStyles(colors, isActive), [colors, isActive]);
}
